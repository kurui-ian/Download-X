/**
 * DLX Browser Extension — Unobtrusive Shadow-DOM Media Overlay & Quality Selector (Phase 3, 5, 6)
 *
 * Renders:
 * 1. Unobtrusive floating "DLX ↓" button at the top-right of hovered video/audio/image elements
 *    (never covering Play/Pause/Volume/Fullscreen/Settings at the bottom).
 * 2. Draggable positioning + "×" hide button per media element.
 * 3. Quality & Format selector popover (Video, Audio, Image versions, Thumbnail).
 * 4. Duplicate detection prompt ([Open Existing] / [Download Anyway]).
 * 5. In-page Toast feedback for Context Menu and Magnet actions.
 */

(() => {
  if (window.__dlxMediaOverlayInitialized) return;
  window.__dlxMediaOverlayInitialized = true;

  const hiddenElements = new WeakSet();
  const customOffsets = new WeakMap(); // HTMLElement -> { dx, dy }

  let activeTargetEl = null;
  let activeMediaItem = null;
  let isPanelOpen = false;
  let isHoveringOverlay = false;
  let hideTimeout = null;
  let selectedOption = null;
  let showButtonSetting = true;

  // Create isolated Shadow DOM host
  const hostEl = document.createElement('div');
  hostEl.id = 'dlx-extension-shadow-host';
  hostEl.style.cssText =
    'position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483646; pointer-events: none;';
  document.documentElement.appendChild(hostEl);

  const shadow = hostEl.attachShadow({ mode: 'open' });

  const styleEl = document.createElement('style');
  styleEl.textContent = `
    * {
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif;
    }

    .dlx-btn-wrap {
      position: fixed;
      display: none;
      align-items: center;
      gap: 2px;
      background: rgba(9, 9, 11, 0.92);
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.22);
      border-radius: 999px;
      padding: 4px 10px 4px 10px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.02em;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.38);
      backdrop-filter: blur(8px);
      pointer-events: auto;
      user-select: none;
      transition: transform 0.14s ease, opacity 0.14s ease, background 0.14s ease;
      z-index: 2147483646;
    }

    .dlx-btn-wrap:hover {
      background: #000000;
      border-color: rgba(255, 255, 255, 0.45);
    }

    .dlx-drag-handle {
      cursor: grab;
      opacity: 0.55;
      padding-right: 4px;
      font-size: 10px;
      line-height: 1;
    }

    .dlx-drag-handle:active {
      cursor: grabbing;
    }

    .dlx-main-trigger {
      all: unset;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      padding: 1px 4px;
    }

    .dlx-badge-pill {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 10px;
      font-weight: 500;
      background: rgba(255, 255, 255, 0.14);
      padding: 1px 6px;
      border-radius: 999px;
      color: #e4e4e7;
    }

    .dlx-hide-btn {
      all: unset;
      cursor: pointer;
      margin-left: 4px;
      padding: 1px 4px;
      border-radius: 999px;
      color: #a1a1aa;
      font-size: 12px;
      line-height: 1;
    }

    .dlx-hide-btn:hover {
      color: #ffffff;
      background: rgba(255, 255, 255, 0.15);
    }

    .dlx-panel {
      position: fixed;
      display: none;
      width: 290px;
      max-height: 410px;
      overflow-y: auto;
      background: #09090b;
      color: #fafafa;
      border: 1px solid #27272a;
      border-radius: 14px;
      padding: 12px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55);
      pointer-events: auto;
      z-index: 2147483647;
    }

    .dlx-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 8px;
      border-bottom: 1px solid #27272a;
      margin-bottom: 8px;
    }

    .dlx-panel-brand {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.02em;
    }

    .dlx-logo-box {
      width: 18px;
      height: 18px;
      border-radius: 5px;
      background: #ffffff;
      color: #09090b;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 9px;
      font-weight: 900;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .dlx-close-panel {
      all: unset;
      cursor: pointer;
      color: #a1a1aa;
      font-size: 14px;
      padding: 2px 5px;
      border-radius: 6px;
    }

    .dlx-close-panel:hover {
      color: #ffffff;
      background: #18181b;
    }

    .dlx-media-title {
      font-size: 12px;
      font-weight: 600;
      color: #ffffff;
      margin-bottom: 3px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      line-height: 1.35;
    }

    .dlx-media-sub {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 10px;
      color: #a1a1aa;
      margin-bottom: 10px;
    }

    .dlx-section-title {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #71717a;
      margin: 8px 0 4px 0;
      padding-bottom: 3px;
      border-bottom: 1px solid #18181b;
    }

    .dlx-opt-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .dlx-opt-row {
      all: unset;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 8px;
      border-radius: 8px;
      border: 1px solid #27272a;
      background: #18181b;
      font-size: 11px;
      color: #e4e4e7;
      transition: all 0.12s ease;
    }

    .dlx-opt-row:hover {
      border-color: #52525b;
    }

    .dlx-opt-row.selected {
      background: #ffffff;
      color: #09090b;
      border-color: #ffffff;
      font-weight: 600;
    }

    .dlx-opt-meta {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 10px;
      opacity: 0.75;
    }

    .dlx-protected-box {
      padding: 8px 10px;
      border-radius: 8px;
      background: #18181b;
      border: 1px solid #27272a;
      color: #d4d4d8;
      font-size: 11px;
      line-height: 1.4;
      margin-bottom: 8px;
    }

    .dlx-primary-btn {
      all: unset;
      cursor: pointer;
      width: 100%;
      box-sizing: border-box;
      margin-top: 10px;
      padding: 8px 12px;
      border-radius: 9px;
      background: #ffffff;
      color: #09090b;
      font-size: 11px;
      font-weight: 700;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: opacity 0.12s ease;
    }

    .dlx-primary-btn:hover {
      opacity: 0.9;
    }

    .dlx-dup-box {
      margin-top: 8px;
      padding: 9px;
      border-radius: 9px;
      background: #18181b;
      border: 1px solid #3f3f46;
      font-size: 11px;
    }

    .dlx-dup-title {
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 4px;
    }

    .dlx-dup-actions {
      display: flex;
      gap: 6px;
      margin-top: 7px;
    }

    .dlx-btn-sm {
      all: unset;
      cursor: pointer;
      flex: 1;
      text-align: center;
      padding: 5px 8px;
      border-radius: 7px;
      font-size: 10px;
      font-weight: 600;
      border: 1px solid #3f3f46;
      background: #27272a;
      color: #fafafa;
    }

    .dlx-btn-sm.primary {
      background: #ffffff;
      color: #09090b;
      border-color: #ffffff;
    }

    /* Toast Notification */
    .dlx-toast {
      position: fixed;
      top: 18px;
      right: 18px;
      width: 290px;
      background: #09090b;
      color: #fafafa;
      border: 1px solid #27272a;
      border-radius: 12px;
      padding: 11px 13px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
      pointer-events: auto;
      z-index: 2147483647;
      display: none;
    }

    .dlx-toast-title {
      font-size: 11px;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 2px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .dlx-toast-msg {
      font-size: 11px;
      color: #a1a1aa;
      line-height: 1.35;
    }
  `;
  shadow.appendChild(styleEl);

  // Floating button element
  const btnWrap = document.createElement('div');
  btnWrap.className = 'dlx-btn-wrap';
  btnWrap.innerHTML = `
    <span class="dlx-drag-handle" title="Drag to reposition">⋮⋮</span>
    <button class="dlx-main-trigger" type="button">
      <span>DLX ↓</span>
      <span class="dlx-badge-pill"></span>
    </button>
    <button class="dlx-hide-btn" type="button" title="Hide DLX button on this media">×</button>
  `;
  shadow.appendChild(btnWrap);

  // Popover panel element
  const panelEl = document.createElement('div');
  panelEl.className = 'dlx-panel';
  shadow.appendChild(panelEl);

  // Toast element
  const toastEl = document.createElement('div');
  toastEl.className = 'dlx-toast';
  shadow.appendChild(toastEl);

  let toastTimer = null;

  function formatBytesShort(bytes) {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  function showToast({ title, message, toastType, extraData }) {
    if (toastTimer) clearTimeout(toastTimer);
    toastEl.innerHTML = '';

    const titleRow = document.createElement('div');
    titleRow.className = 'dlx-toast-title';
    const titleSpan = document.createElement('span');
    titleSpan.textContent = title || 'DLX';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'dlx-close-panel';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => {
      toastEl.style.display = 'none';
    });
    titleRow.appendChild(titleSpan);
    titleRow.appendChild(closeBtn);

    const msgDiv = document.createElement('div');
    msgDiv.className = 'dlx-toast-msg';
    msgDiv.textContent = message || '';

    toastEl.appendChild(titleRow);
    toastEl.appendChild(msgDiv);

    if (toastType === 'duplicate' && extraData && extraData.task) {
      const actions = document.createElement('div');
      actions.className = 'dlx-dup-actions';

      const openBtn = document.createElement('button');
      openBtn.className = 'dlx-btn-sm primary';
      openBtn.textContent = 'Open Existing';
      openBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({
          type: 'dlx:open-existing',
          taskId: extraData.task.id,
          openFile: extraData.task.status === 'completed',
        });
        toastEl.style.display = 'none';
      });

      const redownloadBtn = document.createElement('button');
      redownloadBtn.className = 'dlx-btn-sm';
      redownloadBtn.textContent = 'Download Anyway';
      redownloadBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({
          type: 'dlx:send-download',
          payload: {
            type: 'addDownload',
            url: extraData.url,
            forceRedownload: true,
          },
        });
        toastEl.style.display = 'none';
      });

      actions.appendChild(openBtn);
      actions.appendChild(redownloadBtn);
      toastEl.appendChild(actions);
    } else if (extraData && extraData.offline) {
      const actions = document.createElement('div');
      actions.className = 'dlx-dup-actions';
      const launchBtn = document.createElement('button');
      launchBtn.className = 'dlx-btn-sm primary';
      launchBtn.textContent = 'Open DLX';
      launchBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'dlx:open-app' });
        toastEl.style.display = 'none';
      });
      actions.appendChild(launchBtn);
      toastEl.appendChild(actions);
    }

    toastEl.style.display = 'block';
    toastTimer = setTimeout(() => {
      toastEl.style.display = 'none';
    }, 5500);
  }

  window.addEventListener('dlx:toast-event', (e) => {
    if (e.detail) showToast(e.detail);
  });

  // Position button at top-right of target media element (away from bottom player controls)
  function updateOverlayPosition() {
    if (!activeTargetEl || !showButtonSetting || hiddenElements.has(activeTargetEl)) {
      btnWrap.style.display = 'none';
      panelEl.style.display = 'none';
      return;
    }

    const rect = activeTargetEl.getBoundingClientRect();
    if (rect.width < 120 || rect.height < 40 || rect.bottom < 0 || rect.top > window.innerHeight) {
      btnWrap.style.display = 'none';
      panelEl.style.display = 'none';
      return;
    }

    const offset = customOffsets.get(activeTargetEl) || { dx: 0, dy: 0 };
    const topPos = Math.max(8, Math.min(window.innerHeight - 40, rect.top + 10 + offset.dy));
    const leftPos = Math.max(8, Math.min(window.innerWidth - 150, rect.right - 135 + offset.dx));

    btnWrap.style.top = `${Math.round(topPos)}px`;
    btnWrap.style.left = `${Math.round(leftPos)}px`;
    btnWrap.style.display = 'inline-flex';

    if (isPanelOpen) {
      const panelTop = Math.min(window.innerHeight - 360, Math.round(topPos) + 34);
      const panelLeft = Math.max(8, Math.min(window.innerWidth - 300, Math.round(leftPos) - 150));
      panelEl.style.top = `${Math.max(8, panelTop)}px`;
      panelEl.style.left = `${panelLeft}px`;
      panelEl.style.display = 'block';
    } else {
      panelEl.style.display = 'none';
    }
  }

  // Dragging support so user can move the DLX button if needed
  const dragHandle = btnWrap.querySelector('.dlx-drag-handle');
  dragHandle.addEventListener('mousedown', (e) => {
    if (!activeTargetEl) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const initial = customOffsets.get(activeTargetEl) || { dx: 0, dy: 0 };

    const onMove = (moveEv) => {
      customOffsets.set(activeTargetEl, {
        dx: initial.dx + (moveEv.clientX - startX),
        dy: initial.dy + (moveEv.clientY - startY),
      });
      updateOverlayPosition();
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  // Hide button for current element
  const hideBtn = btnWrap.querySelector('.dlx-hide-btn');
  hideBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (activeTargetEl) {
      hiddenElements.add(activeTargetEl);
    }
    isPanelOpen = false;
    btnWrap.style.display = 'none';
    panelEl.style.display = 'none';
  });

  // Keep visible when hovering button or panel
  btnWrap.addEventListener('mouseenter', () => {
    isHoveringOverlay = true;
    if (hideTimeout) clearTimeout(hideTimeout);
  });
  btnWrap.addEventListener('mouseleave', () => {
    isHoveringOverlay = false;
    scheduleHideOverlay();
  });
  panelEl.addEventListener('mouseenter', () => {
    isHoveringOverlay = true;
    if (hideTimeout) clearTimeout(hideTimeout);
  });
  panelEl.addEventListener('mouseleave', () => {
    isHoveringOverlay = false;
    scheduleHideOverlay();
  });

  function scheduleHideOverlay() {
    if (hideTimeout) clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
      if (!isHoveringOverlay && !isPanelOpen) {
        btnWrap.style.display = 'none';
      }
    }, 650);
  }

  // Render the Quality / Format selector panel (Requirements #4, #5, #6, #7, #8, #11)
  function renderPanel(item, duplicateState = null) {
    panelEl.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'dlx-panel-header';
    header.innerHTML = `
      <div class="dlx-panel-brand">
        <span class="dlx-logo-box">DX</span>
        <span>Download with DLX</span>
      </div>
    `;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'dlx-close-panel';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => {
      isPanelOpen = false;
      panelEl.style.display = 'none';
    });
    header.appendChild(closeBtn);
    panelEl.appendChild(header);

    // Title & Metadata
    const titleEl = document.createElement('div');
    titleEl.className = 'dlx-media-title';
    titleEl.textContent = item.title || 'Media Item';
    panelEl.appendChild(titleEl);

    const subParts = [];
    if (item.mediaType) subParts.push(item.mediaType.toUpperCase());
    if (item.duration) subParts.push(item.duration);
    if (item.resolution) subParts.push(item.resolution);
    if (item.fileSize > 0) subParts.push(formatBytesShort(item.fileSize));

    const subEl = document.createElement('div');
    subEl.className = 'dlx-media-sub';
    subEl.textContent = subParts.join(' • ');
    panelEl.appendChild(subEl);

    // Collect all selectable options
    const videoOpts = item.videoOptions || [];
    const audioOpts = item.audioOptions || [];
    const imageOpts = item.imageOptions || [];
    const thumbOpts = item.thumbnailOptions || [];
    const allOpts = [...videoOpts, ...audioOpts, ...imageOpts, ...thumbOpts];

    if (item.protected) {
      const protBox = document.createElement('div');
      protBox.className = 'dlx-protected-box';
      protBox.textContent =
        item.protectedMessage || 'This media is protected or unavailable for download.';
      panelEl.appendChild(protBox);
    }

    if (!selectedOption || !allOpts.some((o) => o.url === selectedOption.url)) {
      selectedOption = allOpts[0] || null;
    }

    const renderOptionGroup = (groupTitle, opts) => {
      if (!opts || opts.length === 0) return;
      const secTitle = document.createElement('div');
      secTitle.className = 'dlx-section-title';
      secTitle.textContent = groupTitle;
      panelEl.appendChild(secTitle);

      const list = document.createElement('div');
      list.className = 'dlx-opt-list';

      for (const opt of opts) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = `dlx-opt-row ${selectedOption && selectedOption.url === opt.url ? 'selected' : ''}`;

        const leftSpan = document.createElement('span');
        leftSpan.textContent = opt.label
          ? opt.quality && !opt.quality.includes(opt.label)
            ? `${opt.label} (${opt.quality})`
            : opt.quality || opt.label
          : opt.quality || 'Original';

        const rightSpan = document.createElement('span');
        rightSpan.className = 'dlx-opt-meta';
        const metaTokens = [];
        if (opt.format) metaTokens.push(opt.format);
        if (opt.fileSize > 0) metaTokens.push(formatBytesShort(opt.fileSize));
        rightSpan.textContent = metaTokens.join(' • ');

        row.appendChild(leftSpan);
        row.appendChild(rightSpan);

        row.addEventListener('click', () => {
          selectedOption = opt;
          renderPanel(item, null);
        });

        list.appendChild(row);
      }

      panelEl.appendChild(list);
    };

    renderOptionGroup('Video', videoOpts);
    renderOptionGroup('Audio', audioOpts);
    renderOptionGroup('Image', imageOpts);
    renderOptionGroup('Thumbnail', thumbOpts);

    // Duplicate alert inside panel if detected
    if (duplicateState && duplicateState.duplicate && duplicateState.task) {
      const dupBox = document.createElement('div');
      dupBox.className = 'dlx-dup-box';
      dupBox.innerHTML = `
        <div class="dlx-dup-title">Download already exists</div>
        <div style="color:#a1a1aa;font-size:10px;">"${duplicateState.task.fileName}" (${duplicateState.task.status})</div>
      `;
      const actions = document.createElement('div');
      actions.className = 'dlx-dup-actions';

      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'dlx-btn-sm primary';
      openBtn.textContent = 'Open Existing';
      openBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({
          type: 'dlx:open-existing',
          taskId: duplicateState.task.id,
          openFile: duplicateState.task.status === 'completed',
        });
        isPanelOpen = false;
        panelEl.style.display = 'none';
      });

      const forceBtn = document.createElement('button');
      forceBtn.type = 'button';
      forceBtn.className = 'dlx-btn-sm';
      forceBtn.textContent = 'Download Anyway';
      forceBtn.addEventListener('click', () => {
        triggerDownloadOption(item, selectedOption, true);
      });

      actions.appendChild(openBtn);
      actions.appendChild(forceBtn);
      dupBox.appendChild(actions);
      panelEl.appendChild(dupBox);
      return;
    }

    if (selectedOption) {
      const dlBtn = document.createElement('button');
      dlBtn.type = 'button';
      dlBtn.className = 'dlx-primary-btn';
      const btnLabel =
        allOpts.length === 1 && selectedOption.quality && selectedOption.quality !== 'Original'
          ? `Download ${selectedOption.quality}`
          : selectedOption.kind === 'image' && item.mediaType === 'video'
          ? 'Download Image'
          : 'Download';
      dlBtn.textContent = btnLabel;
      dlBtn.addEventListener('click', () => {
        triggerDownloadOption(item, selectedOption, false);
      });
      panelEl.appendChild(dlBtn);
    }
  }

  async function triggerDownloadOption(item, opt, forceRedownload = false) {
    if (!opt || !opt.url) {
      showToast({
        title: 'Protected Media',
        message: 'This media is protected or unavailable for download.',
        toastType: 'error',
      });
      return;
    }

    // Build appropriate filename for the selected option
    const ext = (opt.format || 'mp4').toLowerCase() === 'jpeg' ? 'jpg' : (opt.format || 'mp4').toLowerCase();
    const safeTitle = (item.title || 'download')
      .replace(/[/\\?%*:|"<>]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
    const filename = `${safeTitle}.${ext}`;

    // If video has a separate companion audio stream and user selected video, attach secondaryAudioUrl
    const companionAudioUrl =
      opt.kind === 'video' && item.audioOptions && item.audioOptions.length > 0
        ? item.audioOptions[0].url
        : undefined;

    const res = await chrome.runtime.sendMessage({
      type: 'dlx:send-download',
      payload: {
        type: 'addMediaDownload',
        url: opt.url,
        filename,
        mimeType: opt.mimeType || item.mimeType,
        quality: opt.quality,
        fileSize: opt.fileSize || item.fileSize,
        mediaType: opt.kind || item.mediaType,
        secondaryAudioUrl: companionAudioUrl,
        sourcePageUrl: window.location.href,
        sourcePageTitle: document.title,
        forceRedownload,
      },
    });

    if (!res || !res.ok) {
      showToast({
        title: 'DLX Not Running',
        message: 'DLX desktop application is not running.',
        toastType: 'error',
        extraData: { offline: true },
      });
      return;
    }

    if (res.duplicate && res.task && !forceRedownload) {
      renderPanel(item, res);
      return;
    }

    isPanelOpen = false;
    panelEl.style.display = 'none';
    if (res.promptedInApp) {
      showToast({
        title: 'Confirm Download in DLX',
        message: `Confirm file name, size & save location for "${(res.task && res.task.fileName) || filename}" in DLX.`,
        toastType: 'info',
      });
    } else {
      showToast({
        title: 'Added to DLX',
        message: `"${(res.task && res.task.fileName) || filename}" sent to DLX queue.`,
        toastType: 'success',
      });
    }
  }

  // Click on main "DLX ↓" button
  const mainTrigger = btnWrap.querySelector('.dlx-main-trigger');
  mainTrigger.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!activeMediaItem) return;

    isPanelOpen = !isPanelOpen;
    if (isPanelOpen) {
      selectedOption = null;
      renderPanel(activeMediaItem);
    }
    updateOverlayPosition();
  });

  // Detect hover over video / audio / qualifying image elements
  document.addEventListener(
    'mouseover',
    (e) => {
      if (!showButtonSetting) return;
      const target = e.target;
      if (!target || !target.closest) return;

      const mediaEl = target.closest('video, audio, img');
      if (!mediaEl || hiddenElements.has(mediaEl)) return;

      const elToId = window.__dlxElementToItemId;
      const mediaMap = window.__dlxDetectedMediaMap;
      if (!elToId || !mediaMap) return;

      const itemId = elToId.get(mediaEl);
      if (!itemId) return;
      const item = mediaMap.get(itemId);
      if (!item) return;

      if (hideTimeout) clearTimeout(hideTimeout);

      if (activeTargetEl !== mediaEl) {
        activeTargetEl = mediaEl;
        activeMediaItem = item;
        isPanelOpen = false;
      } else {
        activeMediaItem = item;
      }

      // Update pill text (e.g., "720p" if single resolution, or count of options)
      const badgeEl = btnWrap.querySelector('.dlx-badge-pill');
      const totalOpts =
        (item.videoOptions ? item.videoOptions.length : 0) +
        (item.audioOptions ? item.audioOptions.length : 0) +
        (item.imageOptions ? item.imageOptions.length : 0);

      if (item.protected) {
        badgeEl.textContent = 'Protected';
      } else if (totalOpts === 1 && item.resolution) {
        badgeEl.textContent = `Download ${item.resolution}`;
      } else if (item.resolution) {
        badgeEl.textContent = item.resolution;
      } else {
        badgeEl.textContent = item.format || 'Media';
      }

      updateOverlayPosition();
    },
    { passive: true }
  );

  document.addEventListener(
    'mouseout',
    (e) => {
      const related = e.relatedTarget;
      if (related && activeTargetEl && activeTargetEl.contains(related)) {
        return;
      }
      scheduleHideOverlay();
    },
    { passive: true }
  );

  window.addEventListener('scroll', () => {
    if (btnWrap.style.display !== 'none') {
      requestAnimationFrame(updateOverlayPosition);
    }
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (btnWrap.style.display !== 'none') {
      requestAnimationFrame(updateOverlayPosition);
    }
  }, { passive: true });

  window.addEventListener('dlx:media-updated', (e) => {
    if (e.detail && e.detail.settings) {
      showButtonSetting = e.detail.settings.showMediaDownloadButton !== false;
      if (!showButtonSetting) {
        btnWrap.style.display = 'none';
        panelEl.style.display = 'none';
      }
    }
  });
})();
