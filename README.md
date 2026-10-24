# DLX — Download-X

A modern desktop download manager built with Electron, React, TypeScript, and Tailwind CSS.

DLX was built as a personal project inspired by download managers such as Free Download Manager and Internet Download Manager.

![Platform](https://img.shields.io/badge/Platform-Windows-blue)
![Electron](https://img.shields.io/badge/Electron-33-47848F)
![React](https://img.shields.io/badge/React-18-61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)

## Features

* **Multi-Threaded Accelerated Downloads** — Dynamic chunking using HTTP Range requests with up to 16 parallel connections per task.
* **Dynamic Work-Stealing Chunk Engine** — Automatically detects idle thread connections and splits remaining byte ranges on the fly, eliminating idle workers and ensuring continuous 100% bandwidth saturation.
* **YouTube 1080p Full HD Resolution** — Direct high-resolution streaming via adaptive formats across VISIONOS, iOS, and Android clients without quality downgrades.
* **Built-in ISO BMFF Transmuxer** — Automatically converts fragmented MP4 (`fMP4`) video and audio streams into standard, seekable ISO MP4 files (`ftypisom` + `moov` + `mdat`) with complete sample tables and metadata.
* **High-Speed BitTorrent Swarm Engine** — Supports magnet links, `.torrent` files, Local Peer Discovery (LSD), and parallel piece pipelining with up to 120 peer connections.
* **Global Speed Limiter & Presets** — Live bandwidth throttling with presets (0.5 MB/s, 1 MB/s, 2 MB/s, 5 MB/s, 10 MB/s) or custom MB/s limits.
* **Real-time Download Metrics** — Live transfer speed, ETA calculation, progress tracking, and active connection monitoring.
* **Multi-Select Bulk Actions** — Select multiple items to pause, resume, or delete in bulk.
* **Smart File Categorization & Deduplication** — Automatically detects and organizes files into dedicated categories, preventing accidental duplicate downloads.
* **Intelligent Title Resolution** — Automatically resolves video and document titles from page headers, oEmbed, and meta tags.
* **Minimalist Modern Interface** — Clean dark and light theme options with system auto-detection.

### File Categories

DLX automatically organizes downloads into specialized categories:

* **Torrents** (`.torrent`, magnet links)
* **Videos** (`.mp4`, `.mkv`, `.webm`, `.mov`, `.avi`, `.m4v`)
* **Music & Audio** (`.mp3`, `.m4a`, `.wav`, `.flac`, `.ogg`, `.opus`)
* **Documents** (`.pdf`, `.docx`, `.xlsx`, `.pptx`, `.txt`, `.csv`, `.epub`)
* **Images** (`.jpg`, `.png`, `.webp`, `.gif`, `.svg`, `.bmp`, `.avif`)
* **Archives** (`.zip`, `.rar`, `.7z`, `.tar`, `.gz`, `.iso`)
* **Programs & Executables** (`.exe`, `.msi`, `.dmg`, `.pkg`, `.appimage`, `.apk`)

## Tech Stack

* **Electron** — Desktop application
* **React** — User interface
* **TypeScript** — Application logic
* **Tailwind CSS** — Styling
* **Vite** — Development and build tooling

## Project Structure

```text
DLX/
├── src/
│   ├── main/
│   │   ├── engine/       # Download engine and multi-part logic
│   │   ├── manager/      # Download queue and persistence
│   │   └── index.ts      # Electron main process
│   │
│   ├── preload/          # Secure IPC bridge
│   │
│   └── renderer/
│       ├── components/   # React components
│       ├── utils/        # Helpers and formatters
│       ├── App.tsx       # Main application
│       └── index.css     # Global styles
│
├── release/              # Built application files
├── package.json
└── vite.config.ts
```

## Getting Started

### Requirements

* Node.js 18 or newer
* npm

### Installation

```bash
git clone https://github.com/kurui-ian/Download-X.git
cd Download-X
npm install
```

### Run in Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Packaging & Portable Build

```bash
# Package into Windows NSIS installer and portable standalone executable
npm run dist
```

## How It Works

DLX splits supported downloads into multiple parts and downloads them concurrently when the server supports HTTP Range requests.

Each download is managed by the download queue, while the Electron main process handles the actual file operations. The React renderer is responsible for displaying the queue, progress, categories, and controls.

### Performance Highlights

* **Pre-warmed Socket Pools**: Reusable HTTP/HTTPS keep-alive agents eliminate repetitive TCP and TLS handshakes across segmented chunks.
* **In-Place Non-blocking File Writes**: Segments stream directly to predetermined byte offsets on the target disk, eliminating high-memory post-download concatenation phases.
* **Throttled IPC Broadcasts**: Progress ticks are aggregated at 100ms intervals, preserving 60fps UI responsiveness during saturating gigabit transfers.

## Configuration & Settings

DLX provides granular controls accessible via the settings modal:

* `maxConcurrentDownloads` — Limits simultaneous active downloads to preserve bandwidth and system resources (default: 3).
* `defaultConnections` — Configures number of concurrent range connections per file (range: 1 - 32, default: 8).
* `speedLimitBytesPerSec` — Configures dynamic bandwidth throttling with quick presets.
* `monitorClipboard` — Automatically detects downloadable URLs and magnet links copied to the system clipboard.
* `minimizeToTray` — Keeps background transfers running silently in the system notification area.

## Browser Integration

DLX includes a browser extension for Chrome and Chromium-based browsers.

The extension can:

- Intercept browser downloads
- Send downloads directly to DLX
- Detect accessible video, audio and image resources
- Provide media download options
- Send torrent links to DLX

See [`browser-extension/README.md`](browser-extension/README.md) for installation and development instructions.

## Current Status

DLX is actively maintained. The core download acceleration and torrent engines are operational, with ongoing UX polish, expanded extension hooks, and platform portability improvements.

## License

This project is licensed under the MIT License.

