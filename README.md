# 🎵 AetherMP3 - Local YouTube to MP3 Converter

AetherMP3 is a premium, high-fidelity, and completely ad-free web application that downloads and transcodes YouTube videos to high-quality MP3 audio files directly on your machine.

Unlike typical online video converter websites, AetherMP3 runs entirely locally. It does not track your data, displays zero ads, requires no subscription, and automatically handles all conversion dependencies.

---

## ✨ Features

- **Ad-Free & Unlimited**: Perform as many conversions as you like without ads, popups, or duration limits.
- **Self-Healing Binary Integration**: Automatically downloads and executes the latest standalone macOS universal `yt-dlp` binary on launch. Bypasses the need for system Python 3.10+ installation.
- **Custom High-Fidelity Audio**: Choose between multiple output bitrates:
  - `320 kbps` (High Fidelity)
  - `256 kbps` (Excellent Quality)
  - `192 kbps` (Standard Quality)
  - `128 kbps` (Compact File Size)
- **Automatic Smart Cleanup**: Media streams and finalized MP3 files are automatically purged from local disk storage as soon as the file download completes, preserving your hard drive space.
- **Instant Metadata Fetching**: Enter or paste a link, and the app automatically retrieves and renders the video's high-res thumbnail, duration, and title.
- **Clean Premium UI**: Designed with transparent Glassmorphism modules, glowing inputs, HSL custom color spaces, micro-animations, and a responsive layout.
- **Localized Conversion Logs**: Stores recent conversion items inside the browser's local storage for easy re-download triggers.

---

## 🛠️ Tech Stack & Architecture

- **Frontend**: React 18, Vite, Lucide Icons, and Vanilla CSS (Glassmorphism & HSL customized themes).
- **Backend**: Express.js (Node.js) serving as the controller server.
- **Download engine**: `youtube-dl-exec` executing a localized standalone macOS `yt-dlp` executable.
- **Transcode engine**: `ffmpeg-static` supplying pre-compiled FFmpeg static binaries.

```
[Browser Client] <--- Proxy /api ---> [Express Server]
                                             |
                                    (yt-dlp & FFmpeg)
                                             |
                                   [Download & Transcode]
                                             |
[Direct Download] <--- Stream File <--- [Auto-Clean Cache]
```

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (Version 18.0.0 or higher recommended).
- **macOS** (Optimized for Apple Silicon `arm64` and Intel `x64`).

### 1. Clone & Install Dependencies
Clone the repository and install the standard NPM packages:
```bash
git clone https://github.com/Gustavo-Visual/Youtube-Converter.git
cd Youtube-Converter
npm install
```

### 2. Launch the Application
Start the concurrent development environment:
```bash
npm run dev
```

On execution, two parallel services will start:
- **Frontend Vite Server**: Ready at [http://localhost:3500/](http://localhost:3500/)
- **Backend Express Server**: Listening on [http://localhost:3501/](http://localhost:3501/)

Open **[http://localhost:3500/](http://localhost:3500/)** in your web browser to enjoy AetherMP3.

---

## 🔒 Security & Privacy

- **No Secrets**: AetherMP3 is completely self-contained. It stores no tracking scripts, requires no external proprietary API tokens, and stores zero sensitive authentication keys.
- **Safe open-source**: Free to publish, clone, modify, and host locally for personal use.

---

## 📄 License

Open-source and free for non-commercial personal use.
