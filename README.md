# FreqRoom-multiple-devices-vibrating-at-the-same-frequency

> **FreqRoom**: Real-time System Audio Jamming Platform — Multiple devices vibrating at the exact same frequency in synchronized, bit-perfect stereo.

Built with **Next.js 14+ (App Router)**, **WebRTC API**, **Web Audio API DSP**, **PeerJS**, and **Tailwind CSS**. Designed for zero-config, zero-env-variable deployment on **Vercel**.

---

## ⚡ Core Architecture

```
                                 [ Browser WebRTC ]
                                          │
                  ┌───────────────────────┴───────────────────────┐
                  ▼                                               ▼
         [ Broadcaster Client ]                          [ Listener Clients ]
                  │                                               │
    navigator.mediaDevices.getDisplayMedia                        │
   (System Audio / Chrome Tab Audio)                              │
                  │                                               │
      Video Track Auto-Stripped                                   │
                  │                                               │
         SDP Munging for Hi-Fi Opus                               │
  (stereo=1; maxaveragebitrate=320000; cbr=1)                     │
                  │                                               │
                  └────────► WebRTC Peer Connection ──────────────┘
                                          │
                                 [ Web Audio DSP ]
                                          │
                   DelayNode (±500ms Drift Sync Offset)
                                          │
                             3-Band EQ BiquadFilterNodes
                             (Bass 250Hz, Mid 1kHz, Treble 4kHz)
                                          │
                               Master GainNode
                                          │
                             AnalyserNode (60fps Canvas)
                                          │
                               AudioDestinationNode
```

---

## 🚀 Key Features

* **Zero-Config Serverless Signaling**: Built with PeerJS for peer-to-peer data channels and media calls without running dedicated persistent WebSocket servers.
* **Spotify / Tab / DAW Audio Capture**: High-fidelity capture via `getDisplayMedia` with automatic video track disposal to transmit pure stereo audio.
* **Hi-Fi Stereo Opus SDP Munging**:
  ```
  stereo=1; sprop-stereo=1; maxaveragebitrate=320000; cbr=1; useinbandfec=1; usedtx=0
  ```
* **Multi-Device Latency Sync**: Manual `DelayNode` slider (-500ms to +500ms) to sync physical speakers in the same room and eliminate acoustic phasing.
* **Admin Aux Permission Queue**: Role-based access control (`ADMIN`, `BROADCASTER`, `LISTENER`) with real-time approval/denial of broadcast requests.
* **Studio Audio DSP**:
  * 3-band parametric EQ (Bass, Mid, Treble)
  * Peak dB meter with color thresholds
  * Output device selection via `AudioContext.setSinkId`
  * Bitrate selector (96kbps, 160kbps, 320kbps)
* **60fps Canvas Visualizer**: Switchable between spectrum frequency bars and oscilloscope waveform modes.
* **Ephemeral Room Chat & Floating Emoji Reactions**: Real-time feedback with animated floating emoji particles.

---

## 🛠️ Tech Stack

* **Framework:** Next.js 14+ (App Router)
* **Language:** TypeScript 5+
* **Signaling & WebRTC:** PeerJS (P2P mesh)
* **Audio Engine:** Web Audio API (`AudioContext`, `AnalyserNode`, `DelayNode`, `BiquadFilterNode`)
* **Styling:** Tailwind CSS with Glassmorphism
* **Animations:** Framer Motion
* **Icons:** Lucide React

---

## 📦 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Local Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Deploy to Vercel
Push to GitHub and deploy with a single click. **Zero environment variables required!**

---

## 📄 License
MIT

