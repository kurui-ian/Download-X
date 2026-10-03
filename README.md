# DLX — Modern Download Manager (Download-X)

A high-performance, multi-threaded download manager desktop application built with **Electron**, **React**, **TypeScript**, and **Tailwind CSS**.

![DLX](https://img.shields.io/badge/Platform-Windows-blue)
![Electron](https://img.shields.io/badge/Electron-33.x-47848F)
![React](https://img.shields.io/badge/React-18.x-61DAFB)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Features

- ⚡ **Multi-Part Accelerated Downloading**: Dynamic chunk splitting (up to 16 parallel threads) using HTTP Range headers for maximum bandwidth utilization.
- 📊 **Segmented Progress Visualizer**: Real-time visual progress bar showing chunk-by-chunk download activity and speeds.
- 📁 **Smart Category Organization**: Automatic detection and one-click filtering for:
  - 🎬 **Videos** (`.mp4`, `.mkv`, `.webm`, `.mov`, `.avi`, etc.)
  - 🎵 **Music & Audio** (`.mp3`, `.wav`, `.flac`, `.m4a`, etc.)
  - 📄 **Documents** (`.pdf`, `.docx`, `.txt`, `.xlsx`, etc.)
  - 📦 **Archives** (`.zip`, `.rar`, `.7z`, `.tar.gz`, etc.)
  - 💻 **Programs & Executables** (`.exe`, `.msi`, `.apk`, etc.)
- 🏷️ **Intelligent File Naming**:
  - Automatically fetches media titles from YouTube / oEmbed links (no more numeric hashes like `video_1839281.mp4`).
  - RFC 5987 / RFC 6266 `Content-Disposition` parsing for accurate server-provided filenames.
  - Query parameter title extraction (`title=`, `video_title=`, `song=`, `track=`, etc.).
  - Automatic extension resolution based on MIME types and stream formats.
- ⚠️ **Duplicate Detection**: Real-time URL normalization and duplicate link detection to prevent redundant downloads with "Open Existing" and "Download Anyway" options.
- 📋 **Clipboard Integration**: Instant "Paste from Clipboard" button for streamlined workflow.
- ⏯️ **Complete Task Controls**: Pause, resume, retry failed downloads, delete with or without file, open file, and show in folder.
- 🎨 **Sleek Modern UI**: Dark slate interface inspired by Free Download Manager (FDM) and Internet Download Manager (IDM).

---

## Project Structure

```
DLX/
├── src/
│   ├── main/                 # Electron main process
│   │   ├── engine/           # Downloader engine, inspector, multi-part logic
│   │   ├── manager/          # Download queue manager, persistence store
│   │   └── index.ts          # Main entrypoint, IPC handlers, tray
│   ├── preload/              # Secure contextBridge IPC bridge
│   └── renderer/             # React UI application
│       ├── components/       # UI components (Header, Sidebar, DownloadList, Modal)
│       ├── utils/            # Formatters, file icons
│       ├── App.tsx           # Main application state and layout
│       └── index.css         # Tailwind styles
├── release/                  # Packaged Windows desktop executable
├── package.json
└── vite.config.ts
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or newer)
- npm or yarn

### Installation

```bash
git clone https://github.com/kurui-ian/Download-X.git
cd Download-X
npm install
```

### Development Mode

Run both the Vite dev server and Electron in development mode:

```bash
npm run dev
```

### Build Executable

Compile TypeScript and bundle the application:

```bash
npm run build
```

---

## License

MIT License.
