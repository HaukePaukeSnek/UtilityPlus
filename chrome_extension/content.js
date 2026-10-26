/**
 * CS2 Nade Scraper - Content Script
 * Extrahiert Videos, Bilder und Granaten-Metadaten von csnades.gg
 */

(() => {
  // Mapping für Teams
  const TEAM_LABELS = {
    t: 'Terrorist (T)',
    ct: 'Counter-Terrorist (CT)'
  };

  const MOVEMENT_LABELS = {
    stationary: 'Stationary (Stehend)',
    running: 'Running (Laufend / W)',
    walking: 'Walking (Gehend / Shift)',
    crouching: 'Crouching (Geduckt / Strg)'
  };

  const PRECISION_LABELS = {
    precise: 'Precise (Präzise)',
    very_precise: 'Very Precise (Sehr präzise)',
    relaxed: 'Relaxed (Tolerant / Ungenau ok)'
  };

  const TYPE_LABELS = {
    smoke: 'Smoke',
    smokes: 'Smoke',
    flashbang: 'Flashbang',
    flashbangs: 'Flashbang',
    molotov: 'Molotov',
    molotovs: 'Molotov',
    hegrenade: 'HE Grenade',
    hegrenades: 'HE Grenade'
  };

  // Intelligente Formatierung der Wurftechnik (z. B. left_jump -> Left Click + Jumpthrow)
  function formatTechnique(raw) {
    if (!raw) return 'Left Click (Linksklick)';
    const t = raw.toLowerCase().trim();

    const MAP = {
      left: 'Left Click (Linksklick)',
      left_jump: 'Left Click + Jumpthrow (Linksklick + Sprung)',
      jump_left: 'Left Click + Jumpthrow (Linksklick + Sprung)',
      right: 'Right Click (Rechtsklick)',
      right_jump: 'Right Click + Jumpthrow (Rechtsklick + Sprung)',
      jump_right: 'Right Click + Jumpthrow (Rechtsklick + Sprung)',
      left_right: 'Left + Right Click (Beide Maustasten)',
      left_right_jump: 'Left + Right Click + Jumpthrow',
      jump_left_right: 'Left + Right Click + Jumpthrow',
      run_throw: 'Running Throw (Im Laufen werfen)',
      run_jump: 'Running Jumpthrow (Laufend + Sprung)',
      run_jump_left: 'Running Jumpthrow (Laufend + Sprung)',
      walk_throw: 'Walking Throw (Im Gehen werfen)',
      walk_jump: 'Walking Jumpthrow (Gehend + Sprung)',
      jump: 'Jumpthrow (Sprungwurf)'
    };

    if (MAP[t]) return MAP[t];

    // Zerlegung für beliebige Kombinationen
    const parts = [];
    if (t.includes('run')) parts.push('Running');
    if (t.includes('walk')) parts.push('Walking');
    if (t.includes('crouch')) parts.push('Crouching');

    if (t.includes('left') && t.includes('right')) {
      parts.push('Left + Right Click');
    } else if (t.includes('left')) {
      parts.push('Left Click');
    } else if (t.includes('right')) {
      parts.push('Right Click');
    }

    if (t.includes('jump')) parts.push('Jumpthrow');

    return parts.length > 0 ? parts.join(' + ') : capitalize(t.replace(/_/g, ' '));
  }

  // Erkennt, ob die aktuelle Seite eine Granatenseite ist
  function isNadePage() {
    const parts = window.location.pathname.split('/').filter(Boolean);
    return parts.length >= 3 && !['maps', 'guides', 'stats', 'about', 'login'].includes(parts[0]);
  }

  // Extrahiert alle relevanten Daten
  function scrapeNadeData() {
    const pathname = window.location.pathname;
    const parts = pathname.split('/').filter(Boolean);
    if (!isNadePage()) {
      return {
        isNadePage: false,
        error: 'Keine Granatenseite geöffnet. Bitte wähle ein Lineup auf csnades.gg aus (z.B. /mirage/smokes/bench-from-back-alley).'
      };
    }

    const mapSlug = parts[0] || '';
    const nadeType = parts[1] || '';
    const nadeSlug = parts[2] || '';

    let data = {
      isNadePage: true,
      url: window.location.href,
      pathname,
      mapSlug,
      mapName: capitalize(mapSlug),
      nadeType,
      nadeTypeLabel: TYPE_LABELS[nadeType.toLowerCase()] || capitalize(nadeType),
      nadeSlug,
      titleTo: '',
      titleFrom: '',
      name: '',
      team: '',
      teamLabel: '',
      technique: '',
      techniqueLabel: '',
      movement: '',
      movementLabel: '',
      precision: '',
      precisionLabel: '',
      consoleCommand: '',
      instructions: [],
      assetId: '',
      videoUrl: '',
      videoWebmUrl: '',
      lineupImageUrl: '',
      thumbnailUrl: ''
    };

    // =========================================================================
    // SCHRITT 1: Direkt aus dem Live-DOM der aktiven Seite auslesen
    // (Funktioniert immer, auch bei Client-Side SPA Navigation im Browser!)
    // =========================================================================

    // 1.1 Metadaten aus dem Haupt-Sidebar-Bereich (<aside>)
    const aside = document.querySelector('aside') || document.querySelector('.lg\\:flex-row aside') || document;

    // A) Technik auslesen (data-tooltip-content oder SVGs)
    const techEl = aside.querySelector('[data-tooltip-id="metadata-technique"]');
    if (techEl) {
      const tooltipContent = techEl.getAttribute('data-tooltip-content');
      if (tooltipContent) {
        data.technique = tooltipContent.trim().toLowerCase();
      } else {
        // Falls Attribut fehlt: Untersuche die enthaltenen SVGs
        const imgs = techEl.querySelectorAll('img');
        const iconTypes = [];
        imgs.forEach(img => {
          const src = (img.src || '').toLowerCase();
          if (src.includes('jump')) iconTypes.push('jump');
          else if (src.includes('left-click')) iconTypes.push('left');
          else if (src.includes('right-click')) iconTypes.push('right');
          else if (src.includes('run')) iconTypes.push('run');
          else if (src.includes('walk')) iconTypes.push('walk');
        });
        if (iconTypes.length > 0) {
          data.technique = iconTypes.join('_');
        }
      }
    }

    // B) Team auslesen
    const teamEl = aside.querySelector('[data-tooltip-id="metadata-team"]');
    if (teamEl) {
      const tContent = teamEl.getAttribute('data-tooltip-content');
      if (tContent) {
        data.team = tContent.trim().toLowerCase();
      } else {
        const txt = teamEl.textContent.toLowerCase();
        if (txt.includes('counter')) data.team = 'ct';
        else if (txt.includes('terrorist')) data.team = 't';
      }
    }

    // C) Bewegung auslesen
    const movEl = aside.querySelector('[data-tooltip-id="metadata-movement"]');
    if (movEl) {
      const mContent = movEl.getAttribute('data-tooltip-content');
      if (mContent) {
        data.movement = mContent.trim().toLowerCase();
      } else {
        data.movement = movEl.textContent.replace(/Movement/i, '').trim().toLowerCase();
      }
    }

    // D) Präzision auslesen
    const precEl = aside.querySelector('[data-tooltip-id="metadata-precision"]');
    if (precEl) {
      const pContent = precEl.getAttribute('data-tooltip-content');
      if (pContent) {
        data.precision = pContent.trim().toLowerCase();
      } else {
        data.precision = precEl.textContent.replace(/Precision/i, '').trim().toLowerCase();
      }
    }

    // E) CS2 Console Command aus dem Button
    const copyConsoleBtn = document.querySelector('[data-tooltip-id="copy-console"]');
    if (copyConsoleBtn) {
      const cmd = copyConsoleBtn.getAttribute('data-tooltip-content');
      if (cmd) {
        data.consoleCommand = cmd.trim();
      }
    }

    // 1.2 Video- & Bild-URLs aus dem DOM
    const videoElem = document.querySelector('video');
    const sourceElem = document.querySelector('video source[type="video/mp4"]');
    const videoSrc = sourceElem ? sourceElem.src : (videoElem ? videoElem.src || videoElem.getAttribute('poster') : '');

    let assetId = '';
    const assetMatch = (videoSrc || document.documentElement.innerHTML).match(/https:\/\/assets\.csnades\.gg\/nades\/([a-zA-Z0-9_\-]+)\//);
    if (assetMatch) {
      assetId = assetMatch[1];
    }

    if (assetId) {
      data.assetId = assetId;
      data.videoUrl = `https://assets.csnades.gg/nades/${assetId}/hq.mp4`;
      data.videoLqUrl = `https://assets.csnades.gg/nades/${assetId}/lq.mp4`;
      data.videoWebmUrl = `https://assets.csnades.gg/nades/${assetId}/hq.webm`;
      data.videoLqWebmUrl = `https://assets.csnades.gg/nades/${assetId}/lq.webm`;
      data.lineupImageUrl = `https://assets.csnades.gg/nades/${assetId}/lineup.webp`;
      data.thumbnailUrl = `https://assets.csnades.gg/nades/${assetId}/thumbnail.webp`;
    }

    // 1.3 Titel aus Seitentitel ermitteln (z.B. "Cache NBK from Outside A Main Smoke")
    const docTitle = document.title || '';
    const fromMatch = docTitle.match(/^([A-Za-z0-9\s]+?)\s+([A-Za-z0-9\s]+?)\s+from\s+([A-Za-z0-9\s]+?)\s+(?:Smoke|Flashbang|Molotov|HE)/i);
    if (fromMatch) {
      data.titleTo = fromMatch[2].trim();
      data.titleFrom = fromMatch[3].trim();
    }

    // =========================================================================
    // SCHRITT 2: Ergänzung aus den Next.js Flight-Chunks (falls vorhanden)
    // =========================================================================
    try {
      const html = document.documentElement.innerHTML;
      if (nadeSlug && html.includes(nadeSlug)) {
        // Suche Vorkommen des Slugs in Script-Tags
        const escapedSlug = `slug\\":\\"${nadeSlug}\\"`;
        const normalSlug = `"slug":"${nadeSlug}"`;
        let targetIdx = html.indexOf(escapedSlug);
        if (targetIdx === -1) targetIdx = html.indexOf(normalSlug);

        if (targetIdx !== -1) {
          const snippet = html.slice(Math.max(0, targetIdx - 300), targetIdx + 3500);

          const getVal = (key) => {
            const r1 = new RegExp(`\\\\"${key}\\\\":\\\\"([^\\\\"]+)\\\\"`);
            const m1 = snippet.match(r1);
            if (m1) return m1[1];
            const r2 = new RegExp(`"${key}":"([^"]+)"`);
            const m2 = snippet.match(r2);
            return m2 ? m2[1] : '';
          };

          if (!data.titleTo) data.titleTo = getVal('titleTo');
          if (!data.titleFrom) data.titleFrom = getVal('titleFrom');
          if (!data.team) data.team = getVal('team');
          if (!data.technique) data.technique = getVal('technique');
          if (!data.movement) data.movement = getVal('movement');
          if (!data.precision) data.precision = getVal('precision');

          const mapMatch = snippet.match(/\\?"map\\?":\s*\{[^}]*\\?"name\\?":\s*\\?"([^\\"]+)\\?"/);
          if (mapMatch && !data.mapName) {
            data.mapName = mapMatch[1];
          }

          if (!data.consoleCommand) {
            const consoleMatch = snippet.match(/\\?"console\\?":\s*\\?"([^\\"]+)\\?"/);
            if (consoleMatch) {
              data.consoleCommand = consoleMatch[1];
            }
          }

          // Video VTT / Untertitel & Anleitungs-Schritte
          const vttMatch = snippet.match(/\\?"videoVtt\\?":\s*\\?"([^"]+?)\\?",/);
          if (vttMatch) {
            const rawVtt = vttMatch[1].replace(/\\n/g, '\n').replace(/\\r/g, '');
            const lines = rawVtt.split('\n')
              .map(l => l.trim().replace(/\\/g, ''))
              .filter(l => l && !l.includes('-->') && !l.includes('u003e') && !/^\d+$/.test(l) && l !== 'WEBVTT');
            data.instructions = lines;
          }
        }
      }
    } catch (e) {
      console.warn('[CS2 Scraper] Chunk parsing fallback:', e);
    }

    // =========================================================================
    // SCHRITT 3: Finale Formatierung und Labels
    // =========================================================================

    // Wurftechnik formatieren (z. B. "left_jump" -> "Left Click + Jumpthrow (Linksklick + Sprung)")
    data.techniqueLabel = formatTechnique(data.technique);
    data.teamLabel = TEAM_LABELS[data.team.toLowerCase()] || (data.team ? data.team.toUpperCase() : 'Beide Teams');
    data.movementLabel = MOVEMENT_LABELS[data.movement.toLowerCase()] || capitalize(data.movement) || 'Stationary';
    data.precisionLabel = PRECISION_LABELS[data.precision.toLowerCase()] || capitalize(data.precision) || 'Precise';

    // Formatiere den vollständigen Namen (z.B. "cache nbk from outside a main")
    const cleanSlugName = nadeSlug.replace(/-/g, ' ');
    if (data.titleTo && data.titleFrom) {
      data.name = `${data.mapSlug} ${data.titleTo.toLowerCase()} from ${data.titleFrom.toLowerCase()}`;
      data.displayName = `${data.mapName} - ${data.titleTo} from ${data.titleFrom} (${data.nadeTypeLabel})`;
    } else {
      data.name = `${data.mapSlug} ${cleanSlugName}`;
      data.displayName = `${data.mapName} - ${capitalize(cleanSlugName)} (${data.nadeTypeLabel})`;
    }

    // Dateiname-Prefix für Downloads
    data.folderName = `${capitalize(data.mapSlug)}_${capitalize(data.nadeType)}_${nadeSlug}`;
    data.cleanFilename = `${data.mapSlug}_${nadeType}_${nadeSlug}`;

    console.log('[CS2 Scraper] Lineup gescraped:', {
      name: data.name,
      technique: data.technique,
      techniqueLabel: data.techniqueLabel,
      team: data.teamLabel,
      movement: data.movementLabel
    });

    return data;
  }

  // Hilfsfunktion: Großschreibung
  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // Nachrichten-Listener für das Popup oder Background-Skript
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getLineupData') {
      try {
        const data = scrapeNadeData();
        sendResponse({ success: true, data });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true; // Asynchron antworten
    }

    if (request.action === 'showToast') {
      showToast(request.message, request.isError);
      sendResponse({ success: true });
      return true;
    }
  });

  // Visueller Toast für Rückmeldungen direkt auf csnades.gg
  function showToast(message, isError = false) {
    let existing = document.getElementById('cs2-scraper-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'cs2-scraper-toast';
    toast.className = `cs2-toast ${isError ? 'cs2-toast-error' : 'cs2-toast-success'}`;
    toast.innerHTML = `
      <div class="cs2-toast-icon">${isError ? '❌' : '🎯'}</div>
      <div class="cs2-toast-content">
        <div class="cs2-toast-title">CS2 Nade Scraper</div>
        <div class="cs2-toast-msg">${message}</div>
      </div>
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('cs2-toast-show');
    }, 10);

    setTimeout(() => {
      toast.classList.remove('cs2-toast-show');
      setTimeout(() => toast.remove(), 400);
    }, 3500);
  }

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

          const reader = new FileReader();
          reader.onloadend = () => {
            resolve({
              blobUrl: outUrl,
              dataUrl: reader.result,
              mimeType,
              size: outBlob.size,
              ext: mimeType.includes('mp4') ? 'mp4' : 'webm'
            });
          };
          reader.onerror = () => {
            resolve({
              blobUrl: outUrl,
              mimeType,
              size: outBlob.size,
              ext: mimeType.includes('mp4') ? 'mp4' : 'webm'
            });
          };
          reader.readAsDataURL(outBlob);
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

  // In-Page Schnell-Download-Button einfügen
  function injectQuickButton() {
    if (!isNadePage()) return;
    if (document.getElementById('cs2-scraper-quick-btn')) return;

    // Suche nach Tabs (Video / Lineup) auf der Seite
    const tabsContainer = document.querySelector('.tabs');
    const targetParent = tabsContainer ? tabsContainer.parentElement : null;

    const btn = document.createElement('button');
    btn.id = 'cs2-scraper-quick-btn';
    btn.className = 'cs2-quick-download-btn';
    btn.title = 'Granaten-Lineup (Video, Foto & Infos) herunterladen';
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      <span>Lineup Scrapen</span>
    `;

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.innerHTML = `
        <span class="cs2-spinner"></span>
        <span>Vorbereitung...</span>
      `;

      let lineupData = scrapeNadeData();
      let settings = {};
      try {
        settings = await chrome.storage.local.get(null);
      } catch (e) {}

      const vQuality = settings.videoQuality || 'lq';

      if (settings.downloadVideo !== false && vQuality === 'reencode') {
        try {
          btn.innerHTML = `
            <span class="cs2-spinner"></span>
            <span>Komprimiere Video...</span>
          `;
          showToast('Komprimiere Video im Browser (720p Re-Encode)...');
          const srcUrl = lineupData.videoLqUrl || lineupData.videoUrl;
          const compressed = await reencodeVideo(srcUrl, 720, 1600000);
          lineupData.compressedVideoBlobUrl = compressed.blobUrl;
          lineupData.compressedVideoDataUrl = compressed.dataUrl;
          lineupData.compressedVideoExt = compressed.ext;
        } catch (e) {
          console.warn('Re-encode im Tab fehlgeschlagen, verwende LQ-Fallback:', e);
        }
      }

      btn.innerHTML = `
        <span class="cs2-spinner"></span>
        <span>Lädt herunter...</span>
      `;

      chrome.runtime.sendMessage({ action: 'downloadLineup', data: lineupData }, (response) => {
        btn.disabled = false;
        btn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Fertig!</span>
        `;
        showToast(response?.message || 'Lineup erfolgreich heruntergeladen!');
        setTimeout(() => {
          btn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>Lineup Scrapen</span>
          `;
        }, 2500);
      });
    });

    if (tabsContainer) {
      tabsContainer.appendChild(btn);
    } else {
      btn.classList.add('cs2-floating-btn');
      document.body.appendChild(btn);
    }
  }

  // Beobachte URL-Änderungen durch Next.js Router (Single-Page-App-Navigation)
  let lastUrl = window.location.href;
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      setTimeout(() => {
        injectQuickButton();
      }, 500);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Initial ausführen nach Laden der Seite
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(injectQuickButton, 500));
  } else {
    setTimeout(injectQuickButton, 500);
  }
})();
