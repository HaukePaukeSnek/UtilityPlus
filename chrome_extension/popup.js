/**
 * CS2 Nade Scraper - Popup Script
 */

document.addEventListener('DOMContentLoaded', async () => {
  // UI Elemente
  const loadingState = document.getElementById('loadingState');
  const notNadeState = document.getElementById('notNadeState');
  const nadeState = document.getElementById('nadeState');
  const mainView = document.getElementById('mainView');
  const settingsView = document.getElementById('settingsView');

  // Naden-Anzeige
  const mapBadge = document.getElementById('mapBadge');
  const typeBadge = document.getElementById('typeBadge');
  const teamBadge = document.getElementById('teamBadge');
  const nadeTitle = document.getElementById('nadeTitle');
  const nadeSubtitle = document.getElementById('nadeSubtitle');
  const techVal = document.getElementById('techVal');
  const moveVal = document.getElementById('moveVal');
  const precVal = document.getElementById('precVal');
  const lineupImgPreview = document.getElementById('lineupImgPreview');
  const thumbImgPreview = document.getElementById('thumbImgPreview');
  const consoleRow = document.getElementById('consoleRow');
  const consoleText = document.getElementById('consoleText');
  const copyConsoleBtn = document.getElementById('copyConsoleBtn');
  const currentFolderPreview = document.getElementById('currentFolderPreview');
  const downloadBtn = document.getElementById('downloadBtn');
  const statusMsg = document.getElementById('statusMsg');

  // Einstellungen
  const toggleSettingsBtn = document.getElementById('toggleSettingsBtn');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const baseFolderInput = document.getElementById('baseFolderInput');
  const chkVideo = document.getElementById('chkVideo');
  const chkImage = document.getElementById('chkImage');
  const chkTxt = document.getElementById('chkTxt');
  const chkJson = document.getElementById('chkJson');
  const chkCfg = document.getElementById('chkCfg');

  let currentLineupData = null;
  let userSettings = {
    baseFolder: 'CS2_Lineups',
    folderStructure: 'nested',
    videoQuality: 'lq', // 'lq' | 'reencode' | 'hq'
    downloadVideo: true,
    downloadImage: true,
    downloadThumbnail: false,
    saveInfoTxt: true,
    saveInfoJson: true,
    saveCfg: true
  };

  // 1. Einstellungen laden
  const stored = await chrome.storage.local.get(null);
  userSettings = { ...userSettings, ...stored };
  applySettingsToUI(userSettings);

  // 2. Aktiven Tab abfragen
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    if (!tabs || tabs.length === 0) {
      showNotNadeState();
      return;
    }

    const tab = tabs[0];
    const url = tab.url || '';

    if (!url.includes('csnades.gg')) {
      showNotNadeState();
      return;
    }

    // Daten vom Content-Script der aktiven Seite anfordern
    fetchLineupFromTab(tab.id);
  });

  // Fragt Daten vom Content-Script ab oder injiziert es bei Bedarf
  function fetchLineupFromTab(tabId) {
    chrome.tabs.sendMessage(tabId, { action: 'getLineupData' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        // Falls das Content Script noch nicht aktiv war, dynamisch einfügen
        chrome.scripting.executeScript(
          {
            target: { tabId: tabId },
            files: ['content.js']
          },
          () => {
            if (chrome.runtime.lastError) {
              showNotNadeState();
              return;
            }
            // Erneut versuchen nach Injektion
            setTimeout(() => {
              chrome.tabs.sendMessage(tabId, { action: 'getLineupData' }, (resp) => {
                handleLineupResponse(resp);
              });
            }, 200);
          }
        );
      } else {
        handleLineupResponse(response);
      }
    });
  }

  // Verarbeitet die Antwort
  function handleLineupResponse(response) {
    loadingState.classList.add('hidden');

    if (!response || !response.success || !response.data || !response.data.isNadePage) {
      showNotNadeState();
      return;
    }

    currentLineupData = response.data;
    renderLineup(currentLineupData);
  }

  // Zeigt den State für "Kein Lineup"
  function showNotNadeState() {
    loadingState.classList.add('hidden');
    nadeState.classList.add('hidden');
    notNadeState.classList.remove('hidden');
  }

  // Rendert die gefundenen Granaten-Informationen im Popup
  function renderLineup(data) {
    notNadeState.classList.add('hidden');
    nadeState.classList.remove('hidden');

    // Badges
    mapBadge.textContent = data.mapName || 'CS2';
    typeBadge.textContent = data.nadeTypeLabel || 'Nade';

    const team = (data.team || '').toLowerCase();
    if (team === 'ct') {
      teamBadge.textContent = 'CT';
      teamBadge.className = 'badge badge-team ct';
    } else {
      teamBadge.textContent = 'T';
      teamBadge.className = 'badge badge-team';
    }

    // Titel & Name (exakt wie gewünscht: z.B. mirage bench from back alley)
    nadeTitle.textContent = data.name || `${data.mapSlug} ${data.nadeSlug}`;
    nadeSubtitle.textContent = data.displayName || `${data.titleTo} from ${data.titleFrom}`;

    // Metadaten
    techVal.textContent = data.techniqueLabel || 'Left Click';
    moveVal.textContent = data.movementLabel || 'Stationary';
    precVal.textContent = data.precisionLabel || 'Precise';

    // Bild-Vorschauen
    if (data.lineupImageUrl) {
      lineupImgPreview.src = data.lineupImageUrl;
    } else {
      lineupImgPreview.parentElement.classList.add('hidden');
    }

    if (data.thumbnailUrl) {
      thumbImgPreview.src = data.thumbnailUrl;
    } else {
      thumbImgPreview.parentElement.classList.add('hidden');
    }

    // Teleport Console Box
    if (data.consoleCommand) {
      consoleText.textContent = data.consoleCommand;
      consoleRow.classList.remove('hidden');
    } else {
      consoleRow.classList.add('hidden');
    }

    // Ordner-Vorschau aktualisieren
    updateFolderPreview();
  }

  // Ordner-Vorschau berechnen
  function updateFolderPreview() {
    if (!currentLineupData) return;
    const base = (baseFolderInput.value || 'CS2_Lineups').trim();
    const map = currentLineupData.mapName || currentLineupData.mapSlug || 'Map';
    let type = currentLineupData.nadeTypeLabel || currentLineupData.nadeType || 'Type';
    if (type.toLowerCase().includes('molotov')) type = 'Molotov';
    const slug = currentLineupData.nadeSlug || 'lineup';

    const radioVal = document.querySelector('input[name="folderStructure"]:checked')?.value || 'nested';
    if (radioVal === 'nested') {
      currentFolderPreview.textContent = `Downloads/${base}/${map}/${type}/${slug}/`;
    } else {
      currentFolderPreview.textContent = `Downloads/${base}/${map}_${type}_${slug}/`;
    }
  }

  // Klick auf Kopieren des CS2 Teleport Commands
  copyConsoleBtn.addEventListener('click', async () => {
    if (!currentLineupData || !currentLineupData.consoleCommand) return;
    try {
      await navigator.clipboard.writeText(currentLineupData.consoleCommand);
      copyConsoleBtn.innerHTML = `<span>Kopiert!</span>`;
      setTimeout(() => {
        copyConsoleBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <span>Kopieren</span>
        `;
      }, 2000);
    } catch (e) {
      console.error('Kopierfehler:', e);
    }
  });

  // Client-seitige Video-Kompression über Canvas & MediaRecorder
  async function reencodeVideo(videoSrc, targetHeight = 720, targetBitrate = 1600000) {
    const response = await fetch(videoSrc);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.src = blobUrl;

      const timeout = setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
        reject(new Error('Timeout beim Re-Encodieren'));
      }, 45000);

      video.onloadedmetadata = () => {
        let width = video.videoWidth || 1280;
        let height = video.videoHeight || 720;

        if (height > targetHeight) {
          width = Math.round((width * targetHeight) / height);
          height = targetHeight;
        }
        if (width % 2 !== 0) width--;
        if (height % 2 !== 0) height--;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        const stream = canvas.captureStream(30);

        let mimeType = 'video/webm; codecs=vp9';
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
          if (MediaRecorder.isTypeSupported('video/mp4; codecs=avc1')) {
            mimeType = 'video/mp4; codecs=avc1';
          } else if (MediaRecorder.isTypeSupported('video/mp4')) {
            mimeType = 'video/mp4';
          } else if (MediaRecorder.isTypeSupported('video/webm; codecs=vp9')) {
            mimeType = 'video/webm; codecs=vp9';
          } else if (MediaRecorder.isTypeSupported('video/webm')) {
            mimeType = 'video/webm';
          }
        }

        let recorder;
        try {
          recorder = new MediaRecorder(stream, {
            mimeType,
            videoBitsPerSecond: targetBitrate
          });
        } catch (e) {
          recorder = new MediaRecorder(stream);
        }

        const chunks = [];
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
          clearTimeout(timeout);
          URL.revokeObjectURL(blobUrl);
          const outBlob = new Blob(chunks, { type: mimeType });
          const outUrl = URL.createObjectURL(outBlob);
          resolve({
            blobUrl: outUrl,
            mimeType,
            size: outBlob.size,
            ext: mimeType.includes('mp4') ? 'mp4' : 'webm'
          });
        };

        recorder.start();

        let animId;
        function drawFrame() {
          if (video.paused || video.ended) return;
          ctx.drawImage(video, 0, 0, width, height);
          if ('requestVideoFrameCallback' in video) {
            video.requestVideoFrameCallback(drawFrame);
          } else {
            animId = requestAnimationFrame(drawFrame);
          }
        }

        video.onended = () => {
          if (animId) cancelAnimationFrame(animId);
          setTimeout(() => {
            try { recorder.stop(); } catch (e) {}
          }, 150);
        };

        video.onerror = (err) => {
          clearTimeout(timeout);
          URL.revokeObjectURL(blobUrl);
          reject(err || new Error('Videofehler beim Re-Encodieren'));
        };

        video.play().then(() => {
          drawFrame();
        }).catch(err => {
          clearTimeout(timeout);
          URL.revokeObjectURL(blobUrl);
          reject(err);
        });
      };

      video.onerror = (err) => {
        clearTimeout(timeout);
        URL.revokeObjectURL(blobUrl);
        reject(err || new Error('Video konnte nicht geladen werden'));
      };
    });
  }

  // Download-Button
  downloadBtn.addEventListener('click', async () => {
    if (!currentLineupData) return;

    downloadBtn.disabled = true;
    downloadBtn.innerHTML = `
      <div class="loader-spinner" style="width: 16px; height: 16px; border-width: 2px;"></div>
      <span>Wird vorbereitet...</span>
    `;

    statusMsg.className = 'status-box';
    statusMsg.classList.remove('hidden');

    let payload = { ...currentLineupData };

    if (userSettings.downloadVideo !== false && userSettings.videoQuality === 'reencode') {
      try {
        statusMsg.textContent = 'Komprimiere Video im Browser (720p Re-Encode)...';
        downloadBtn.querySelector('span').textContent = 'Komprimiere...';
        const srcUrl = currentLineupData.videoLqUrl || currentLineupData.videoUrl;
        const compressed = await reencodeVideo(srcUrl, 720, 1600000);
        payload.compressedVideoBlobUrl = compressed.blobUrl;
        payload.compressedVideoExt = compressed.ext;
        const mb = Math.round((compressed.size / 1024 / 1024) * 10) / 10;
        statusMsg.textContent = `Video komprimiert (${mb} MB)! Speichere Dateien...`;
      } catch (err) {
        console.warn('Re-encode fehlgeschlagen, verwende LQ-Fallback:', err);
        statusMsg.textContent = 'Re-Encode fehlgeschlagen, lade komprimiertes Video...';
      }
    } else {
      statusMsg.textContent = 'Dateien werden im Zielordner gespeichert...';
    }

    downloadBtn.querySelector('span').textContent = 'Speichere...';

    chrome.runtime.sendMessage({ action: 'downloadLineup', data: payload }, (response) => {
      downloadBtn.disabled = false;
      downloadBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>Erfolgreich gespeichert!</span>
      `;

      if (response && response.success) {
        statusMsg.className = 'status-box status-success';
        statusMsg.innerHTML = `✅ <strong>${response.downloadedCount} Dateien gespeichert!</strong><br><small>${response.folder}</small>`;
      } else {
        statusMsg.className = 'status-box status-error';
        statusMsg.textContent = 'Fehler beim Download: ' + (response?.error || 'Unbekannter Fehler');
      }

      setTimeout(() => {
        downloadBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>Erneut herunterladen</span>
        `;
      }, 3500);
    });
  });

  // Einstellungen öffnen / schließen
  toggleSettingsBtn.addEventListener('click', () => {
    mainView.classList.toggle('hidden');
    settingsView.classList.toggle('hidden');
  });

  closeSettingsBtn.addEventListener('click', () => {
    settingsView.classList.add('hidden');
    mainView.classList.remove('hidden');
  });

  // Einstellungen anwenden
  function applySettingsToUI(s) {
    baseFolderInput.value = s.baseFolder || 'CS2_Lineups';
    chkVideo.checked = s.downloadVideo !== false;
    chkImage.checked = s.downloadImage !== false;
    chkTxt.checked = s.saveInfoTxt !== false;
    chkJson.checked = s.saveInfoJson !== false;
    chkCfg.checked = s.saveCfg !== false;

    const structRadio = document.querySelector(`input[name="folderStructure"][value="${s.folderStructure || 'nested'}"]`);
    if (structRadio) structRadio.checked = true;

    const vqRadio = document.querySelector(`input[name="videoQuality"][value="${s.videoQuality || 'lq'}"]`);
    if (vqRadio) vqRadio.checked = true;

    updateFolderPreview();
  }

  // Einstellungen speichern
  saveSettingsBtn.addEventListener('click', async () => {
    const updated = {
      baseFolder: baseFolderInput.value.trim() || 'CS2_Lineups',
      folderStructure: document.querySelector('input[name="folderStructure"]:checked')?.value || 'nested',
      videoQuality: document.querySelector('input[name="videoQuality"]:checked')?.value || 'lq',
      downloadVideo: chkVideo.checked,
      downloadImage: chkImage.checked,
      saveInfoTxt: chkTxt.checked,
      saveInfoJson: chkJson.checked,
      saveCfg: chkCfg.checked
    };

    await chrome.storage.local.set(updated);
    userSettings = { ...userSettings, ...updated };

    saveSettingsBtn.textContent = 'Gespeichert! ✓';
    setTimeout(() => {
      saveSettingsBtn.textContent = 'Einstellungen speichern';
      settingsView.classList.add('hidden');
      mainView.classList.remove('hidden');
      updateFolderPreview();
    }, 800);
  });

  // Live-Aktualisierung des Verzeichnis-Pfades bei Eingabe
  baseFolderInput.addEventListener('input', updateFolderPreview);
  document.querySelectorAll('input[name="folderStructure"]').forEach(radio => {
    radio.addEventListener('change', updateFolderPreview);
  });
});

