# DLX — Download-X

A modern desktop download manager built with Electron, React, TypeScript, and Tailwind CSS.

DLX was built as a personal project inspired by download managers such as Free Download Manager and Internet Download Manager.

![Platform](https://img.shields.io/badge/Platform-Windows-blue)
![Electron](https://img.shields.io/badge/Electron-33-47848F)
![React](https://img.shields.io/badge/React-18-61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)

## Features

* Multi-threaded downloads with support for up to 16 connections
* HTTP Range requests for faster downloads
* Real-time download progress and speed
* Pause, resume and retry downloads
* Automatic file categorization
* Duplicate download detection
* Clipboard integration
* Automatic file name detection
* Support for YouTube/oEmbed titles
* Open downloaded files or their containing folders
* Dark, modern desktop interface

### File Categories

DLX automatically organizes downloads into categories such as:

* Videos
* Music & Audio
* Documents
* Archives
* Programs & Executables

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

## How It Works

DLX splits supported downloads into multiple parts and downloads them concurrently when the server supports HTTP Range requests.

Each download is managed by the download queue, while the Electron main process handles the actual file operations. The React renderer is responsible for displaying the queue, progress, categories, and controls.

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

DLX is currently a work in progress. The core download functionality is working, but the application is still being improved, especially the user interface and overall user experience.

## License

This project is licensed under the MIT License.
