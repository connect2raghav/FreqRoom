import type { AudioSettings, BitratePreset } from '@/lib/types';
import { clamp } from '@/lib/utils';

/**
 * Capture system/tab audio via getDisplayMedia.
 * Immediately strips the video track and returns an audio-only stream.
 */
export async function captureSystemAudio(): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: {
      echoCancellation: true,
      noiseSuppression: false,
      autoGainControl: false,
      sampleRate: 48000,
      channelCount: 2,
    },
  });

  // Remove & stop all video tracks — we only need audio
  stream.getVideoTracks().forEach((t) => {
    t.stop();
    stream.removeTrack(t);
  });

  if (stream.getAudioTracks().length === 0) {
    throw new Error(
      'No audio track was captured. Please make sure to enable "Share tab audio" or "Share system audio" when selecting what to share.',
    );
  }

  // Hint to browser encoder: high-fidelity music stream, prevent voice filtering & distortion
  stream.getAudioTracks().forEach((track) => {
    if ('contentHint' in track) {
      (track as any).contentHint = 'music';
    }
  });

  return stream;
}

/**
 * Munge an SDP string so the Opus codec is configured for high-fidelity stereo
 * at the requested bitrate with CBR and in-band FEC enabled.
 * Uses RFC-compliant line ordering so WebRTC setDescription never fails.
 */
export function mungeSDPForHiFi(sdp: string, bitrate: BitratePreset): string {
  try {
    const lines = sdp.split('\r\n');
    const result: string[] = [];

    // Discover the Opus payload type from `a=rtpmap:<pt> opus/48000/2`
    let opusPayloadType: string | null = null;
    for (const line of lines) {
      const match = line.match(/^a=rtpmap:(\d+)\s+opus\/48000/i);
      if (match) {
        opusPayloadType = match[1];
        break;
      }
    }

    const opusParams = [
      'stereo=1',
      'sprop-stereo=1',
      `maxaveragebitrate=${bitrate}`,
      'cbr=1',
      'useinbandfec=1',
      'usedtx=0',
    ].join('; ');

    let fmtpFound = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // RFC 4566 / 8866: b= lines MUST come AFTER c= lines in SDP
      if (line.startsWith('c=IN IP4') || line.startsWith('c=IN IP6')) {
        result.push(line);
        result.push(`b=AS:${Math.ceil(bitrate / 1000)}`);
        continue;
      }

      // Replace or augment the existing a=fmtp line for Opus
      if (opusPayloadType && line.startsWith(`a=fmtp:${opusPayloadType}`)) {
        fmtpFound = true;
        // Strip existing params we're overriding
        const paramsToOverride = [
          'stereo',
          'sprop-stereo',
          'maxaveragebitrate',
          'cbr',
          'useinbandfec',
          'usedtx',
        ];
        let existingParams = line.replace(/^a=fmtp:\d+\s*/, '');
        for (const key of paramsToOverride) {
          existingParams = existingParams.replace(
            new RegExp(`\\b${key}=\\S+;?\\s*`, 'gi'),
            '',
          );
        }
        existingParams = existingParams.replace(/;\s*$/, '').trim();

        const combined = existingParams
          ? `${existingParams}; ${opusParams}`
          : opusParams;
        result.push(`a=fmtp:${opusPayloadType} ${combined}`);
        continue;
      }

      result.push(line);
    }

    // If no fmtp line existed for opus, add one after the rtpmap line
    if (!fmtpFound && opusPayloadType) {
      const idx = result.findIndex((l) => l.startsWith(`a=rtpmap:${opusPayloadType}`));
      if (idx !== -1) {
        result.splice(idx + 1, 0, `a=fmtp:${opusPayloadType} ${opusParams}`);
      }
    }

    return result.join('\r\n');
  } catch (err) {
    console.warn('Failed to munge SDP, falling back to original:', err);
    return sdp;
  }
}

/**
 * Full Web Audio processing pipeline:
 * source → delay → bassEQ → midEQ → trebleEQ → gain → analyser → destination
 */
export class AudioPipeline {
  public readonly analyser: AnalyserNode;
  public readonly gainNode: GainNode;

  private readonly source: MediaStreamAudioSourceNode;
  private readonly delayNode: DelayNode;
  private readonly bassEQ: BiquadFilterNode;
  private readonly midEQ: BiquadFilterNode;
  private readonly trebleEQ: BiquadFilterNode;
  private readonly ctx: AudioContext;

  private readonly connectDestination: boolean;

  constructor(
    stream: MediaStream,
    audioContext: AudioContext,
    connectDestination: boolean = true,
  ) {
    this.ctx = audioContext;
    this.connectDestination = connectDestination;

    // Source
    this.source = audioContext.createMediaStreamSource(stream);

    // Delay (latency compensation, max 1 s)
    this.delayNode = audioContext.createDelay(1);
    this.delayNode.delayTime.value = 0;

    // EQ — low shelf
    this.bassEQ = audioContext.createBiquadFilter();
    this.bassEQ.type = 'lowshelf';
    this.bassEQ.frequency.value = 250;
    this.bassEQ.gain.value = 0;

    // EQ — peaking mid
    this.midEQ = audioContext.createBiquadFilter();
    this.midEQ.type = 'peaking';
    this.midEQ.frequency.value = 1000;
    this.midEQ.Q.value = 1.0;
    this.midEQ.gain.value = 0;

    // EQ — high shelf
    this.trebleEQ = audioContext.createBiquadFilter();
    this.trebleEQ.type = 'highshelf';
    this.trebleEQ.frequency.value = 4000;
    this.trebleEQ.gain.value = 0;

    // Gain
    this.gainNode = audioContext.createGain();
    this.gainNode.gain.value = 1;

    // Analyser
    this.analyser = audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;

    // Wire the graph
    this.source.connect(this.delayNode);
    this.delayNode.connect(this.bassEQ);
    this.bassEQ.connect(this.midEQ);
    this.midEQ.connect(this.trebleEQ);
    this.trebleEQ.connect(this.gainNode);
    this.gainNode.connect(this.analyser);
    if (this.connectDestination) {
      this.analyser.connect(audioContext.destination);
    }
  }

  /**
   * Apply partial audio settings to the pipeline.
   */
  updateSettings(settings: Partial<AudioSettings>): void {
    if (settings.masterVolume !== undefined || settings.isMuted !== undefined) {
      const vol = settings.masterVolume ?? this.gainNode.gain.value;
      const muted = settings.isMuted ?? false;
      this.gainNode.gain.value = muted ? 0 : vol;
    }

    if (settings.latencyOffset !== undefined) {
      this.delayNode.delayTime.value = clamp(settings.latencyOffset / 1000, 0, 1);
    }

    if (settings.eq) {
      if (settings.eq.bass !== undefined) {
        this.bassEQ.gain.value = settings.eq.bass;
      }
      if (settings.eq.mid !== undefined) {
        this.midEQ.gain.value = settings.eq.mid;
      }
      if (settings.eq.treble !== undefined) {
        this.trebleEQ.gain.value = settings.eq.treble;
      }
    }
  }

  /**
   * Return current frequency-domain data from the analyser.
   */
  getFrequencyData(): Uint8Array {
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }

  /**
   * Return current time-domain (waveform) data from the analyser.
   */
  getTimeDomainData(): Uint8Array {
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(data);
    return data;
  }

  /**
   * Compute peak level in dB from the current frequency data.
   */
  getPeakDb(): number {
    const data = this.getFrequencyData();
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i] > peak) {
        peak = data[i];
      }
    }
    // Byte frequency data is 0–255 mapping to -100 dB … 0 dB (roughly)
    if (peak === 0) return -Infinity;
    return (peak / 255) * 100 - 100;
  }

  /**
   * Disconnect every node in the pipeline and release resources.
   */
  destroy(): void {
    try {
      this.analyser.disconnect();
    } catch { /* already disconnected */ }
    try {
      this.gainNode.disconnect();
    } catch { /* already disconnected */ }
    try {
      this.trebleEQ.disconnect();
    } catch { /* already disconnected */ }
    try {
      this.midEQ.disconnect();
    } catch { /* already disconnected */ }
    try {
      this.bassEQ.disconnect();
    } catch { /* already disconnected */ }
    try {
      this.delayNode.disconnect();
    } catch { /* already disconnected */ }
    try {
      this.source.disconnect();
    } catch { /* already disconnected */ }
  }
}

/**
 * Create a vanilla RTCPeerConnection pre-configured with STUN servers.
 */
export function createPeerConnection(bitrate: BitratePreset): RTCPeerConnection {
  void bitrate; // available for future use; SDP munging is done via helpers
  return new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  });
}

/**
 * Create an SDP offer with HiFi Opus parameters.
 */
export async function createMungedOffer(
  pc: RTCPeerConnection,
  bitrate: BitratePreset,
): Promise<RTCSessionDescriptionInit> {
  const offer = await pc.createOffer();
  return {
    type: offer.type,
    sdp: offer.sdp ? mungeSDPForHiFi(offer.sdp, bitrate) : offer.sdp,
  };
}

/**
 * Create an SDP answer with HiFi Opus parameters.
 */
export async function createMungedAnswer(
  pc: RTCPeerConnection,
  bitrate: BitratePreset,
): Promise<RTCSessionDescriptionInit> {
  const answer = await pc.createAnswer();
  return {
    type: answer.type,
    sdp: answer.sdp ? mungeSDPForHiFi(answer.sdp, bitrate) : answer.sdp,
  };
}

/**
 * Pull RTT and jitter from the active peer connection stats.
 */
export async function getConnectionStats(
  pc: RTCPeerConnection,
): Promise<{ rtt: number; jitter: number }> {
  let rtt = 0;
  let jitter = 0;

  try {
    const stats = await pc.getStats();

    stats.forEach((report) => {
      if (
        report.type === 'candidate-pair' &&
        report.state === 'succeeded' &&
        report.currentRoundTripTime !== undefined
      ) {
        rtt = report.currentRoundTripTime * 1000; // seconds → ms
      }

      if (report.type === 'inbound-rtp' && report.jitter !== undefined) {
        jitter = report.jitter * 1000; // seconds → ms
      }
    });
  } catch {
    // Stats unavailable — return zeroes
  }

  return { rtt, jitter };
}
