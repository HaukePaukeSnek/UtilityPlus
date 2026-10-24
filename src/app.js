(function () {
  // DOM Elements
  const folderView = document.getElementById('folder-view');
  const lineupView = document.getElementById('lineup-view');
  const overviewView = document.getElementById('overview-view');
  const emptyState = document.getElementById('empty-state');

  const folderBreadcrumbs = document.getElementById('folder-breadcrumbs');
  const folderTitle = document.getElementById('folder-title');
  const folderList = document.getElementById('folder-list');

  const lineupBreadcrumbs = document.getElementById('lineup-breadcrumbs');
  const lineupCounter = document.getElementById('lineup-counter');
  const lineupTitle = document.getElementById('lineup-title');
  const lineupVideo = document.getElementById('lineup-video');
  const lineupImage = document.getElementById('lineup-image');
  const lineupTechnique = document.getElementById('lineup-technique');
  const lineupMovement = document.getElementById('lineup-movement');
  const lineupPrecision = document.getElementById('lineup-precision');
  const landingCanvas = document.getElementById('landing-canvas');

  const overviewBreadcrumbs = document.getElementById('overview-breadcrumbs');
  const overviewImg = document.getElementById('overview-img');
  const overviewImageContainer = document.getElementById('overview-image-container');
  const overviewEmptyState = document.getElementById('overview-empty-state');
  const overviewEmptyTitle = document.getElementById('overview-empty-title');
  const overviewBtnOpenFolder = document.getElementById('overview-btn-open-folder');
  const overviewEmptyOpenBtn = document.getElementById('overview-empty-open-btn');
  const btnLineupCallout = document.getElementById('btn-lineup-callout');

  // Offscreen video & token for landing spot frame capture
  let captureVideo = null;
  let currentCaptureId = 0;

  function updateLandingPreview(videoUrl) {
    const captureId = ++currentCaptureId;
    if (!landingCanvas) return;
    const ctx = landingCanvas.getContext('2d');

    if (!videoUrl) {
      if (captureVideo) {
        captureVideo.removeAttribute('src');
        captureVideo.load();
      }
      ctx.clearRect(0, 0, landingCanvas.width, landingCanvas.height);
      return;
    }

    if (!captureVideo) {
      captureVideo = document.createElement('video');
      captureVideo.muted = true;
      captureVideo.preload = 'auto';
      captureVideo.playsInline = true;
    }

    captureVideo.src = videoUrl;

    captureVideo.onloadedmetadata = () => {
      if (captureId !== currentCaptureId) return;
      const targetTime = Math.max(0, captureVideo.duration - 1.5);
      captureVideo.currentTime = targetTime;
    };

    captureVideo.onseeked = () => {
      if (captureId !== currentCaptureId) return;
      landingCanvas.width = captureVideo.videoWidth || 1920;
      landingCanvas.height = captureVideo.videoHeight || 1080;
      ctx.drawImage(captureVideo, 0, 0, landingCanvas.width, landingCanvas.height);
    };
  }

  // Enforce 1.5x playback speed on video events
  lineupVideo.addEventListener('play', () => { lineupVideo.playbackRate = 1.5; });
  lineupVideo.addEventListener('loadeddata', () => { lineupVideo.playbackRate = 1.5; });
  lineupVideo.addEventListener('canplay', () => { lineupVideo.playbackRate = 1.5; });

  // Application State
  let data = [];
  let currentLevel = 'maps'; // 'maps' | 'categories' | 'lineups' | 'overview'
  let previousLevelBeforeOverview = 'categories';
  let mapIndex = 0;
  let categoryIndex = 0;
  let lineupIndex = 0;
  let lastNavTime = 0;

  async function init() {
    loadSavedHotkeys();

    try {
      if (window.api && window.api.getLineupData) {
        data = await window.api.getLineupData();
      }
    } catch (err) {
      console.error('Fehler beim Laden der Lineup-Daten:', err);
    }

    if (!data || data.length === 0) {
      showEmptyState();
      return;
    }

    // Restore previous session if available
    try {
      const saved = JSON.parse(localStorage.getItem('cs2_nav_state') || '{}');
      if (typeof saved.mapIndex === 'number' && saved.mapIndex < data.length) {
        mapIndex = saved.mapIndex;
        const currentMap = data[mapIndex];
        const totalCatCount = 1 + (currentMap && currentMap.categories ? currentMap.categories.length : 0);
        if (typeof saved.categoryIndex === 'number' && currentMap && saved.categoryIndex < totalCatCount) {
          categoryIndex = saved.categoryIndex;
          if (categoryIndex > 0) {
            const currentCategory = currentMap.categories[categoryIndex - 1];
            if (typeof saved.lineupIndex === 'number' && currentCategory && saved.lineupIndex < currentCategory.lineups.length) {
              lineupIndex = saved.lineupIndex;
            }
          }
        }
      }
      if (['lineups', 'categories', 'maps', 'overview'].includes(saved.currentLevel)) {
        currentLevel = saved.currentLevel;
      }
    } catch (e) {}

    render();
  }

  function saveState() {
    try {
      localStorage.setItem('cs2_nav_state', JSON.stringify({
        currentLevel,
        mapIndex,
        categoryIndex,
        lineupIndex
      }));
    } catch (e) {}
  }

  function showEmptyState() {
    folderView.classList.remove('active');
    lineupView.classList.remove('active');
    if (overviewView) overviewView.classList.remove('active');
    emptyState.classList.add('active');
  }

  let lastNavAnim = '';

  function triggerAnimation(targetEl, animClass) {
    if (!targetEl || !animClass) return;
    targetEl.classList.remove('anim-next', 'anim-prev', 'anim-deeper', 'anim-higher');
    void targetEl.offsetWidth; // force DOM reflow
    targetEl.classList.add(animClass);
  }

  function render() {
    emptyState.classList.remove('active');

    if (currentLevel === 'maps') {
      renderMaps();
    } else if (currentLevel === 'categories') {
      renderCategories();
    } else if (currentLevel === 'lineups') {
      renderLineups();
    } else if (currentLevel === 'overview') {
      renderOverview();
    }

    // Apply snappy transitions
    if (lastNavAnim) {
      if (currentLevel === 'lineups') {
        const mediaContainer = document.querySelector('.media-container');
        const metaContainer = document.querySelector('.metadata-container');
        if (lastNavAnim === 'next') {
          triggerAnimation(lineupTitle, 'anim-next');
          triggerAnimation(mediaContainer, 'anim-next');
          triggerAnimation(metaContainer, 'anim-next');
        } else if (lastNavAnim === 'prev') {
          triggerAnimation(lineupTitle, 'anim-prev');
          triggerAnimation(mediaContainer, 'anim-prev');
          triggerAnimation(metaContainer, 'anim-prev');
        } else if (lastNavAnim === 'deeper') {
          triggerAnimation(lineupView, 'anim-deeper');
        }
      } else if (currentLevel === 'overview') {
        if (lastNavAnim === 'deeper') {
          triggerAnimation(overviewView, 'anim-deeper');
        } else if (lastNavAnim === 'higher') {
          triggerAnimation(overviewView, 'anim-higher');
        }
      } else {
        const folderContent = document.querySelector('.folder-content');
        if (lastNavAnim === 'deeper') {
          triggerAnimation(folderContent, 'anim-deeper');
        } else if (lastNavAnim === 'higher') {
          triggerAnimation(folderContent, 'anim-higher');
        }
      }
      lastNavAnim = '';
    }

    saveState();
  }

  function renderMaps() {
    const pauseBadge = document.getElementById('video-paused-badge');
    const pauseOverlay = document.getElementById('video-pause-overlay');
    if (pauseBadge) pauseBadge.style.display = 'none';
    if (pauseOverlay) pauseOverlay.style.display = 'none';

    lineupVideo.pause();
    lineupVideo.removeAttribute('src');
    lineupVideo.dataset.currentSrc = '';
    lineupVideo.load();
    updateLandingPreview(null);

    if (overviewView) overviewView.classList.remove('active');
    folderView.classList.add('active');
    lineupView.classList.remove('active');

    folderBreadcrumbs.textContent = 'KARTEN';
    folderTitle.textContent = 'Wähle eine Karte';

    folderList.innerHTML = '';
    data.forEach((map, index) => {
      const item = document.createElement('div');
      item.className = 'folder-item' + (index === mapIndex ? ' selected' : '');

      const name = document.createElement('span');
      name.className = 'folder-item-name';
      name.textContent = map.name;

      const meta = document.createElement('div');
      meta.className = 'folder-item-meta';

      const count = document.createElement('span');
      count.className = 'folder-item-count';
      const catCount = map.categories ? map.categories.length : 0;
      if (catCount === 0) {
        count.textContent = 'Übersichtskarte';
      } else {
        count.textContent = `${catCount} ${catCount === 1 ? 'Kategorie' : 'Kategorien'}`;
      }

      const arrow = document.createElement('span');
      arrow.className = 'folder-item-arrow';
      arrow.textContent = '→';

      meta.appendChild(count);
      meta.appendChild(arrow);

      item.appendChild(name);
      item.appendChild(meta);

      item.addEventListener('click', () => {
        mapIndex = index;
        navRight();
      });

      folderList.appendChild(item);
    });
  }

  function renderCategories() {
    const pauseBadge = document.getElementById('video-paused-badge');
    const pauseOverlay = document.getElementById('video-pause-overlay');
    if (pauseBadge) pauseBadge.style.display = 'none';
    if (pauseOverlay) pauseOverlay.style.display = 'none';

    lineupVideo.pause();
    lineupVideo.removeAttribute('src');
    lineupVideo.dataset.currentSrc = '';
    lineupVideo.load();
    updateLandingPreview(null);

    if (overviewView) overviewView.classList.remove('active');
    folderView.classList.add('active');
    lineupView.classList.remove('active');

    const currentMap = data[mapIndex];
    if (!currentMap) return;

    folderBreadcrumbs.textContent = `${currentMap.name.toUpperCase()} › KATEGORIEN`;
    folderTitle.textContent = 'Wähle eine Kategorie';

    folderList.innerHTML = '';

    // First item: Callout Map
    const calloutItem = document.createElement('div');
    calloutItem.className = 'folder-item folder-item-callout' + (categoryIndex === 0 ? ' selected' : '');

    const calloutName = document.createElement('span');
    calloutName.className = 'folder-item-name';
    calloutName.textContent = '🗺️ Übersichtskarte (Callouts)';

    const calloutMeta = document.createElement('div');
    calloutMeta.className = 'folder-item-meta';

    const calloutStatus = document.createElement('span');
    calloutStatus.className = 'folder-item-count';
    calloutStatus.textContent = currentMap.calloutImageUrl ? 'Karte bereit' : 'Screenshot fehlt';

    const calloutArrow = document.createElement('span');
    calloutArrow.className = 'folder-item-arrow';
    calloutArrow.textContent = '→';

    calloutMeta.appendChild(calloutStatus);
    calloutMeta.appendChild(calloutArrow);
    calloutItem.appendChild(calloutName);
    calloutItem.appendChild(calloutMeta);

    calloutItem.addEventListener('click', () => {
      categoryIndex = 0;
      previousLevelBeforeOverview = 'categories';
      currentLevel = 'overview';
      lastNavAnim = 'deeper';
      render();
    });

    folderList.appendChild(calloutItem);

    // Grenade Categories (indices 1 .. N)
    if (currentMap.categories) {
      currentMap.categories.forEach((cat, index) => {
        const itemIdx = index + 1;
        const item = document.createElement('div');
        item.className = 'folder-item' + (itemIdx === categoryIndex ? ' selected' : '');

        const name = document.createElement('span');
        name.className = 'folder-item-name';
        name.textContent = cat.name;

        const meta = document.createElement('div');
        meta.className = 'folder-item-meta';

        const count = document.createElement('span');
        count.className = 'folder-item-count';
        const lineCount = cat.lineups.length;
        count.textContent = `${lineCount} ${lineCount === 1 ? 'Lineup' : 'Lineups'}`;

        const arrow = document.createElement('span');
        arrow.className = 'folder-item-arrow';
        arrow.textContent = '→';

        meta.appendChild(count);
        meta.appendChild(arrow);

        item.appendChild(name);
        item.appendChild(meta);

        item.addEventListener('click', () => {
          categoryIndex = itemIdx;
          navRight();
        });

        folderList.appendChild(item);
      });
    }
  }

  function renderOverview() {
    const pauseBadge = document.getElementById('video-paused-badge');
    const pauseOverlay = document.getElementById('video-pause-overlay');
    if (pauseBadge) pauseBadge.style.display = 'none';
    if (pauseOverlay) pauseOverlay.style.display = 'none';

    lineupVideo.pause();
    lineupVideo.removeAttribute('src');
    lineupVideo.dataset.currentSrc = '';
    lineupVideo.load();
    updateLandingPreview(null);

    folderView.classList.remove('active');
    lineupView.classList.remove('active');
    if (overviewView) overviewView.classList.add('active');

    const currentMap = data[mapIndex];
    if (!currentMap) return;

    if (overviewBreadcrumbs) {
      overviewBreadcrumbs.textContent = `${currentMap.name.toUpperCase()} › ÜBERSICHTSKARTE`;
    }

    if (currentMap.calloutImageUrl) {
      if (overviewImageContainer) overviewImageContainer.style.display = 'flex';
      if (overviewEmptyState) overviewEmptyState.style.display = 'none';
      if (overviewImg) {
        if (overviewImg.dataset.currentSrc !== currentMap.calloutImageUrl) {
          overviewImg.dataset.currentSrc = currentMap.calloutImageUrl;
          overviewImg.src = currentMap.calloutImageUrl;
        }
      }
    } else {
      if (overviewImageContainer) overviewImageContainer.style.display = 'none';
      if (overviewEmptyState) overviewEmptyState.style.display = 'flex';
      if (overviewEmptyTitle) {
        overviewEmptyTitle.textContent = `Keine Übersichtskarte für ${currentMap.name} gefunden`;
      }
      if (overviewImg) {
        overviewImg.dataset.currentSrc = '';
        overviewImg.removeAttribute('src');
      }
    }
  }

  function renderLineups() {
    if (overviewView) overviewView.classList.remove('active');
    folderView.classList.remove('active');
    lineupView.classList.add('active');

    const currentMap = data[mapIndex];
    if (!currentMap || !currentMap.categories) return;
    const catIdx = categoryIndex > 0 ? categoryIndex - 1 : 0;
    const currentCategory = currentMap.categories[catIdx];
    if (!currentCategory) return;
    const currentLineup = currentCategory.lineups[lineupIndex];
    if (!currentLineup) return;

    lineupBreadcrumbs.textContent = `${currentMap.name.toUpperCase()} › ${currentCategory.name.toUpperCase()}`;
    lineupCounter.textContent = `${lineupIndex + 1} / ${currentCategory.lineups.length}`;
    lineupTitle.textContent = currentLineup.name;

    // Separate area for technique, movement and precision
    lineupTechnique.textContent = currentLineup.techniqueLabel || 'Standard';
    if (lineupMovement) lineupMovement.textContent = currentLineup.movementLabel || 'Standard';
    lineupPrecision.textContent = currentLineup.precisionLabel || 'Standard';

    // Update Video (Loop playback with 1.5x speed)
    const pauseBadge = document.getElementById('video-paused-badge');
    const pauseOverlay = document.getElementById('video-pause-overlay');
    if (pauseBadge) pauseBadge.style.display = 'none';
    if (pauseOverlay) pauseOverlay.style.display = 'none';

    lineupVideo.muted = true;
    lineupVideo.loop = true;
    lineupVideo.defaultPlaybackRate = 1.5;
    if (currentLineup.videoUrl) {
      if (lineupVideo.dataset.currentSrc !== currentLineup.videoUrl) {
        lineupVideo.dataset.currentSrc = currentLineup.videoUrl;
        lineupVideo.src = currentLineup.videoUrl;
        lineupVideo.playbackRate = 1.5;
        lineupVideo.load();
        lineupVideo.play().then(() => {
          lineupVideo.playbackRate = 1.5;
        }).catch((err) => {
          console.warn('Autoplay Fehler:', err);
        });
      } else {
        lineupVideo.playbackRate = 1.5;
      }
    } else {
      lineupVideo.dataset.currentSrc = '';
      lineupVideo.pause();
      lineupVideo.removeAttribute('src');
    }

    // Update Crosshair Image
    if (currentLineup.imageUrl) {
      if (lineupImage.dataset.currentSrc !== currentLineup.imageUrl) {
        lineupImage.dataset.currentSrc = currentLineup.imageUrl;
        lineupImage.src = currentLineup.imageUrl;
      }
    } else {
      lineupImage.dataset.currentSrc = '';
      lineupImage.removeAttribute('src');
    }

    // Update Landing Spot Frame Preview (1.5s before video end)
    updateLandingPreview(currentLineup.videoUrl);
    updateMediaTileSize();
  }

  // Navigation Logic
  function navRight() {
    lastNavAnim = 'deeper';
    if (currentLevel === 'maps') {
      const currentMap = data[mapIndex];
      if (currentMap) {
        currentLevel = 'categories';
        categoryIndex = 0;
        render();
      }
    } else if (currentLevel === 'categories') {
      const currentMap = data[mapIndex];
      if (!currentMap) return;

      if (categoryIndex === 0) {
        // Open Overview / Callouts
        previousLevelBeforeOverview = 'categories';
        currentLevel = 'overview';
        render();
      } else {
        const catIdx = categoryIndex - 1;
        const currentCategory = currentMap.categories ? currentMap.categories[catIdx] : null;
        if (currentCategory && currentCategory.lineups && currentCategory.lineups.length > 0) {
          currentLevel = 'lineups';
          if (lineupIndex >= currentCategory.lineups.length) {
            lineupIndex = 0;
          }
          render();
        }
      }
    }
  }

  function navLeft() {
    lastNavAnim = 'higher';
    if (currentLevel === 'overview') {
      currentLevel = previousLevelBeforeOverview || 'categories';
      render();
    } else if (currentLevel === 'lineups') {
      currentLevel = 'categories';
      render();
    } else if (currentLevel === 'categories') {
      currentLevel = 'maps';
      render();
    }
  }

  function navUp() {
    lastNavAnim = 'prev';
    if (currentLevel === 'maps') {
      mapIndex = (mapIndex - 1 + data.length) % data.length;
      categoryIndex = 0;
      lineupIndex = 0;
      render();
    } else if (currentLevel === 'categories') {
      const currentMap = data[mapIndex];
      const totalCatItems = 1 + (currentMap && currentMap.categories ? currentMap.categories.length : 0);
      categoryIndex = (categoryIndex - 1 + totalCatItems) % totalCatItems;
      lineupIndex = 0;
      render();
    } else if (currentLevel === 'lineups') {
      const currentMap = data[mapIndex];
      const catIdx = categoryIndex > 0 ? categoryIndex - 1 : 0;
      const currentCategory = currentMap && currentMap.categories ? currentMap.categories[catIdx] : null;
      if (currentCategory && currentCategory.lineups && currentCategory.lineups.length > 0) {
        const lineCount = currentCategory.lineups.length;
        lineupIndex = (lineupIndex - 1 + lineCount) % lineCount;
        render();
      }
    }
  }

  function navDown() {
    lastNavAnim = 'next';
    if (currentLevel === 'maps') {
      mapIndex = (mapIndex + 1) % data.length;
      categoryIndex = 0;
      lineupIndex = 0;
      render();
    } else if (currentLevel === 'categories') {
      const currentMap = data[mapIndex];
      const totalCatItems = 1 + (currentMap && currentMap.categories ? currentMap.categories.length : 0);
      categoryIndex = (categoryIndex + 1) % totalCatItems;
      lineupIndex = 0;
      render();
    } else if (currentLevel === 'lineups') {
      const currentMap = data[mapIndex];
      const catIdx = categoryIndex > 0 ? categoryIndex - 1 : 0;
      const currentCategory = currentMap && currentMap.categories ? currentMap.categories[catIdx] : null;
      if (currentCategory && currentCategory.lineups && currentCategory.lineups.length > 0) {
        const lineCount = currentCategory.lineups.length;
        lineupIndex = (lineupIndex + 1) % lineCount;
        render();
      }
    }
  }

  function handleDirection(dir) {
    const now = Date.now();
    if (now - lastNavTime < 75) return;
    lastNavTime = now;

    if (dir === 'up') navUp();
    else if (dir === 'down') navDown();
    else if (dir === 'left') navLeft();
    else if (dir === 'right') navRight();
  }

  // Hotkeys Management
  const DEFAULT_HOTKEYS = {
    playPause: { accelerator: 'num0', label: 'Numpad 0', domCode: 'Numpad0' },
    up: { accelerator: 'Up', label: '↑ Oben', domCode: 'ArrowUp' },
    down: { accelerator: 'Down', label: '↓ Unten', domCode: 'ArrowDown' },
    left: { accelerator: 'Left', label: '← Links', domCode: 'ArrowLeft' },
    right: { accelerator: 'Right', label: '→ Rechts', domCode: 'ArrowRight' }
  };

  let currentHotkeys = { ...DEFAULT_HOTKEYS };

  function loadSavedHotkeys() {
    try {
      const saved = localStorage.getItem('utilityplus_hotkeys');
      if (saved) {
        const parsed = JSON.parse(saved);
        currentHotkeys = { ...DEFAULT_HOTKEYS, ...parsed };
      }
    } catch (e) {}

    if (window.api && window.api.setHotkeys) {
      window.api.setHotkeys(currentHotkeys).catch(() => {});
    }

    updateHeaderShortcutHints();
    updateModalButtonLabels();
  }

  function saveHotkeys(newHotkeys) {
    currentHotkeys = { ...newHotkeys };
    try {
      localStorage.setItem('utilityplus_hotkeys', JSON.stringify(currentHotkeys));
    } catch (e) {}

    if (window.api && window.api.setHotkeys) {
      window.api.setHotkeys(currentHotkeys).catch(() => {});
    }

    updateHeaderShortcutHints();
    updateModalButtonLabels();
  }

  function keyEventToHotkey(e) {
    const code = e.code;
    const key = e.key;

    if (code === 'Numpad0') return { accelerator: 'num0', label: 'Numpad 0', domCode: 'Numpad0' };
    if (code === 'Numpad1') return { accelerator: 'num1', label: 'Numpad 1', domCode: 'Numpad1' };
    if (code === 'Numpad2') return { accelerator: 'num2', label: 'Numpad 2', domCode: 'Numpad2' };
    if (code === 'Numpad3') return { accelerator: 'num3', label: 'Numpad 3', domCode: 'Numpad3' };
    if (code === 'Numpad4') return { accelerator: 'num4', label: 'Numpad 4', domCode: 'Numpad4' };
    if (code === 'Numpad5') return { accelerator: 'num5', label: 'Numpad 5', domCode: 'Numpad5' };
    if (code === 'Numpad6') return { accelerator: 'num6', label: 'Numpad 6', domCode: 'Numpad6' };
    if (code === 'Numpad7') return { accelerator: 'num7', label: 'Numpad 7', domCode: 'Numpad7' };
    if (code === 'Numpad8') return { accelerator: 'num8', label: 'Numpad 8', domCode: 'Numpad8' };
    if (code === 'Numpad9') return { accelerator: 'num9', label: 'Numpad 9', domCode: 'Numpad9' };
    if (code === 'NumpadDecimal') return { accelerator: 'numdec', label: 'Numpad ,', domCode: 'NumpadDecimal' };
    if (code === 'NumpadAdd') return { accelerator: 'numadd', label: 'Numpad +', domCode: 'NumpadAdd' };
    if (code === 'NumpadSubtract') return { accelerator: 'numsub', label: 'Numpad -', domCode: 'NumpadSubtract' };
    if (code === 'NumpadMultiply') return { accelerator: 'nummult', label: 'Numpad *', domCode: 'NumpadMultiply' };
    if (code === 'NumpadDivide') return { accelerator: 'numdiv', label: 'Numpad /', domCode: 'NumpadDivide' };

    if (code === 'ArrowUp') return { accelerator: 'Up', label: '↑ Oben', domCode: 'ArrowUp' };
    if (code === 'ArrowDown') return { accelerator: 'Down', label: '↓ Unten', domCode: 'ArrowDown' };
    if (code === 'ArrowLeft') return { accelerator: 'Left', label: '← Links', domCode: 'ArrowLeft' };
    if (code === 'ArrowRight') return { accelerator: 'Right', label: '→ Rechts', domCode: 'ArrowRight' };

    if (code === 'Space') return { accelerator: 'Space', label: 'Leertaste', domCode: 'Space' };
    if (code === 'Enter' || code === 'NumpadEnter') return { accelerator: 'Return', label: 'Enter', domCode: code };
    if (code === 'Backspace') return { accelerator: 'Backspace', label: 'Rücktaste', domCode: 'Backspace' };
    if (code === 'Tab') return { accelerator: 'Tab', label: 'Tab', domCode: 'Tab' };
    if (code === 'Home') return { accelerator: 'Home', label: 'Pos 1', domCode: 'Home' };
    if (code === 'End') return { accelerator: 'End', label: 'Ende', domCode: 'End' };
    if (code === 'PageUp') return { accelerator: 'PageUp', label: 'Bild Auf', domCode: 'PageUp' };
    if (code === 'PageDown') return { accelerator: 'PageDown', label: 'Bild Ab', domCode: 'PageDown' };
    if (code === 'Insert') return { accelerator: 'Insert', label: 'Einfg', domCode: 'Insert' };
    if (code === 'Delete') return { accelerator: 'Delete', label: 'Entf', domCode: 'Delete' };

    if (code.startsWith('Key')) {
      const letter = code.replace('Key', '').toUpperCase();
      return { accelerator: letter, label: letter, domCode: code };
    }
    if (code.startsWith('Digit')) {
      const digit = code.replace('Digit', '');
      return { accelerator: digit, label: `Taste ${digit}`, domCode: code };
    }
    if (/^F\d+$/.test(code)) {
      return { accelerator: code, label: code, domCode: code };
    }

    const clean = (key.length === 1 ? key.toUpperCase() : key);
    return { accelerator: clean, label: clean, domCode: code || key };
  }

  function matchesHotkey(e, hotkey) {
    if (!hotkey) return false;
    if (hotkey.domCode && e.code === hotkey.domCode) return true;
    if (hotkey.accelerator && (e.key === hotkey.accelerator || e.code === hotkey.accelerator)) return true;
    if (hotkey.domCode === 'Numpad0' && (e.code === 'Numpad0' || (e.key === 'Insert' && e.location === 3))) return true;
    return false;
  }

  function togglePlayPause() {
    if (currentLevel !== 'lineups' || !lineupVideo) return;

    const pauseBadge = document.getElementById('video-paused-badge');
    const pauseOverlay = document.getElementById('video-pause-overlay');

    if (lineupVideo.paused) {
      lineupVideo.playbackRate = 1.5;
      lineupVideo.play().then(() => {
        lineupVideo.playbackRate = 1.5;
        if (pauseBadge) pauseBadge.style.display = 'none';
        if (pauseOverlay) pauseOverlay.style.display = 'none';
      }).catch(err => {
        console.warn('Play error:', err);
      });
    } else {
      lineupVideo.pause();
      if (pauseBadge) {
        const lbl = currentHotkeys.playPause ? currentHotkeys.playPause.label : 'NUM 0';
        pauseBadge.textContent = `PAUSIERT (${lbl.toUpperCase()})`;
        pauseBadge.style.display = 'block';
      }
      if (pauseOverlay) {
        pauseOverlay.style.display = 'flex';
      }
    }
  }

  // Options Modal & Key Recording Logic
  const optionsModal = document.getElementById('options-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalSaveBtn = document.getElementById('modal-save-btn');
  const modalResetBtn = document.getElementById('modal-reset-btn');

  let recordingAction = null;

  function openOptionsModal() {
    if (!optionsModal) return;
    stopRecording();
    updateModalButtonLabels();
    optionsModal.classList.add('active');
  }

  function closeOptionsModal() {
    if (!optionsModal) return;
    stopRecording();
    optionsModal.classList.remove('active');
  }

  function stopRecording() {
    if (!recordingAction) return;
    const btn = document.querySelector(`.key-bind-btn[data-action="${recordingAction}"]`);
    if (btn) btn.classList.remove('recording');
    updateModalButtonLabels();
    recordingAction = null;
  }

  function updateModalButtonLabels() {
    const actions = ['playPause', 'up', 'down', 'left', 'right'];
    actions.forEach(act => {
      const lbl = document.getElementById(`bind-lbl-${act}`);
      if (lbl && currentHotkeys[act]) {
        lbl.textContent = currentHotkeys[act].label || currentHotkeys[act].accelerator;
      }
    });
  }

  function updateHeaderShortcutHints() {
    const hintPause = document.getElementById('hint-key-pause');
    if (hintPause && currentHotkeys.playPause) {
      hintPause.textContent = currentHotkeys.playPause.label.replace('Numpad ', 'NUM ');
    }
    const hintUp = document.getElementById('hint-key-up');
    const folderHintUp = document.getElementById('hint-folder-up');
    if (currentHotkeys.up) {
      const upLbl = currentHotkeys.up.label.includes('Oben') ? '↑' : currentHotkeys.up.label;
      if (hintUp) hintUp.textContent = upLbl;
      if (folderHintUp) folderHintUp.textContent = upLbl;
    }
    const hintDown = document.getElementById('hint-key-down');
    const folderHintDown = document.getElementById('hint-folder-down');
    if (currentHotkeys.down) {
      const downLbl = currentHotkeys.down.label.includes('Unten') ? '↓' : currentHotkeys.down.label;
      if (hintDown) hintDown.textContent = downLbl;
      if (folderHintDown) folderHintDown.textContent = downLbl;
    }
    const hintLeft = document.getElementById('hint-key-left');
    const folderHintLeft = document.getElementById('hint-folder-left');
    if (currentHotkeys.left) {
      const leftLbl = currentHotkeys.left.label.includes('Links') ? '←' : currentHotkeys.left.label;
      if (hintLeft) hintLeft.textContent = leftLbl;
      if (folderHintLeft) folderHintLeft.textContent = leftLbl;
    }
    const folderHintRight = document.getElementById('hint-folder-right');
    if (folderHintRight && currentHotkeys.right) {
      folderHintRight.textContent = currentHotkeys.right.label.includes('Rechts') ? '→' : currentHotkeys.right.label;
    }
  }

  // Keyboard navigation when window has focus
  window.addEventListener('keydown', (e) => {
    if (recordingAction) {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        stopRecording();
        return;
      }

      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
        return;
      }

      const hotkeyObj = keyEventToHotkey(e);
      const updated = { ...currentHotkeys, [recordingAction]: hotkeyObj };
      saveHotkeys(updated);
      stopRecording();
      return;
    }

    if (optionsModal && optionsModal.classList.contains('active')) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeOptionsModal();
      }
      return;
    }

    if (matchesHotkey(e, currentHotkeys.playPause)) {
      e.preventDefault();
      togglePlayPause();
      return;
    }

    if (matchesHotkey(e, currentHotkeys.up)) {
      e.preventDefault();
      handleDirection('up');
    } else if (matchesHotkey(e, currentHotkeys.down)) {
      e.preventDefault();
      handleDirection('down');
    } else if (matchesHotkey(e, currentHotkeys.left) || e.key === 'Backspace' || e.key === 'Escape') {
      e.preventDefault();
      handleDirection('left');
    } else if (matchesHotkey(e, currentHotkeys.right) || e.key === 'Enter') {
      e.preventDefault();
      handleDirection('right');
    }
  });

  // Global hotkeys listener (dispatched from Electron main process even while in game)
  if (window.api && window.api.onGlobalNavigate) {
    window.api.onGlobalNavigate((direction) => {
      handleDirection(direction);
    });
  }

  if (window.api && window.api.onGlobalPlayPause) {
    window.api.onGlobalPlayPause(() => {
      togglePlayPause();
    });
  }

  // Auto-Update Banner Handling
  const updateBanner = document.getElementById('update-banner');
  const updateText = document.getElementById('update-text');
  const updateBtn = document.getElementById('update-btn');
  const updateClose = document.getElementById('update-close');

  let activeUpdateVersion = '';

  if (updateClose) {
    updateClose.addEventListener('click', () => {
      updateBanner.classList.remove('visible');
    });
  }

  if (updateBtn) {
    updateBtn.addEventListener('click', () => {
      if (window.api && window.api.restartAndInstallUpdate) {
        window.api.restartAndInstallUpdate();
      }
    });
  }

  if (window.api && window.api.onUpdateAvailable) {
    window.api.onUpdateAvailable((info) => {
      activeUpdateVersion = (info && info.version) || '';
      if (updateBanner && updateText) {
        updateText.textContent = `🚀 Update v${activeUpdateVersion} gefunden. Wird geladen...`;
        if (updateBtn) updateBtn.style.display = 'none';
        updateBanner.classList.add('visible');
      }
    });
  }

  if (window.api && window.api.onUpdateProgress) {
    window.api.onUpdateProgress((percent) => {
      if (updateBanner && updateText) {
        updateText.textContent = `🚀 Update v${activeUpdateVersion || ''} wird geladen... ${percent}%`;
        if (updateBtn) updateBtn.style.display = 'none';
        updateBanner.classList.add('visible');
      }
    });
  }

  if (window.api && window.api.onUpdateDownloaded) {
    window.api.onUpdateDownloaded((info) => {
      const v = (info && info.version) || activeUpdateVersion || '';
      if (updateBanner && updateText && updateBtn) {
        updateText.textContent = `✨ Update v${v} bereit!`;
        updateBtn.style.display = 'inline-block';
        updateBtn.textContent = 'Jetzt installieren';
        updateBanner.classList.add('visible');
      }
    });
  }

  if (window.api && window.api.onUpdateError) {
    window.api.onUpdateError((err) => {
      console.warn('AutoUpdate Fehler:', err);
      if (updateBanner && updateBanner.classList.contains('visible') && updateBtn && updateBtn.style.display === 'none') {
        if (updateText) updateText.textContent = `Update-Fehler: ${err || 'Unbekannt'}`;
        setTimeout(() => {
          if (updateBanner) updateBanner.classList.remove('visible');
        }, 5000);
      }
    });
  }

  let isRefreshing = false;

  async function refreshData(silent = false) {
    if (isRefreshing) return;
    isRefreshing = true;

    const refreshIcons = document.querySelectorAll('.icon-refresh');
    if (!silent) {
      refreshIcons.forEach(icon => icon.classList.add('spinning'));
    }

    try {
      if (window.api && window.api.getLineupData) {
        const newData = await window.api.getLineupData();

        if (newData && newData.length > 0) {
          // Attempt to keep previous location if valid
          const prevMapName = data && data[mapIndex] ? data[mapIndex].name : null;
          const prevCatName = data && data[mapIndex] && categoryIndex > 0 && data[mapIndex].categories && data[mapIndex].categories[categoryIndex - 1]
            ? data[mapIndex].categories[categoryIndex - 1].name : null;
          const prevLineupName = prevCatName && data[mapIndex].categories[categoryIndex - 1].lineups && data[mapIndex].categories[categoryIndex - 1].lineups[lineupIndex]
            ? data[mapIndex].categories[categoryIndex - 1].lineups[lineupIndex].name : null;

          data = newData;

          if (prevMapName) {
            const foundMapIdx = data.findIndex(m => m.name === prevMapName);
            if (foundMapIdx !== -1) {
              mapIndex = foundMapIdx;
              if (prevCatName && data[mapIndex].categories) {
                const foundCatIdx = data[mapIndex].categories.findIndex(c => c.name === prevCatName);
                if (foundCatIdx !== -1) {
                  categoryIndex = foundCatIdx + 1;
                  if (prevLineupName && data[mapIndex].categories[foundCatIdx].lineups) {
                    const foundLineupIdx = data[mapIndex].categories[foundCatIdx].lineups.findIndex(l => l.name === prevLineupName);
                    if (foundLineupIdx !== -1) {
                      lineupIndex = foundLineupIdx;
                    } else {
                      lineupIndex = Math.max(0, Math.min(lineupIndex, data[mapIndex].categories[foundCatIdx].lineups.length - 1));
                    }
                  }
                } else {
                  categoryIndex = 0;
                  lineupIndex = 0;
                  if (currentLevel === 'lineups') currentLevel = 'categories';
                }
              }
            } else {
              mapIndex = 0;
              categoryIndex = 0;
              lineupIndex = 0;
              currentLevel = 'maps';
            }
          } else {
            mapIndex = 0;
            categoryIndex = 0;
            lineupIndex = 0;
            currentLevel = 'maps';
          }

          render();
        } else {
          data = [];
          showEmptyState();
        }
      }
    } catch (err) {
      console.error('Fehler beim Aktualisieren der Lineups:', err);
    } finally {
      if (!silent) {
        setTimeout(() => {
          refreshIcons.forEach(icon => icon.classList.remove('spinning'));
          isRefreshing = false;
        }, 400);
      } else {
        isRefreshing = false;
      }
    }
  }

  function triggerManualRefresh() {
    refreshData(false);
    if (window.api && window.api.checkForUpdates) {
      window.api.checkForUpdates().catch(() => {});
    }
  }

  function updateMediaTileSize() {
    const container = document.querySelector('.media-container');
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w <= 0 || h <= 0) return;

    const gap = w < 500 || h < 500 ? 10 : 16;
    container.style.setProperty('--media-gap', `${gap}px`);

    // Option 1: Side-by-side (2 columns)
    const sizeRow = Math.min((w - gap) / 2, h);

    // Option 2: Stacked (2 rows, 1 column)
    const sizeCol = Math.min(w, (h - gap) / 2);

    let layout = 'row';
    let size = sizeRow;

    if (sizeCol > sizeRow) {
      layout = 'column';
      size = sizeCol;
    }

    size = Math.max(20, Math.floor(size));

    container.style.setProperty('--tile-size', `${size}px`);
    container.dataset.layout = layout;
  }

  const mediaContainer = document.querySelector('.media-container');
  if (window.ResizeObserver && mediaContainer) {
    const ro = new ResizeObserver(() => {
      updateMediaTileSize();
    });
    ro.observe(mediaContainer);
  }
  window.addEventListener('resize', updateMediaTileSize);

  // Open lineups directory buttons
  document.querySelectorAll('.btn-open-folder').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.api && window.api.openLineupsDirectory) {
        window.api.openLineupsDirectory();
      }
    });
  });

  // Open settings / options modal buttons
  document.querySelectorAll('.btn-settings').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openOptionsModal();
    });
  });

  const btnOpenExtension = document.getElementById('btn-open-extension');
  if (btnOpenExtension) {
    btnOpenExtension.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.api && window.api.openExtensionDirectory) {
        window.api.openExtensionDirectory();
      }
    });
  }

  if (btnLineupCallout) {
    btnLineupCallout.addEventListener('click', (e) => {
      e.stopPropagation();
      previousLevelBeforeOverview = 'lineups';
      currentLevel = 'overview';
      lastNavAnim = 'deeper';
      render();
    });
  }

  if (overviewBtnOpenFolder) {
    overviewBtnOpenFolder.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentMap = data[mapIndex];
      const mapName = currentMap ? currentMap.name : '';
      if (window.api && window.api.openCalloutFolder) {
        window.api.openCalloutFolder(mapName);
      }
    });
  }

  if (overviewEmptyOpenBtn) {
    overviewEmptyOpenBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentMap = data[mapIndex];
      const mapName = currentMap ? currentMap.name : '';
      if (window.api && window.api.openCalloutFolder) {
        window.api.openCalloutFolder(mapName);
      }
    });
  }

  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeOptionsModal);
  if (modalSaveBtn) modalSaveBtn.addEventListener('click', closeOptionsModal);

  if (modalResetBtn) {
    modalResetBtn.addEventListener('click', () => {
      saveHotkeys(DEFAULT_HOTKEYS);
      stopRecording();
    });
  }

  // Key recording click handler
  document.querySelectorAll('.key-bind-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      if (recordingAction === action) {
        stopRecording();
        return;
      }
      stopRecording();
      recordingAction = action;
      btn.classList.add('recording');
      const lbl = btn.querySelector('.key-bind-label');
      if (lbl) lbl.textContent = 'Taste drücken...';
    });
  });

  // Manual reload buttons
  document.querySelectorAll('.btn-reload').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerManualRefresh();
    });
  });

  // F5 / Ctrl+R / Cmd+R to reload manually
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R'))) {
      e.preventDefault();
      triggerManualRefresh();
    }
  });

  // Automatic reload when window regains focus (e.g. after adding files in explorer)
  window.addEventListener('focus', () => {
    refreshData(true);
  });

  // Automatic reload when file watcher in main process detects directory changes
  if (window.api && window.api.onLineupsUpdated) {
    window.api.onLineupsUpdated(() => {
      refreshData(true);
    });
  }

  init();
})();
