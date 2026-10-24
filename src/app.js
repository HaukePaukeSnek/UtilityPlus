(function () {
  // DOM Elements
  const folderView = document.getElementById('folder-view');
  const lineupView = document.getElementById('lineup-view');
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
  let currentLevel = 'maps'; // 'maps' | 'categories' | 'lineups'
  let mapIndex = 0;
  let categoryIndex = 0;
  let lineupIndex = 0;
  let lastNavTime = 0;

  async function init() {
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
        if (typeof saved.categoryIndex === 'number' && currentMap && saved.categoryIndex < currentMap.categories.length) {
          categoryIndex = saved.categoryIndex;
          const currentCategory = currentMap.categories[categoryIndex];
          if (typeof saved.lineupIndex === 'number' && currentCategory && saved.lineupIndex < currentCategory.lineups.length) {
            lineupIndex = saved.lineupIndex;
          }
        }
      }
      if (saved.currentLevel === 'lineups' || saved.currentLevel === 'categories' || saved.currentLevel === 'maps') {
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
    lineupVideo.pause();
    lineupVideo.removeAttribute('src');
    lineupVideo.dataset.currentSrc = '';
    lineupVideo.load();
    updateLandingPreview(null);

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
      const catCount = map.categories.length;
      count.textContent = `${catCount} ${catCount === 1 ? 'Kategorie' : 'Kategorien'}`;

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
    lineupVideo.pause();
    lineupVideo.removeAttribute('src');
    lineupVideo.dataset.currentSrc = '';
    lineupVideo.load();
    updateLandingPreview(null);

    folderView.classList.add('active');
    lineupView.classList.remove('active');

    const currentMap = data[mapIndex];
    if (!currentMap) return;

    folderBreadcrumbs.textContent = `${currentMap.name.toUpperCase()} › KATEGORIEN`;
    folderTitle.textContent = 'Wähle eine Kategorie';

    folderList.innerHTML = '';
    currentMap.categories.forEach((cat, index) => {
      const item = document.createElement('div');
      item.className = 'folder-item' + (index === categoryIndex ? ' selected' : '');

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
        categoryIndex = index;
        navRight();
      });

      folderList.appendChild(item);
    });
  }

  function renderLineups() {
    folderView.classList.remove('active');
    lineupView.classList.add('active');

    const currentMap = data[mapIndex];
    if (!currentMap) return;
    const currentCategory = currentMap.categories[categoryIndex];
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
      if (currentMap && currentMap.categories.length > 0) {
        currentLevel = 'categories';
        categoryIndex = 0;
        render();
      }
    } else if (currentLevel === 'categories') {
      const currentMap = data[mapIndex];
      const currentCategory = currentMap ? currentMap.categories[categoryIndex] : null;
      if (currentCategory && currentCategory.lineups.length > 0) {
        currentLevel = 'lineups';
        if (lineupIndex >= currentCategory.lineups.length) {
          lineupIndex = 0;
        }
        render();
      }
    }
  }

  function navLeft() {
    lastNavAnim = 'higher';
    if (currentLevel === 'lineups') {
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
      const catCount = data[mapIndex].categories.length;
      categoryIndex = (categoryIndex - 1 + catCount) % catCount;
      lineupIndex = 0;
      render();
    } else if (currentLevel === 'lineups') {
      const lineCount = data[mapIndex].categories[categoryIndex].lineups.length;
      lineupIndex = (lineupIndex - 1 + lineCount) % lineCount;
      render();
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
      const catCount = data[mapIndex].categories.length;
      categoryIndex = (categoryIndex + 1) % catCount;
      lineupIndex = 0;
      render();
    } else if (currentLevel === 'lineups') {
      const lineCount = data[mapIndex].categories[categoryIndex].lineups.length;
      lineupIndex = (lineupIndex + 1) % lineCount;
      render();
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

  // Keyboard navigation when window has focus
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleDirection('up');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleDirection('down');
    } else if (e.key === 'ArrowLeft' || e.key === 'Backspace' || e.key === 'Escape') {
      e.preventDefault();
      handleDirection('left');
    } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
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
          const prevCatName = data && data[mapIndex] && data[mapIndex].categories[categoryIndex]
            ? data[mapIndex].categories[categoryIndex].name : null;
          const prevLineupName = data && data[mapIndex] && data[mapIndex].categories[categoryIndex] && data[mapIndex].categories[categoryIndex].lineups[lineupIndex]
            ? data[mapIndex].categories[categoryIndex].lineups[lineupIndex].name : null;

          data = newData;

          if (prevMapName) {
            const foundMapIdx = data.findIndex(m => m.name === prevMapName);
            if (foundMapIdx !== -1) {
              mapIndex = foundMapIdx;
              if (prevCatName) {
                const foundCatIdx = data[mapIndex].categories.findIndex(c => c.name === prevCatName);
                if (foundCatIdx !== -1) {
                  categoryIndex = foundCatIdx;
                  if (prevLineupName) {
                    const foundLineupIdx = data[mapIndex].categories[categoryIndex].lineups.findIndex(l => l.name === prevLineupName);
                    if (foundLineupIdx !== -1) {
                      lineupIndex = foundLineupIdx;
                    } else {
                      lineupIndex = Math.max(0, Math.min(lineupIndex, data[mapIndex].categories[categoryIndex].lineups.length - 1));
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
