# DLX Browser Extension (Manifest V3)

Official browser extension for **DLX (Download-X)** on Google Chrome, Microsoft Edge, Brave, and Chromium-based browsers.

The extension acts as a lightweight detection and communication layer that forwards downloads, media streams, and torrents directly to the DLX desktop application and its multi-threaded download engine.

---

## Features

1. **Automatic Download Interception**: Automatically captures normal browser downloads (`ZIP`, `EXE`, `PDF`, `ISO`, `.torrent`, etc.) and sends them to the DLX queue.
2. **Accessible Media Detection**: Event-driven detection of `<video>`, `<audio>`, and high-resolution `<img>` resources (filtering out tiny UI icons, logos, and tracking pixels).
3. **Unobtrusive Floating `DLX ↓` Button**: Appears at the top-right corner of hovered media elements without covering bottom playback controls (`Play`, `Pause`, `Volume`, `Fullscreen`, `Settings`). Can be dragged/repositioned or hidden with `×`.
4. **Quality & Format Selection**: Displays legitimately available video resolutions (`1080p`, `720p`, `480p`, `360p`), audio tracks (`Original`, `192 kbps`), image versions (`Original`, `Large`, `Thumbnail`), and video thumbnails.
5. **DRM & Security Compliance**: Respects protected/encrypted media (EME/MSE) and reports `"This media is protected or unavailable for download."` without attempting DRM circumvention.
6. **Right-Click Context Menus**:
   - `Download with DLX` (for links, `.torrent`, and `magnet:`)
   - `Download Image with DLX` (for images)
   - `Download Media with DLX` (for video and audio)
7. **Duplicate Detection Integration**: Uses DLX's existing duplicate detection and offers `[Open Existing]` or `[Download Anyway]`.

---

## Architecture & Native Messaging

```text
Chrome / Edge
      │
      ▼
DLX Browser Extension (Manifest V3)
      │
      ▼
Native Messaging Host (com.dlx.downloadmanager)
      │
      ▼
Electron Main Process (NativeBridgeServer on 127.0.0.1:45789)
      │
      ▼
DLX DownloadManager & Existing Download Engine (HTTP Multi-Part + WebTorrent)
```

When DLX starts on Windows, `NativeHostRegistrar` automatically creates the Native Messaging Host scripts in `%APPDATA%\dlx-download-manager\native-host` and registers the `com.dlx.downloadmanager` manifest under:
- `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.dlx.downloadmanager`
- `HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.dlx.downloadmanager`
- `HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.dlx.downloadmanager`

The extension's `manifest.json` includes a deterministic public `"key"` so its unpacked Extension ID is fixed (`poalfflpopjbfnhibkondgcgogpmgkbh`) and matches `allowed_origins` out of the box.

---

## Installation (Unpacked Development Mode)

1. Start the **DLX** desktop application (`DLX.exe` or `npm run dev`). This automatically registers the Native Messaging Host in Windows Registry.
2. Open Google Chrome or Microsoft Edge and navigate to:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the `browser-extension` folder inside this repository (`c:\Users\Kurui\Desktop\DLX\browser-extension`).
5. Pin the **DLX** extension icon to your browser toolbar.

---

## Protocol Reference

All messages sent across the boundary are validated by `src/main/bridge/protocolValidation.ts`.

Supported operations:
- `hello` / `ping` — Handshake verification
- `getStatus` — Check if DLX is running and retrieve queue counts + settings
- `getSettings` / `updateSettings` — Read or update browser integration toggles
- `checkDuplicate` — Query DLX's `DownloadManager.findDuplicate(url)`
- `addDownload` — Queue a normal file or `.torrent` / `magnet:` link
- `addMediaDownload` — Queue a detected video, audio, or image resource with quality/MIME metadata
- `openExistingTask` — Open an existing completed file or highlight it in DLX
- `openApplication` — Focus or launch the DLX desktop application
