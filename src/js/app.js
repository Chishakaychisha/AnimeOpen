const THEME_WALLPAPERS = {
  oled: 'assets/wallpapers/oled.svg',
  cyberpunk: 'assets/wallpapers/cyberpunk.jpg',
  sakura: 'assets/wallpapers/sakura.jpg',
  emerald: 'assets/wallpapers/emerald.jpg',
  bloodmoon: 'assets/wallpapers/bloodmoon.svg',
  sunset: 'assets/wallpapers/sunset.svg'
};

class AnimeApp {
  constructor() {
    this.store = {
      libraryFolder: '',
      watchHistory: {},
      cachedMetadata: {},
      customMatches: {}
    };

    this.animeList = [];
    this.cinemaList = [];
    this.filteredList = [];
    this.selectedAnime = null;
    this.activeGenre = 'ALL';
    this.activeStatus = 'ALL';
    this.searchQuery = '';
    this.sortBy = 'recent';
    this.currentMode = 'anime';
    this._activeScanToken = 0;

    this.ui = new AnimeUI(this);
    this.player = new AnimePlayer(this);
    this.ostPlayer = new OSTPlayer();
    this.inAppBrowser = new InAppBrowser(this);

    this.init();
  }

  async init() {
    this.bindWindowControls();
    this.bindNavigation();
    this.bindSearchAndFilter();
    this.bindSettings();
    this.bindRematchModal();
    this.bindManualMetaModal();
    this.bindBatchRenameModal();
    this.bindUserGuide();
    this.bindRssModal();
    this.bindLanSharing();

    // Local Area Network (LAN) Peer Sharing listeners
    if (window.api?.onLanPeersChanged) {
      window.api.onLanPeersChanged((peers) => this.renderLanPeers(peers));
    }
    if (window.api?.onLanDownloadProgress) {
      window.api.onLanDownloadProgress((data) => this.handleLanDownloadProgress(data));
    }
    if (window.api?.onLanDownloadCompleted) {
      window.api.onLanDownloadCompleted((data) => this.handleLanDownloadCompleted(data));
    }

    // Live Folder Watcher real-time listener
    if (window.api?.onLibraryFolderChanged) {
      window.api.onLibraryFolderChanged(async (data) => {
        this.ui.showToast(`📁 Live Sync: Detected ${data.action} of "${data.filename}". Updating library...`);
        if (this.currentMode === 'cinema') {
          await this.scanCinemaLibrary(false);
        } else {
          await this.scanLibrary(false);
        }
      });
    }

    // Auto-Episode Downloader (RSS) notification listener
    if (window.api?.onRssNewEpisode) {
      window.api.onRssNewEpisode(async (data) => {
        this.ui.showToast(`🎉 Auto-downloaded [${data.title}] - Ep ${data.episode}! Added to your library.`);
        if (this.currentMode === 'anime') {
          await this.scanLibrary(false);
        }
      });
    }

    // Load persisted store
    this.store = await window.api.getStore();
    this.currentMode = this.store.activeLibraryMode || 'anime';
    this.initWallpaperSettings();
    this.applyTheme(this.store.theme || 'oled');
    this.bindThemeSelector();
    this.bindModeSwitcher();
    this.inAppBrowser.init();

    // Global Escape key handler to close any active modal or panel
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const openModals = document.querySelectorAll('.modal-overlay:not(.hidden)');
        openModals.forEach(m => m.classList.add('hidden'));
        document.getElementById('bookmarksPanel')?.classList.add('hidden');
      }
    });

    // Check if first-time user: automatically show the quick-start guide!
    if (!this.store.hasSeenUserGuide) {
      this.showUserGuide();
    }

    if (this.currentMode === 'cinema') {
      const activeFolder = this.store.cinemaFolder;
      if (activeFolder) {
        document.getElementById('currentFolderPathDisplay').textContent = activeFolder;
        await this.scanCinemaLibrary();
      } else {
        document.getElementById('currentFolderPathDisplay').textContent = 'No folder selected';
        this.ui.renderLibrary([]);
      }
    } else {
      if (this.store.libraryFolder) {
        document.getElementById('currentFolderPathDisplay').textContent = this.store.libraryFolder;
        await this.scanLibrary();
      } else {
        document.getElementById('currentFolderPathDisplay').textContent = 'No folder selected';
        this.ui.renderLibrary([]);
      }
    }
  }

  bindWindowControls() {
    document.getElementById('btnWinMin')?.addEventListener('click', () => window.api.minimizeWindow());
    document.getElementById('btnWinMax')?.addEventListener('click', () => window.api.maximizeWindow());
    document.getElementById('btnWinClose')?.addEventListener('click', () => window.api.closeWindow());
  }

  bindNavigation() {
    // Back from Detail to Library
    document.getElementById('btnBackToLibrary')?.addEventListener('click', () => {
      this.showLibraryView();
    });

    // Logo click returns to library
    document.getElementById('appLogo')?.addEventListener('click', () => {
      this.showLibraryView();
    });

    // Select Folder prompt buttons
    document.getElementById('btnSelectFolderPrompt')?.addEventListener('click', () => this.promptSelectFolder());
    document.getElementById('btnQuickFolderSelect')?.addEventListener('click', () => this.promptSelectFolder());
  }

  bindSearchAndFilter() {
    const searchInput = document.getElementById('searchAnimeInput');
    const sortSelect = document.getElementById('sortSelect');
    const genreFilters = document.getElementById('genreFilterContainer');
    const statusFilters = document.getElementById('statusFilterContainer');

    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      this.applyFilters();
    });

    sortSelect?.addEventListener('change', (e) => {
      this.sortBy = e.target.value;
      this.applyFilters();
    });

    statusFilters?.addEventListener('click', (e) => {
      if (e.target.classList.contains('filter-pill')) {
        statusFilters.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
        e.target.classList.add('active');
        this.activeStatus = e.target.dataset.status || 'ALL';
        this.applyFilters();
      }
    });

    genreFilters?.addEventListener('click', (e) => {
      if (e.target.classList.contains('filter-pill')) {
        genreFilters.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
        e.target.classList.add('active');
        this.activeGenre = e.target.dataset.genre || 'ALL';
        this.applyFilters();
      }
    });
  }

  bindSettings() {
    const settingsBtn = document.getElementById('btnOpenSettings');
    const settingsModal = document.getElementById('settingsModal');
    const closeBtn = document.getElementById('btnCloseSettings');
    const changeFolderBtn = document.getElementById('btnSettingsChangeFolder');
    const rescanBtn = document.getElementById('btnSettingsRescan');
    const clearCacheBtn = document.getElementById('btnSettingsClearCache');

    settingsBtn?.addEventListener('click', () => {
      document.getElementById('settingsCurrentFolder').textContent = this.store.libraryFolder || 'None selected';
      document.getElementById('settingsAnimeCount').textContent = `${this.animeList.length} anime series`;
      let totalEps = 0;
      this.animeList.forEach(a => totalEps += a.episodes.length);
      document.getElementById('settingsEpCount').textContent = `${totalEps} episodes found`;
      settingsModal.classList.remove('hidden');
    });

    closeBtn?.addEventListener('click', () => settingsModal.classList.add('hidden'));
    document.getElementById('btnSettingsClose')?.addEventListener('click', () => settingsModal.classList.add('hidden'));
    settingsModal?.addEventListener('click', (e) => {
      if (e.target === settingsModal) settingsModal.classList.add('hidden');
    });

    changeFolderBtn?.addEventListener('click', async () => {
      await this.promptSelectFolder();
      document.getElementById('settingsCurrentFolder').textContent = this.store.libraryFolder;
    });

    rescanBtn?.addEventListener('click', async () => {
      settingsModal.classList.add('hidden');
      await this.scanLibrary(true);
    });

    clearCacheBtn?.addEventListener('click', async () => {
      this.store.cachedMetadata = {};
      await window.api.saveStore(this.store);
      this.ui.showToast('Metadata cache cleared. Rescanning...');
      settingsModal.classList.add('hidden');
      await this.scanLibrary(true);
    });

    // Auto-start on Windows Startup & Wake checkbox
    const autoStartCheckbox = document.getElementById('settingAutoStart');
    if (autoStartCheckbox && window.api.getAutoStart) {
      window.api.getAutoStart().then(enabled => {
        autoStartCheckbox.checked = !!enabled || !!this.store.autoStart;
      });

      autoStartCheckbox.addEventListener('change', async () => {
        const res = await window.api.setAutoStart(autoStartCheckbox.checked);
        if (res && res.success) {
          this.store.autoStart = autoStartCheckbox.checked;
          this.ui.showToast(autoStartCheckbox.checked
            ? '🚀 AnimeOpen will launch automatically on Windows boot & wake'
            : 'Auto-start on Windows startup disabled');
        }
      });
    }

    // Local Area Network (LAN) Peer Sharing Settings
    const lanEnabledCheckbox = document.getElementById('settingLanEnabled');
    const lanDeviceNameInput = document.getElementById('settingLanDeviceName');
    const btnSaveLanDeviceName = document.getElementById('btnSaveLanDeviceName');
    const lanIpInfo = document.getElementById('settingLanIpInfo');

    if (window.api?.lanGetStatus) {
      window.api.lanGetStatus().then(status => {
        if (lanEnabledCheckbox) lanEnabledCheckbox.checked = !!status.enabled;
        if (lanDeviceNameInput) lanDeviceNameInput.value = status.deviceName || '';
        if (lanIpInfo) lanIpInfo.textContent = `LAN IP: ${status.myIp}:${status.httpPort}`;
      }).catch(() => {});
    }

    lanEnabledCheckbox?.addEventListener('change', async () => {
      const enable = lanEnabledCheckbox.checked;
      const status = await window.api.lanSetEnabled(enable);
      this.ui.showToast(enable ? '📶 LAN Sharing enabled on Wi-Fi' : 'LAN Sharing disabled');
      this.updateLanUiStatus(status);
    });

    btnSaveLanDeviceName?.addEventListener('click', async () => {
      const name = lanDeviceNameInput?.value.trim();
      if (!name) return;
      const status = await window.api.lanSetDeviceName(name);
      this.ui.showToast(`Saved Wi-Fi device nickname: "${name}"`);
      this.updateLanUiStatus(status);
    });
  }

  bindRematchModal() {
    const modal = document.getElementById('rematchModal');
    const closeBtn = document.getElementById('btnCloseRematch');
    const cancelBtn = document.getElementById('btnCancelRematch');
    const searchBtn = document.getElementById('btnRematchSearch');
    const searchInput = document.getElementById('rematchSearchInput');

    closeBtn?.addEventListener('click', () => modal.classList.add('hidden'));
    cancelBtn?.addEventListener('click', () => modal.classList.add('hidden'));
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });

    searchBtn?.addEventListener('click', () => {
      this.executeRematchSearch(searchInput.value);
    });

    searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.executeRematchSearch(searchInput.value);
      }
    });
  }

  bindManualMetaModal() {
    const modal = document.getElementById('manualMetaModal');
    const closeBtn = document.getElementById('btnCloseManualMeta');
    const cancelBtn = document.getElementById('btnCancelManualMeta');
    const saveBtn = document.getElementById('btnSaveManualMeta');
    const rematchBtn = document.getElementById('btnManualMetaRematch');
    const coverInput = document.getElementById('manualMetaCover');
    const coverPreview = document.getElementById('manualCoverPreview');

    closeBtn?.addEventListener('click', () => modal.classList.add('hidden'));
    cancelBtn?.addEventListener('click', () => modal.classList.add('hidden'));
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });

    coverInput?.addEventListener('input', (e) => {
      const url = e.target.value.trim();
      if (url) {
        coverPreview.src = url;
        coverPreview.style.display = 'block';
      } else {
        coverPreview.style.display = 'none';
      }
    });

    rematchBtn?.addEventListener('click', () => {
      modal.classList.add('hidden');
      if (this.selectedAnime) {
        this.openRematchModal(this.selectedAnime);
      }
    });

    saveBtn?.addEventListener('click', async () => {
      if (!this.selectedAnime) return;
      const title = document.getElementById('manualMetaTitle').value.trim() || this.selectedAnime.title;
      const cover = document.getElementById('manualMetaCover').value.trim();
      const description = document.getElementById('manualMetaDesc').value.trim();
      const year = parseInt(document.getElementById('manualMetaYear').value) || null;
      const score = parseInt(document.getElementById('manualMetaScore').value) || null;
      const genres = document.getElementById('manualMetaGenres').value
        .split(',')
        .map(g => g.trim())
        .filter(Boolean);

      const manualMeta = {
        title,
        romajiTitle: title,
        nativeTitle: title,
        description: description || 'No synopsis available.',
        cover: cover || null,
        banner: cover || null,
        score: score,
        year: year,
        status: 'MANUAL',
        format: 'TV',
        genres: genres.length > 0 ? genres : ['Animation'],
        episodesCount: this.selectedAnime.episodes.length,
        studio: 'Custom'
      };

      this.selectedAnime.metadata = manualMeta;
      this.store.cachedMetadata[this.selectedAnime.title.toLowerCase()] = manualMeta;
      await window.api.saveStore(this.store);

      modal.classList.add('hidden');
      this.ui.showToast(`Saved metadata for "${title}"!`);
      this.ui.renderAnimeDetail(this.selectedAnime);
      this.applyFilters();
    });
  }

  async promptSelectFolder() {
    const folder = await window.api.selectFolder();
    if (folder) {
      if (this.currentMode === 'cinema') {
        this.store.cinemaFolder = folder;
        await window.api.saveStore(this.store);
        const folderDisplay = document.getElementById('currentFolderPathDisplay');
        if (folderDisplay) folderDisplay.textContent = folder;
        const cinemaFolderEl = document.getElementById('settingsCinemaFolder');
        if (cinemaFolderEl) cinemaFolderEl.textContent = folder;
        this.ui.showToast(`Movies & TV Shows library set to ${folder}`);
        await this.scanCinemaLibrary();
      } else {
        this.store.libraryFolder = folder;
        await window.api.saveStore(this.store);
        const folderDisplay = document.getElementById('currentFolderPathDisplay');
        if (folderDisplay) folderDisplay.textContent = folder;
        const animeFolderEl = document.getElementById('settingsCurrentFolder');
        if (animeFolderEl) animeFolderEl.textContent = folder;
        this.ui.showToast(`Anime library set to ${folder}`);
        await this.scanLibrary();
      }
    }
  }

  async scanLibrary(forceRefreshMetadata = false) {
    const scanToken = ++this._activeScanToken;
    if (!this.store.libraryFolder || this.currentMode !== 'anime') {
      const scanSpinner = document.getElementById('scanSpinner');
      if (scanSpinner) scanSpinner.classList.add('hidden');
      return;
    }

    this.ui.showToast('Scanning anime directory...');
    const scanSpinner = document.getElementById('scanSpinner');
    const scanSpinnerText = scanSpinner ? scanSpinner.querySelector('span:last-child') : null;
    if (scanSpinner) {
      if (scanSpinnerText) scanSpinnerText.textContent = 'Scanning anime files...';
      scanSpinner.classList.remove('hidden');
    }

    const result = await window.api.scanLibrary(this.store.libraryFolder);
    if (this._activeScanToken !== scanToken || this.currentMode !== 'anime') {
      if (scanSpinner) scanSpinner.classList.add('hidden');
      return;
    }

    if (!result.success) {
      this.ui.showToast(`Error scanning: ${result.error}`);
      if (scanSpinner) scanSpinner.classList.add('hidden');
      return;
    }

    // Process raw files into structured Anime series
    this.animeList = AnimeScanner.processScannedFiles(result.files, this.store.libraryFolder);

    // Initial render with titles immediately
    this.applyFilters();
    this.ui.showToast(`Found ${this.animeList.length} anime series. Fetching details...`);
    if (window.api?.lanUpdateLibrary) window.api.lanUpdateLibrary(this.animeList);

    // Fetch AniList metadata in background
    await this.fetchMetadataForLibrary(forceRefreshMetadata, scanToken);

    if (this._activeScanToken === scanToken && scanSpinner) {
      scanSpinner.classList.add('hidden');
    }
    if (window.api?.lanUpdateLibrary) window.api.lanUpdateLibrary(this.animeList);
  }

  async fetchMetadataForLibrary(forceRefresh = false, scanToken = this._activeScanToken) {
    let updatedCount = 0;
    const scanSpinner = document.getElementById('scanSpinner');
    const scanSpinnerText = scanSpinner ? scanSpinner.querySelector('span:last-child') : null;

    // Pass 1: apply cached metadata instantly (no spinner, no delay)
    let needsFetch = [];
    for (const anime of this.animeList) {
      if (this._activeScanToken !== scanToken || this.currentMode !== 'anime') {
        if (scanSpinner) scanSpinner.classList.add('hidden');
        return;
      }

      const matchKey = anime.title.toLowerCase();

      // Check cache with multiple fallbacks (exact key, rawTitle, or meta.title)
      let cached = this.store.cachedMetadata[matchKey];
      if (!cached && anime.rawTitle) {
        cached = this.store.cachedMetadata[anime.rawTitle.toLowerCase()];
      }
      if (!cached) {
        for (const [k, v] of Object.entries(this.store.cachedMetadata)) {
          if (v && v.title && v.title.toLowerCase() === matchKey) {
            cached = v;
            this.store.cachedMetadata[matchKey] = v; // save alias
            break;
          }
        }
      }

      if (this.store.customMatches[anime.id]) {
        if (!forceRefresh && cached) {
          anime.metadata = cached;
          this.updateCardInDOM(anime);
          continue;
        }
        needsFetch.push({ anime, type: 'custom', customId: this.store.customMatches[anime.id] });
        continue;
      }

      if (!forceRefresh && cached) {
        anime.metadata = cached;
        this.updateCardInDOM(anime);
        continue;
      }

      needsFetch.push({ anime, type: 'search' });
    }

    if (this._activeScanToken !== scanToken || this.currentMode !== 'anime') {
      if (scanSpinner) scanSpinner.classList.add('hidden');
      return;
    }

    if (needsFetch.length === 0) {
      // Everything was cached — populate filters and done
      this.populateGenreFilters();
      if (scanSpinner) scanSpinner.classList.add('hidden');
      return;
    }

    // Pass 2: fetch only what is missing from AniList
    if (scanSpinner) scanSpinner.classList.remove('hidden');

    for (let i = 0; i < needsFetch.length; i++) {
      if (this._activeScanToken !== scanToken || this.currentMode !== 'anime') {
        if (scanSpinner) scanSpinner.classList.add('hidden');
        return;
      }

      const { anime, type, customId } = needsFetch[i];
      const matchKey = anime.title.toLowerCase();

      if (scanSpinnerText) {
        scanSpinnerText.textContent = `Fetching metadata (${i + 1}/${needsFetch.length}): ${anime.title.slice(0, 30)}...`;
      }

      try {
        const meta = type === 'custom'
          ? await AnimeMetadata.fetchById(customId)
          : await AnimeMetadata.fetchMetadata(anime.title);

        if (this._activeScanToken !== scanToken || this.currentMode !== 'anime') {
          if (scanSpinner) scanSpinner.classList.add('hidden');
          return;
        }

        if (meta) {
          // Download cover and banner images locally for offline use
          await this.cacheImagesLocally(meta, matchKey);

          anime.metadata = meta;
          this.store.cachedMetadata[matchKey] = meta;
          updatedCount++;
          this.updateCardInDOM(anime);
        }
      } catch (err) {
        console.warn('Metadata query failed for:', anime.title, err);
      }

      // Save every 5 to avoid losing progress on large libraries
      if (updatedCount > 0 && updatedCount % 5 === 0) {
        await window.api.saveStore(this.store);
      }

      // Throttle to respect AniList rate limit (300ms gap)
      await new Promise(r => setTimeout(r, 300));
    }

    if (this._activeScanToken !== scanToken || this.currentMode !== 'anime') {
      if (scanSpinner) scanSpinner.classList.add('hidden');
      return;
    }

    if (scanSpinner) scanSpinner.classList.add('hidden');

    if (updatedCount > 0) {
      await window.api.saveStore(this.store);
      this.populateGenreFilters();
      this.ui.showToast(`Fetched details for ${updatedCount} anime!`);
    }
  }

  /**
   * Download cover and banner images to local disk and store local paths in meta.
   * This means images work offline and survive network changes.
   */
  async cacheImagesLocally(meta, cacheKey) {
    if (!window.api.downloadImageCache) return;
    const safeKey = cacheKey.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);

    // Cache cover image
    if (meta.cover && !meta.localCover) {
      try {
        const res = await window.api.downloadImageCache({ url: meta.cover, key: safeKey, type: 'cover' });
        if (res.success) {
          meta.localCover = res.localPath;
        }
      } catch (_) {}
    }

    // Cache banner image
    if (meta.banner && !meta.localBanner) {
      try {
        const res = await window.api.downloadImageCache({ url: meta.banner, key: safeKey, type: 'banner' });
        if (res.success) {
          meta.localBanner = res.localPath;
        }
      } catch (_) {}
    }
  }

  updateCardInDOM(anime) {
    const card = document.querySelector(`.anime-card[data-id="${anime.id}"]`);
    if (!card || !anime.metadata) return;

    const meta = anime.metadata;
    // Prefer locally cached image, fall back to CDN URL
    const coverSrc = meta.localCover
      ? window.api.getLocalImageUrl(meta.localCover)
      : meta.cover;

    if (coverSrc) {
      const mediaWrapper = card.querySelector('.card-media-wrapper');
      if (mediaWrapper) {
        const fallbackCover = mediaWrapper.querySelector('.card-fallback-cover');
        let img = mediaWrapper.querySelector('.card-cover-img');
        if (!img) {
          img = document.createElement('img');
          img.className = 'card-cover-img';
          img.alt = anime.title;
          img.loading = 'lazy';
          mediaWrapper.prepend(img);
        }
        img.src = coverSrc;
        img.style.display = 'block';
        if (fallbackCover) fallbackCover.style.display = 'none';
      }
    }

    if (meta.score) {
      const badgesTop = card.querySelector('.card-badges-top');
      if (badgesTop && !badgesTop.querySelector('.score-badge')) {
        const scoreBadge = document.createElement('div');
        scoreBadge.className = 'card-badge score-badge';
        scoreBadge.textContent = `★ ${meta.score}`;
        badgesTop.prepend(scoreBadge);
      }
    }

    if (meta.title) {
      const cardTitle = card.querySelector('.card-title');
      if (cardTitle) {
        cardTitle.textContent = meta.title;
        cardTitle.title = meta.title;
      }
    }

    if (meta.romajiTitle || meta.year) {
      const subTitle = card.querySelector('.card-subtitle');
      if (subTitle) {
        subTitle.textContent = meta.romajiTitle || meta.year || '';
      }
    }
  }

  populateGenreFilters() {
    const genreContainer = document.getElementById('genreFilterContainer');
    if (!genreContainer) return;

    const sourceList = this.currentMode === 'cinema' ? this.cinemaList : this.animeList;
    const genresSet = new Set();
    sourceList.forEach(item => {
      (item.metadata?.genres || []).forEach(g => genresSet.add(g));
    });

    const active = this.activeGenre;
    genreContainer.innerHTML = `<button class="filter-pill ${active === 'ALL' ? 'active' : ''}" data-genre="ALL">All ${this.currentMode === 'cinema' ? 'Genres' : 'Anime'}</button>`;

    Array.from(genresSet).sort().slice(0, 12).forEach(genre => {
      const btn = document.createElement('button');
      btn.className = `filter-pill ${active === genre ? 'active' : ''}`;
      btn.dataset.genre = genre;
      btn.textContent = genre;
      genreContainer.appendChild(btn);
    });
  }

  applyFilters() {
    const sourceList = this.currentMode === 'cinema' ? this.cinemaList : this.animeList;
    let result = [...sourceList];

    // Search query
    if (this.searchQuery) {
      result = result.filter(item => {
        const title = (item.metadata?.title || item.title).toLowerCase();
        const romaji = (item.metadata?.romajiTitle || '').toLowerCase();
        const raw = (item.rawTitle || '').toLowerCase();
        const year = (item.year || item.metadata?.year || '').toString();
        const genres = (item.metadata?.genres || []).join(' ').toLowerCase();
        const fileMatch = (item.episodes || []).some(ep => (ep.fileName || '').toLowerCase().includes(this.searchQuery));
        return title.includes(this.searchQuery) || romaji.includes(this.searchQuery) || raw.includes(this.searchQuery) || year.includes(this.searchQuery) || genres.includes(this.searchQuery) || fileMatch;
      });
    }

    // Genre filter
    if (this.activeGenre !== 'ALL') {
      result = result.filter(item => {
        return (item.metadata?.genres || []).some(g => g.toLowerCase() === this.activeGenre.toLowerCase());
      });
    }

    // Watch status or Type filter (MOVIE vs TV for cinema, WATCHING/COMPLETED for anime)
    if (this.activeStatus !== 'ALL') {
      if (this.activeStatus === 'MOVIE') {
        result = result.filter(item => item.type === 'MOVIE' || item.isMovie);
      } else if (this.activeStatus === 'TV') {
        result = result.filter(item => item.type === 'TV' || item.isTv);
      } else {
        result = result.filter(item => {
          const status = this.store.animeWatchStatus?.[item.id] || 'WATCHING';
          return status === this.activeStatus;
        });
      }
    }

    // Sorting
    if (this.sortBy === 'title') {
      result.sort((a, b) => {
        const tA = (a.metadata?.title || a.title).toLowerCase();
        const tB = (b.metadata?.title || b.title).toLowerCase();
        return tA.localeCompare(tB);
      });
    } else if (this.sortBy === 'score') {
      result.sort((a, b) => {
        const sA = parseFloat(a.metadata?.score || 0);
        const sB = parseFloat(b.metadata?.score || 0);
        return sB - sA;
      });
    } else {
      // Recent
      result.sort((a, b) => b.lastModified - a.lastModified);
    }

    this.filteredList = result;
    const continueList = this.getContinueWatchingList();
    this.ui.renderLibrary(this.filteredList, continueList);
  }

  getContinueWatchingList() {
    const list = [];
    const sourceList = this.currentMode === 'cinema' ? this.cinemaList : this.animeList;
    for (const anime of sourceList) {
      if (!anime.episodes || anime.episodes.length === 0) continue;

      let inProgressEp = null;
      let inProgressHist = null;
      let lastCompletedIdx = -1;
      let mostRecentTime = 0;

      for (let i = 0; i < anime.episodes.length; i++) {
        const ep = anime.episodes[i];
        const hist = this.store.watchHistory[ep.filePath];
        if (hist) {
          if (hist.lastWatched > mostRecentTime) {
            mostRecentTime = hist.lastWatched;
          }
          if (!hist.completed && hist.progress > 15) {
            inProgressEp = ep;
            inProgressHist = hist;
          }
          if (hist.completed) {
            lastCompletedIdx = Math.max(lastCompletedIdx, i);
          }
        }
      }

      if (inProgressEp && inProgressHist) {
        list.push({
          anime,
          episode: inProgressEp,
          history: inProgressHist,
          isNextUp: false
        });
      } else if (lastCompletedIdx >= 0 && lastCompletedIdx < anime.episodes.length - 1) {
        const nextEp = anime.episodes[lastCompletedIdx + 1];
        list.push({
          anime,
          episode: nextEp,
          history: { progress: 0, duration: 1, completed: false, lastWatched: mostRecentTime },
          isNextUp: true
        });
      }
    }

    list.sort((a, b) => (b.history?.lastWatched || 0) - (a.history?.lastWatched || 0));
    return list;
  }

  getSuggestedNextEpisode(anime) {
    let lastWatchedIdx = -1;
    for (let i = 0; i < anime.episodes.length; i++) {
      const ep = anime.episodes[i];
      const hist = this.store.watchHistory[ep.filePath];
      if (hist && !hist.completed && hist.progress > 15) {
        return ep; // In progress
      }
      if (hist?.completed) {
        lastWatchedIdx = i;
      }
    }

    if (lastWatchedIdx >= 0 && lastWatchedIdx < anime.episodes.length - 1) {
      return anime.episodes[lastWatchedIdx + 1];
    }

    return anime.episodes[0] || null;
  }

  updateWatchProgress(filePath, progress, duration, completed, animeId, episodeId) {
    this.store.watchHistory[filePath] = {
      progress: Math.floor(progress),
      duration: Math.floor(duration),
      completed: completed,
      lastWatched: Date.now(),
      animeId,
      episodeId
    };

    // Save debounced
    clearTimeout(this._saveDebounce);
    this._saveDebounce = setTimeout(() => {
      window.api.saveStore(this.store);
    }, 1500);
  }

  showAnimeDetail(anime) {
    this.selectedAnime = anime;
    document.getElementById('libraryView').classList.add('hidden');
    document.getElementById('detailView').classList.remove('hidden');
    this.ui.renderAnimeDetail(anime);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  showLibraryView() {
    this.selectedAnime = null;
    document.getElementById('detailView').classList.add('hidden');
    document.getElementById('libraryView').classList.remove('hidden');
    this.applyFilters();
  }

  onPlayerClosed() {
    if (this.selectedAnime) {
      this.ui.renderAnimeDetail(this.selectedAnime);
    } else {
      this.applyFilters();
    }
  }

  openManualMetaModal(anime) {
    const modal = document.getElementById('manualMetaModal');
    const titleInput = document.getElementById('manualMetaTitle');
    const coverInput = document.getElementById('manualMetaCover');
    const coverPreview = document.getElementById('manualCoverPreview');
    const descInput = document.getElementById('manualMetaDesc');
    const yearInput = document.getElementById('manualMetaYear');
    const scoreInput = document.getElementById('manualMetaScore');
    const genresInput = document.getElementById('manualMetaGenres');

    const meta = anime.metadata || {};
    titleInput.value = meta.title || anime.title || '';
    coverInput.value = meta.cover || '';
    descInput.value = meta.description || '';
    yearInput.value = meta.year || '';
    scoreInput.value = meta.score || '';
    genresInput.value = (meta.genres || []).join(', ');

    if (meta.cover) {
      coverPreview.src = meta.cover;
      coverPreview.style.display = 'block';
    } else {
      coverPreview.style.display = 'none';
    }

    modal.classList.remove('hidden');
  }

  async openRematchModal(anime) {
    const modal = document.getElementById('rematchModal');
    const input = document.getElementById('rematchSearchInput');
    const resultsContainer = document.getElementById('rematchResults');

    modal.classList.remove('hidden');
    input.value = anime.metadata?.title || anime.title;
    resultsContainer.innerHTML = '<div class="rematch-loading">Searching AniList...</div>';

    this.executeRematchSearch(input.value);
  }

  async executeRematchSearch(query) {
    const resultsContainer = document.getElementById('rematchResults');
    resultsContainer.innerHTML = '<div class="rematch-loading">Searching AniList...</div>';

    const results = await AnimeMetadata.searchMultiple(query);
    if (!results || results.length === 0) {
      resultsContainer.innerHTML = '<div class="rematch-empty">No results found for this title.</div>';
      return;
    }

    resultsContainer.innerHTML = '';
    results.forEach(item => {
      const div = document.createElement('div');
      div.className = 'rematch-item';
      div.innerHTML = `
        <img class="rematch-thumb" src="${item.cover || ''}" alt="${item.title}" />
        <div class="rematch-info">
          <h4>${item.title}</h4>
          <p>${item.romajiTitle || ''} • ${item.year || ''} • ${item.format}</p>
          <span class="rematch-score">★ ${item.score || 'N/A'}</span>
        </div>
      `;
      div.onclick = async () => {
        if (!this.selectedAnime) return;
        this.selectedAnime.metadata = item;
        this.store.customMatches[this.selectedAnime.id] = item.anilistId;
        this.store.cachedMetadata[this.selectedAnime.title.toLowerCase()] = item;
        await window.api.saveStore(this.store);

        document.getElementById('rematchModal').classList.add('hidden');
        this.ui.showToast(`Matched to "${item.title}"!`);
        this.ui.renderAnimeDetail(this.selectedAnime);
      };
      resultsContainer.appendChild(div);
    });
  }

  bindThemeSelector() {
    const container = document.getElementById('themeChipsContainer');
    const autoSkipCheckbox = document.getElementById('settingAutoSkip');

    if (autoSkipCheckbox) {
      autoSkipCheckbox.checked = !!this.store.autoSkip;
      autoSkipCheckbox.onchange = async (e) => {
        this.store.autoSkip = e.target.checked;
        await window.api.saveStore(this.store);
        this.ui.showToast(this.store.autoSkip ? 'Auto-skip OP/ED enabled' : 'Auto-skip disabled');
      };
    }

    const introBumperCheckbox = document.getElementById('settingIntroBumper');
    if (introBumperCheckbox) {
      introBumperCheckbox.checked = this.store.playIntroBumper !== false;
      introBumperCheckbox.onchange = async (e) => {
        this.store.playIntroBumper = e.target.checked;
        await window.api.saveStore(this.store);
        this.ui.showToast(this.store.playIntroBumper ? 'Cinematic Intro Bumper enabled' : 'Cinematic Intro Bumper disabled');
      };
    }

    const openGuideBtn = document.getElementById('btnOpenUserGuideFromSettings');
    openGuideBtn?.addEventListener('click', () => {
      document.getElementById('settingsModal')?.classList.add('hidden');
      this.showUserGuide();
    });

    if (!container) return;
    const currentTheme = this.store.theme || 'oled';
    container.querySelectorAll('.theme-chip').forEach(chip => {
      if (chip.dataset.theme === currentTheme) chip.classList.add('active');
      chip.addEventListener('click', async () => {
        const theme = chip.dataset.theme;
        this.applyTheme(theme);
        container.querySelectorAll('.theme-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.store.theme = theme;
        await window.api.saveStore(this.store);
        this.ui.showToast(`Applied ${chip.textContent.trim()} theme!`);
      });
    });
  }

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    this.updateWallpaper(theme);
  }

  updateWallpaper(theme) {
    let wallpaperUrl = '';
    if (this.store.customWallpaper) {
      wallpaperUrl = window.api.getLocalImageUrl(this.store.customWallpaper);
    } else {
      wallpaperUrl = THEME_WALLPAPERS[theme] || THEME_WALLPAPERS.oled;
    }
    this.transitionWallpaper(wallpaperUrl);
  }

  transitionWallpaper(newUrl) {
    const layerA = document.getElementById('wallpaperLayerA');
    const layerB = document.getElementById('wallpaperLayerB');
    if (!layerA || !layerB) return;

    const isALayerActive = layerA.classList.contains('active');
    const incoming = isALayerActive ? layerB : layerA;
    const outgoing = isALayerActive ? layerA : layerB;

    const img = new Image();
    img.src = newUrl;
    img.onload = () => {
      incoming.style.backgroundImage = `url('${newUrl}')`;
      incoming.classList.add('active');
      outgoing.classList.remove('active');
    };
    img.onerror = () => {
      incoming.style.backgroundImage = `url('${newUrl}')`;
      incoming.classList.add('active');
      outgoing.classList.remove('active');
    };
  }

  initWallpaperSettings() {
    const opacitySlider = document.getElementById('settingWallpaperOpacity');
    const blurSlider = document.getElementById('settingWallpaperBlur');
    const opacityVal = document.getElementById('wallpaperOpacityVal');
    const blurVal = document.getElementById('wallpaperBlurVal');
    const btnCustom = document.getElementById('btnChooseCustomWallpaper');
    const btnReset = document.getElementById('btnResetWallpaper');

    const savedOpacity = this.store.wallpaperOpacity !== undefined ? this.store.wallpaperOpacity : 68;
    const savedBlur = this.store.wallpaperBlur !== undefined ? this.store.wallpaperBlur : 0;

    document.documentElement.style.setProperty('--wallpaper-opacity', (savedOpacity / 100).toFixed(2));
    document.documentElement.style.setProperty('--wallpaper-blur', `${savedBlur}px`);

    if (opacitySlider) {
      opacitySlider.value = savedOpacity;
      if (opacityVal) opacityVal.textContent = `${savedOpacity}%`;
      opacitySlider.oninput = async (e) => {
        const val = parseInt(e.target.value, 10);
        if (opacityVal) opacityVal.textContent = `${val}%`;
        document.documentElement.style.setProperty('--wallpaper-opacity', (val / 100).toFixed(2));
        this.store.wallpaperOpacity = val;
        await window.api.saveStore(this.store);
      };
    }

    if (blurSlider) {
      blurSlider.value = savedBlur;
      if (blurVal) blurVal.textContent = `${savedBlur}px`;
      blurSlider.oninput = async (e) => {
        const val = parseInt(e.target.value, 10);
        if (blurVal) blurVal.textContent = `${val}px`;
        document.documentElement.style.setProperty('--wallpaper-blur', `${val}px`);
        this.store.wallpaperBlur = val;
        await window.api.saveStore(this.store);
      };
    }

    if (btnCustom) {
      btnCustom.onclick = async () => {
        const customPath = await window.api.selectWallpaper();
        if (customPath) {
          this.store.customWallpaper = customPath;
          await window.api.saveStore(this.store);
          this.updateWallpaper(this.store.theme || 'oled');
          this.ui.showToast('Applied custom wallpaper background!');
        }
      };
    }

    if (btnReset) {
      btnReset.onclick = async () => {
        if (this.store.customWallpaper) {
          delete this.store.customWallpaper;
          await window.api.saveStore(this.store);
          this.updateWallpaper(this.store.theme || 'oled');
          this.ui.showToast('Reset to theme wallpaper!');
        } else {
          this.ui.showToast('Already using theme wallpaper.');
        }
      };
    }
  }

  bindModeSwitcher() {
    const btnAnime = document.getElementById('modeBtnAnime');
    const btnCinema = document.getElementById('modeBtnCinema');
    const brandTitle = document.getElementById('appBrandTitle');
    const searchInput = document.getElementById('searchAnimeInput');
    const changeFolderCinemaBtn = document.getElementById('btnSettingsChangeCinemaFolder');

    const setMode = async (mode) => {
      // Invalidate running scans immediately
      const scanToken = ++this._activeScanToken;

      // Close detail view if open
      if (this.selectedAnime) {
        this.selectedAnime = null;
        document.getElementById('detailView')?.classList.add('hidden');
        document.getElementById('libraryView')?.classList.remove('hidden');
      }

      // Hide any lingering scan spinner
      const scanSpinner = document.getElementById('scanSpinner');
      if (scanSpinner) scanSpinner.classList.add('hidden');

      // Clear search and genre filters
      this.searchQuery = '';
      if (searchInput) searchInput.value = '';
      this.activeGenre = 'ALL';
      this.activeStatus = 'ALL';

      this.currentMode = mode;
      this.store.activeLibraryMode = mode;
      await window.api.saveStore(this.store);

      // Notify in-app browser to switch its sites, default URL, target folder and bookmarks
      if (this.inAppBrowser) {
        this.inAppBrowser.setMode(mode);
      }

      if (mode === 'anime') {
        btnAnime?.classList.add('active');
        btnCinema?.classList.remove('active');
        if (brandTitle) brandTitle.innerHTML = 'ANIME<span class="brand-gradient">OPEN</span>';
        if (searchInput) searchInput.placeholder = 'Search anime title, romaji or file...';

        const animeFolder = this.store.libraryFolder || '';
        const folderDisplay = document.getElementById('currentFolderPathDisplay');
        if (folderDisplay) folderDisplay.textContent = animeFolder || 'No folder selected';

        const shelfTitle = document.getElementById('mainShelfTitle');
        if (shelfTitle) shelfTitle.textContent = 'All Anime Collections';

        this.updateStatusFiltersForMode('anime');
        this.populateGenreFilters();
        this.applyFilters();

        if (animeFolder) {
          if (this.animeList.length === 0) {
            await this.scanLibrary();
          }
        } else {
          this.animeList = [];
          this.ui.renderLibrary([]);
        }
      } else {
        btnCinema?.classList.add('active');
        btnAnime?.classList.remove('active');
        if (brandTitle) brandTitle.innerHTML = 'CINEMA<span class="brand-gradient" style="background:linear-gradient(135deg, #00c8ff 0%, #7000ff 100%);-webkit-background-clip:text;background-clip:text;">OPEN</span>';
        if (searchInput) searchInput.placeholder = 'Search movies, TV shows, actors, or release year...';

        const cinemaFolder = this.store.cinemaFolder || '';
        const folderDisplay = document.getElementById('currentFolderPathDisplay');
        if (folderDisplay) folderDisplay.textContent = cinemaFolder || 'No folder selected';

        const shelfTitle = document.getElementById('mainShelfTitle');
        if (shelfTitle) shelfTitle.textContent = 'Movies & TV Series Collections';

        this.updateStatusFiltersForMode('cinema');
        this.populateGenreFilters();
        this.applyFilters();

        if (cinemaFolder) {
          if (this.cinemaList.length === 0) {
            await this.scanCinemaLibrary();
          }
        } else {
          this.cinemaList = [];
          this.ui.renderLibrary([]);
        }
      }

      this.ui.showToast(`Switched to ${mode === 'anime' ? '🌸 Anime' : '🎬 Movies & TV Series'} Collection`);
    };

    btnAnime?.addEventListener('click', () => setMode('anime'));
    btnCinema?.addEventListener('click', () => setMode('cinema'));

    changeFolderCinemaBtn?.addEventListener('click', async () => {
      const folder = await window.api.selectFolder();
      if (folder) {
        this.store.cinemaFolder = folder;
        await window.api.saveStore(this.store);
        const folderEl = document.getElementById('settingsCinemaFolder');
        if (folderEl) folderEl.textContent = folder;
        if (this.currentMode === 'cinema') {
          document.getElementById('currentFolderPathDisplay').textContent = folder;
          await this.scanCinemaLibrary();
        }
        this.ui.showToast(`Movies & TV Shows folder set to ${folder}`);
      }
    });

    // Sync initial switcher state from store
    if (this.currentMode === 'cinema') {
      btnCinema?.classList.add('active');
      btnAnime?.classList.remove('active');
      if (brandTitle) brandTitle.innerHTML = 'CINEMA<span class="brand-gradient" style="background:linear-gradient(135deg, #00c8ff 0%, #7000ff 100%);-webkit-background-clip:text;background-clip:text;">OPEN</span>';
      if (searchInput) searchInput.placeholder = 'Search movies, TV shows, actors, or release year...';
      const shelfTitle = document.getElementById('mainShelfTitle');
      if (shelfTitle) shelfTitle.textContent = 'Movies & TV Series Collections';
      this.updateStatusFiltersForMode('cinema');
    }
  }

  updateStatusFiltersForMode(mode) {
    const statusContainer = document.getElementById('statusFilterContainer');
    if (!statusContainer) return;

    if (mode === 'cinema') {
      statusContainer.innerHTML = `
        <button class="filter-pill active" data-status="ALL">All Titles</button>
        <button class="filter-pill" data-status="MOVIE">🎥 Movies</button>
        <button class="filter-pill" data-status="TV">📺 TV Shows</button>
        <button class="filter-pill" data-status="WATCHING">👀 Watching</button>
        <button class="filter-pill" data-status="COMPLETED">✅ Completed</button>
      `;
    } else {
      statusContainer.innerHTML = `
        <button class="filter-pill active" data-status="ALL">All Anime</button>
        <button class="filter-pill" data-status="WATCHING">👀 Watching</button>
        <button class="filter-pill" data-status="COMPLETED">✅ Completed</button>
        <button class="filter-pill" data-status="PLAN_TO_WATCH">📋 Plan to Watch</button>
      `;
    }
    this.activeStatus = 'ALL';
  }

  async scanCinemaLibrary(forceRefreshMetadata = false) {
    const scanToken = ++this._activeScanToken;
    const folder = this.store.cinemaFolder;
    if (!folder || this.currentMode !== 'cinema') {
      const scanSpinner = document.getElementById('scanSpinner');
      if (scanSpinner) scanSpinner.classList.add('hidden');
      return;
    }

    this.ui.showToast('Scanning Movies & TV Series directory...');
    const scanSpinner = document.getElementById('scanSpinner');
    const scanSpinnerText = scanSpinner ? scanSpinner.querySelector('span:last-child') : null;
    if (scanSpinner) {
      if (scanSpinnerText) scanSpinnerText.textContent = 'Scanning cinema files...';
      scanSpinner.classList.remove('hidden');
    }

    const result = await window.api.scanLibrary(folder);
    if (this._activeScanToken !== scanToken || this.currentMode !== 'cinema') {
      if (scanSpinner) scanSpinner.classList.add('hidden');
      return;
    }

    if (!result.success) {
      this.ui.showToast(`Error scanning: ${result.error}`);
      if (scanSpinner) scanSpinner.classList.add('hidden');
      return;
    }

    // Process raw files into structured Movies and TV Series
    this.cinemaList = this.processCinemaFiles(result.files, folder);

    // Initial render with titles immediately
    this.populateGenreFilters();
    this.applyFilters();
    this.ui.showToast(`Found ${this.cinemaList.length} movies & shows. Resolving metadata...`);

    // Fetch Cinema metadata
    await this.fetchMetadataForCinema(forceRefreshMetadata, scanToken);

    if (this._activeScanToken === scanToken && scanSpinner) {
      scanSpinner.classList.add('hidden');
    }
  }

  processCinemaFiles(files, baseFolder) {
    const VIDEO_EXTS = ['.mkv', '.mp4', '.avi', '.webm', '.mov', '.ts'];
    const videoFiles = files.filter(f => !f.isZipEntry && VIDEO_EXTS.includes(f.extension.toLowerCase()));

    const groups = new Map();

    for (const f of videoFiles) {
      const parsed = CinemaMetadata.parseMediaName(f.fileName);
      
      let groupKey = '';
      if (parsed.isTv) {
        groupKey = 'tv_' + parsed.cleanTitle.toLowerCase();
      } else {
        groupKey = 'movie_' + parsed.cleanTitle.toLowerCase();
      }

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          id: groupKey,
          title: parsed.cleanTitle,
          type: parsed.isTv ? 'TV' : 'MOVIE',
          isTv: parsed.isTv,
          isMovie: !parsed.isTv,
          year: parsed.year,
          episodes: [],
          lastModified: f.mtime || Date.now(),
          metadata: null
        });
      }

      const item = groups.get(groupKey);
      if (f.mtime && f.mtime > item.lastModified) {
        item.lastModified = f.mtime;
      }

      item.episodes.push({
        filePath: f.filePath,
        fileName: f.fileName,
        fileSize: f.size,
        displayTitle: parsed.isTv ? `Season ${parsed.season} • Episode ${parsed.episode}` : 'Play Movie',
        season: parsed.season,
        episode: parsed.episode,
        mtime: f.mtime
      });
    }

    for (const item of groups.values()) {
      if (item.isTv) {
        item.episodes.sort((a, b) => {
          if (a.season !== b.season) return a.season - b.season;
          return a.episode - b.episode;
        });
      }
      item.totalEpisodes = item.episodes.length;
    }

    return Array.from(groups.values()).sort((a, b) => b.lastModified - a.lastModified);
  }

  async fetchMetadataForCinema(forceRefresh = false, scanToken = this._activeScanToken) {
    if (!this.store.cachedCinemaMetadata) this.store.cachedCinemaMetadata = {};

    for (let i = 0; i < this.cinemaList.length; i++) {
      if (this._activeScanToken !== scanToken || this.currentMode !== 'cinema') {
        const scanSpinner = document.getElementById('scanSpinner');
        if (scanSpinner) scanSpinner.classList.add('hidden');
        return;
      }

      const item = this.cinemaList[i];
      const matchKey = item.title.toLowerCase();

      let cached = this.store.cachedCinemaMetadata[matchKey];
      if (!forceRefresh && cached) {
        item.metadata = cached;
        this.updateCardInDOM(item);
        continue;
      }

      try {
        const meta = await CinemaMetadata.resolveMetadata(item.title, item.isTv, item.year);
        if (this._activeScanToken !== scanToken || this.currentMode !== 'cinema') {
          const scanSpinner = document.getElementById('scanSpinner');
          if (scanSpinner) scanSpinner.classList.add('hidden');
          return;
        }

        if (meta) {
          if (meta.cover && window.api.downloadImageCache) {
            try {
              const cacheRes = await window.api.downloadImageCache({
                url: meta.cover,
                key: `cinema_${matchKey}`,
                type: 'cover'
              });
              if (cacheRes.success) {
                meta.localCover = cacheRes.localPath;
              }
            } catch (_) {}
          }

          item.metadata = meta;
          this.store.cachedCinemaMetadata[matchKey] = meta;
          await window.api.saveStore(this.store);
          this.updateCardInDOM(item);
        }
      } catch (e) {
        console.warn(`Cinema metadata resolution failed for ${item.title}:`, e.message);
      }
    }

    if (this._activeScanToken !== scanToken || this.currentMode !== 'cinema') {
      const scanSpinner = document.getElementById('scanSpinner');
      if (scanSpinner) scanSpinner.classList.add('hidden');
      return;
    }

    this.populateGenreFilters();
  }

  bindBatchRenameModal() {
    const modal = document.getElementById('batchRenameModal');
    const closeBtn = document.getElementById('btnCloseBatchRename');
    const cancelBtn = document.getElementById('btnCancelBatchRename');
    const applyBtn = document.getElementById('btnApplyBatchRename');

    closeBtn?.addEventListener('click', () => modal.classList.add('hidden'));
    cancelBtn?.addEventListener('click', () => modal.classList.add('hidden'));

    applyBtn?.addEventListener('click', async () => {
      if (!this._pendingRenames || this._pendingRenames.length === 0) return;
      applyBtn.disabled = true;
      applyBtn.textContent = 'Renaming files...';
      const res = await window.api.batchRename(this._pendingRenames);
      applyBtn.disabled = false;
      applyBtn.textContent = 'Rename All Files Now';
      modal.classList.add('hidden');

      if (res.success) {
        this.ui.showToast(`Successfully renamed ${this._pendingRenames.length} file(s)!`);
        
        // Ensure the clean title has the existing metadata and local images attached
        const cleanTitleKey = this._pendingCleanTitle ? this._pendingCleanTitle.toLowerCase() : null;
        if (cleanTitleKey && this.selectedAnime?.metadata) {
          this.store.cachedMetadata[cleanTitleKey] = this.selectedAnime.metadata;
          await window.api.saveStore(this.store);
        }

        const prevId = this.selectedAnime?.id;
        const prevTitle = this._pendingCleanTitle;
        await this.scanLibrary(false);

        if (this.selectedAnime || prevTitle) {
          const updated = this.animeList.find(a => a.id === prevId || (prevTitle && a.title.toLowerCase() === prevTitle.toLowerCase()));
          if (updated) this.showAnimeDetail(updated);
        }
      } else {
        this.ui.showToast(`Error renaming: ${res.error}`);
      }
    });
  }

  openBatchRenameModal(anime) {
    const modal = document.getElementById('batchRenameModal');
    const tbody = document.getElementById('batchRenameTableBody');
    if (!modal || !tbody) return;

    const cleanTitle = (anime.metadata?.title || anime.title).replace(/[\\/:*?"<>|]/g, '');
    const renames = [];

    tbody.innerHTML = '';
    const nonZipEps = anime.episodes.filter(ep => !ep.isZip);

    if (nonZipEps.length === 0) {
      this.ui.showToast('Episodes inside ZIP archives cannot be renamed directly.');
      return;
    }

    nonZipEps.forEach((ep, idx) => {
      const oldName = ep.fileName;
      const ext = '.' + oldName.split('.').pop();
      const epNum = ep.episodeNumber || (idx + 1);
      const paddedEp = epNum.toString().padStart(2, '0');
      const newName = `${cleanTitle} - S01E${paddedEp} - Episode ${epNum}${ext}`;

      renames.push({ oldPath: ep.filePath, newName });

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="rename-original">${oldName}</td>
        <td class="rename-arrow">➔</td>
        <td class="rename-new">${newName}</td>
      `;
      tbody.appendChild(tr);
    });

    this._pendingRenames = renames;
    this._pendingCleanTitle = cleanTitle;
    modal.classList.remove('hidden');
  }

  bindUserGuide() {
    const modal = document.getElementById('userGuideModal');
    const closeBtn = document.getElementById('btnCloseUserGuide');
    const startBtn = document.getElementById('btnStartExploring');

    const dismiss = async () => {
      modal?.classList.add('hidden');
      if (!this.store.hasSeenUserGuide) {
        this.store.hasSeenUserGuide = true;
        await window.api.saveStore(this.store);
      }
    };

    closeBtn?.addEventListener('click', dismiss);
    startBtn?.addEventListener('click', async () => {
      await dismiss();
      if (!this.store.libraryFolder) {
        this.promptSelectFolder();
      }
    });
  }

  showUserGuide() {
    const modal = document.getElementById('userGuideModal');
    if (modal) modal.classList.remove('hidden');
  }

  bindRssModal() {
    const openBtn = document.getElementById('btnOpenRssModal');
    const modal = document.getElementById('rssModal');
    const closeBtn = document.getElementById('btnCloseRssModal');
    const cancelBtn = document.getElementById('btnCancelRssModal');
    const addBtn = document.getElementById('btnAddRssSub');
    const titleInput = document.getElementById('rssAnimeTitleInput');
    const qualitySelect = document.getElementById('rssQualitySelect');
    const checkNowBtn = document.getElementById('btnCheckRssNow');

    if (!modal) return;

    const closeModal = () => modal.classList.add('hidden');
    const openModal = async () => {
      modal.classList.remove('hidden');
      await this.loadAndRenderRssSubscriptions();
    };

    openBtn?.addEventListener('click', openModal);
    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);

    addBtn?.addEventListener('click', async () => {
      const title = titleInput?.value.trim();
      const quality = qualitySelect?.value || '1080p';
      if (!title) {
        this.ui.showToast('Please enter an anime title to subscribe');
        titleInput?.focus();
        return;
      }

      try {
        const subs = (await window.api.getRssSubscriptions()) || [];
        const exists = subs.some(s => s.title.toLowerCase() === title.toLowerCase());
        if (exists) {
          this.ui.showToast(`Already subscribed to "${title}"`);
          return;
        }

        subs.push({
          id: 'sub_' + Date.now(),
          title,
          quality,
          lastDownloadedEp: 0,
          addedAt: Date.now()
        });

        await window.api.saveRssSubscriptions(subs);
        this.ui.showToast(`🔔 Subscribed to "${title}" (${quality})! Auto-downloader active.`);
        if (titleInput) titleInput.value = '';
        await this.loadAndRenderRssSubscriptions();

        // Trigger immediate check in the background
        window.api.checkRss().catch(() => {});
      } catch (err) {
        console.error('Error adding RSS subscription:', err);
        this.ui.showToast('Failed to save subscription');
      }
    });

    titleInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addBtn?.click();
    });

    checkNowBtn?.addEventListener('click', async () => {
      checkNowBtn.textContent = '⏳ Checking RSS Feeds...';
      checkNowBtn.disabled = true;
      try {
        const res = await window.api.checkRss();
        this.ui.showToast(`⚡ RSS check complete: ${res?.downloadedCount || 0} new episodes queued!`);
        await this.loadAndRenderRssSubscriptions();
      } catch (err) {
        this.ui.showToast('Error checking RSS feeds');
      } finally {
        checkNowBtn.textContent = '⚡ Check Feeds Now';
        checkNowBtn.disabled = false;
      }
    });
  }

  async loadAndRenderRssSubscriptions() {
    const listEl = document.getElementById('rssSubscriptionsList');
    const emptyState = document.getElementById('rssEmptyState');
    if (!listEl) return;

    try {
      const subs = (await window.api.getRssSubscriptions()) || [];
      if (subs.length === 0) {
        listEl.innerHTML = '';
        emptyState?.classList.remove('hidden');
        return;
      }

      emptyState?.classList.add('hidden');
      listEl.innerHTML = '';

      subs.forEach(sub => {
        const card = document.createElement('div');
        card.className = 'rss-sub-card';
        card.innerHTML = `
          <div class="rss-sub-info">
            <div class="rss-sub-title" title="${sub.title}">${sub.title}</div>
            <div class="rss-sub-meta">
              <span class="rss-badge">${sub.quality || '1080p'}</span>
              <span>•</span>
              <span>${sub.lastDownloadedEp > 0 ? `Latest Ep: ${sub.lastDownloadedEp}` : 'Awaiting next episode'}</span>
            </div>
          </div>
          <div class="rss-sub-actions">
            <button class="btn-rss-remove" data-id="${sub.id}" title="Remove subscription">✕ Unsubscribe</button>
          </div>
        `;

        card.querySelector('.btn-rss-remove')?.addEventListener('click', async () => {
          const currentSubs = (await window.api.getRssSubscriptions()) || [];
          const updated = currentSubs.filter(s => s.id !== sub.id);
          await window.api.saveRssSubscriptions(updated);
          this.ui.showToast(`Removed subscription for "${sub.title}"`);
          await this.loadAndRenderRssSubscriptions();
        });

        listEl.appendChild(card);
      });
    } catch (err) {
      console.error('Error rendering RSS subs:', err);
    }
  }

  // ─── Local Area Network (LAN) Peer Sharing ────────────────────────────────

  bindLanSharing() {
    const openBtn = document.getElementById('btnOpenLanModal');
    const modal = document.getElementById('lanModal');
    const closeBtn = document.getElementById('btnCloseLanModal');
    const refreshBtn = document.getElementById('btnRefreshLanPeers');
    const manualInput = document.getElementById('inputLanManualIp');
    const manualConnectBtn = document.getElementById('btnLanManualConnect');
    const backToPeersBtn = document.getElementById('btnBackToPeers');
    const backToPeerLibBtn = document.getElementById('btnBackToPeerLib');

    if (!modal) return;

    const closeModal = () => modal.classList.add('hidden');
    const openModal = async () => {
      modal.classList.remove('hidden');
      this.showLanSection('peers');
      await this.refreshLanStatus();
    };

    openBtn?.addEventListener('click', openModal);
    closeBtn?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    refreshBtn?.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = '⏳ Scanning...';
      await this.refreshLanStatus();
      setTimeout(() => {
        refreshBtn.disabled = false;
        refreshBtn.textContent = '🔄 Refresh Scan';
      }, 1000);
    });

    manualConnectBtn?.addEventListener('click', async () => {
      const ip = manualInput?.value?.trim();
      if (!ip) {
        this.ui.showToast('Please enter an IP address');
        manualInput?.focus();
        return;
      }
      manualConnectBtn.disabled = true;
      manualConnectBtn.textContent = 'Connecting...';
      const res = await window.api.lanConnectManual({ ip, port: 58912 });
      manualConnectBtn.disabled = false;
      manualConnectBtn.textContent = 'Connect';
      if (res && res.success) {
        this.ui.showToast(`🟢 Connected to peer at ${ip}!`);
        if (manualInput) manualInput.value = '';
        await this.refreshLanStatus();
      } else {
        this.ui.showToast(`Could not connect to ${ip}: ${res?.error || 'No response'}`);
      }
    });

    manualInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') manualConnectBtn?.click();
    });

    backToPeersBtn?.addEventListener('click', () => {
      this.showLanSection('peers');
    });

    backToPeerLibBtn?.addEventListener('click', () => {
      this.showLanSection('library');
    });

    // Initial status fetch on startup
    this.refreshLanStatus();
  }

  showLanSection(section) {
    const listView = document.getElementById('lanPeersListView');
    const libView = document.getElementById('lanPeerLibraryView');
    const detailView = document.getElementById('lanPeerDetailView');

    listView?.classList.add('hidden');
    libView?.classList.add('hidden');
    detailView?.classList.add('hidden');

    if (section === 'peers') listView?.classList.remove('hidden');
    else if (section === 'library') libView?.classList.remove('hidden');
    else if (section === 'detail') detailView?.classList.remove('hidden');
  }

  async refreshLanStatus() {
    if (!window.api?.lanGetStatus) return;
    try {
      const status = await window.api.lanGetStatus();
      this.updateLanUiStatus(status);
      this.renderLanPeers(status.peers || []);
    } catch (_) {}
  }

  updateLanUiStatus(status) {
    if (!status) return;
    const nameDisplay = document.getElementById('lanMyNameDisplay');
    const detailsDisplay = document.getElementById('lanMyDetailsDisplay');
    const statusPill = document.getElementById('lanMyStatusPill');

    if (nameDisplay) nameDisplay.textContent = status.deviceName || 'My PC';
    if (detailsDisplay) {
      detailsDisplay.textContent = `LAN IP: ${status.myIp}:${status.httpPort} • ${this.animeList.length} Series Shared`;
    }

    if (statusPill) {
      if (status.enabled) {
        statusPill.className = 'lan-status-pill active';
        statusPill.textContent = '🟢 Active on Wi-Fi';
      } else {
        statusPill.className = 'lan-status-pill';
        statusPill.style.borderColor = 'rgba(239, 68, 68, 0.4)';
        statusPill.style.color = '#ef4444';
        statusPill.textContent = '⚪ Disabled';
      }
    }
  }

  renderLanPeers(peers = []) {
    const badge = document.getElementById('lanPeersBadge');
    const countText = document.getElementById('lanPeersCountText');
    const emptyEl = document.getElementById('lanPeersEmpty');
    const gridEl = document.getElementById('lanPeersGrid');

    if (badge) {
      if (peers.length > 0) {
        badge.textContent = peers.length;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    if (countText) {
      countText.textContent = `${peers.length} ${peers.length === 1 ? 'device' : 'devices'} found`;
    }

    if (!gridEl) return;

    if (peers.length === 0) {
      emptyEl?.classList.remove('hidden');
      gridEl.classList.add('hidden');
      gridEl.innerHTML = '';
      return;
    }

    emptyEl?.classList.add('hidden');
    gridEl.classList.remove('hidden');
    gridEl.innerHTML = '';

    peers.forEach(peer => {
      const card = document.createElement('div');
      card.className = 'lan-peer-card';
      card.innerHTML = `
        <div class="lan-peer-card-top">
          <div class="lan-peer-avatar">💻</div>
          <div class="lan-peer-info">
            <div class="lan-peer-name" title="${peer.name}">${peer.name}</div>
            <div class="lan-peer-ip">${peer.ip}:${peer.port}</div>
          </div>
        </div>
        <div class="lan-peer-stats">
          <span class="lan-peer-stats-label">Shared Collection</span>
          <span>📚 ${peer.animeCount || 0} Anime</span>
        </div>
        <button class="btn-primary btn-sm btn-browse-lan-peer" style="width:100%;justify-content:center;">
          Browse Library
        </button>
      `;

      card.querySelector('.btn-browse-lan-peer')?.addEventListener('click', () => {
        this.openPeerLibrary(peer);
      });

      gridEl.appendChild(card);
    });
  }

  async openPeerLibrary(peer) {
    this.currentBrowsingPeer = peer;
    this.showLanSection('library');

    const titleEl = document.getElementById('lanBrowsingPeerTitle');
    const gridEl = document.getElementById('lanPeerAnimeGrid');
    if (titleEl) titleEl.textContent = `Browsing ${peer.name} (Loading...)`;
    if (gridEl) gridEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">Fetching friend\'s anime collection...</div>';

    const res = await window.api.lanFetchPeerLibrary({ ip: peer.ip, port: peer.port });
    if (!res.success) {
      if (gridEl) gridEl.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:#ef4444;">Failed to load library from ${peer.name}: ${res.error}</div>`;
      return;
    }

    const animeList = res.anime || [];
    if (titleEl) titleEl.textContent = `Browsing ${peer.name} (${animeList.length} Anime)`;
    this.renderPeerLibrary(peer, animeList);
  }

  renderPeerLibrary(peer, animeList) {
    const gridEl = document.getElementById('lanPeerAnimeGrid');
    if (!gridEl) return;

    if (animeList.length === 0) {
      gridEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">No anime found in this friend\'s shared folder.</div>';
      return;
    }

    gridEl.innerHTML = '';
    animeList.forEach(anime => {
      const card = document.createElement('div');
      card.className = 'lan-anime-card';
      const coverUrl = anime.cover || '';
      card.innerHTML = `
        <img class="lan-anime-cover" src="${coverUrl}" onerror="this.style.display='none'" alt="${anime.title}" />
        <div class="lan-anime-info">
          <div class="lan-anime-title" title="${anime.title}">${anime.title}</div>
          <div class="lan-anime-meta">${anime.episodeCount || 0} episodes ${anime.score ? '• ★ ' + anime.score : ''}</div>
        </div>
      `;

      card.addEventListener('click', () => {
        this.openPeerAnimeDetail(peer, anime);
      });

      gridEl.appendChild(card);
    });
  }

  openPeerAnimeDetail(peer, anime) {
    this.showLanSection('detail');
    const titleEl = document.getElementById('lanPeerDetailAnimeTitle');
    const contentEl = document.getElementById('lanPeerDetailContent');
    if (titleEl) titleEl.textContent = anime.title;
    if (!contentEl) return;

    const episodes = anime.episodes || [];

    contentEl.innerHTML = `
      <div class="lan-detail-header">
        <img class="lan-detail-cover" src="${anime.cover || ''}" onerror="this.style.display='none'" alt="${anime.title}" />
        <div class="lan-detail-info">
          <div class="lan-detail-title">${anime.title}</div>
          <div class="lan-detail-meta">
            ${anime.year ? anime.year + ' • ' : ''}
            ${anime.score ? '★ ' + anime.score + ' • ' : ''}
            ${episodes.length} Episodes available on ${peer.name}
          </div>
          <div class="lan-detail-desc">${anime.description || 'No description available.'}</div>
        </div>
      </div>

      <div class="lan-section-title" style="margin-top:16px;">Episodes</div>
      <div class="lan-episodes-list" id="lanEpisodesListContainer"></div>
    `;

    const epListContainer = contentEl.querySelector('#lanEpisodesListContainer');
    episodes.forEach(ep => {
      const row = document.createElement('div');
      row.className = 'lan-episode-row';
      const sizeMB = ep.size ? (ep.size / (1024 * 1024)).toFixed(1) + ' MB' : '';

      row.innerHTML = `
        <div class="lan-ep-info">
          <div class="lan-ep-title">${ep.displayTitle || ep.fileName}</div>
          <div class="lan-ep-meta">${ep.fileName} ${sizeMB ? '• ' + sizeMB : ''}</div>
        </div>
        <div class="lan-ep-actions">
          <button class="btn-lan-action btn-lan-stream" title="Watch directly from friend's PC over Wi-Fi without downloading">
            ▶ Stream
          </button>
          <button class="btn-lan-action btn-lan-download" title="Download at high LAN speed straight into your anime folder">
            ⬇ Download
          </button>
        </div>
      `;

      row.querySelector('.btn-lan-stream')?.addEventListener('click', () => {
        this.streamLanEpisode(peer, anime, ep);
      });

      const dlBtn = row.querySelector('.btn-lan-download');
      dlBtn?.addEventListener('click', () => {
        this.downloadLanEpisode(peer, anime, ep, dlBtn);
      });

      epListContainer.appendChild(row);
    });
  }

  streamLanEpisode(peer, anime, episode) {
    document.getElementById('lanModal')?.classList.add('hidden');
    this.ui.showToast(`▶ Streaming [${episode.displayTitle}] over LAN from ${peer.name}...`);

    // Prepare episode object with LAN streamUrl
    const lanEpisode = {
      ...episode,
      streamUrl: episode.streamUrl,
      isLanStream: true
    };

    // Open video player directly
    this.player.playEpisode(anime, lanEpisode);
  }

  async downloadLanEpisode(peer, anime, episode, btnEl) {
    if (btnEl) {
      btnEl.classList.add('downloading');
      btnEl.textContent = '⏳ Downloading...';
    }

    this.ui.showToast(`⬇️ Starting LAN download of "${episode.fileName}" from ${peer.name}...`);

    const res = await window.api.lanDownloadEpisode({
      ip: peer.ip,
      port: peer.port,
      animeId: anime.id,
      epIndex: episode.index,
      animeTitle: anime.title,
      fileName: episode.fileName,
      totalBytes: episode.size
    });

    if (btnEl) {
      btnEl.classList.remove('downloading');
      btnEl.textContent = '⬇ Download';
    }

    if (res && res.success) {
      this.ui.showToast(`✅ Downloaded "${episode.fileName}" to your library!`);
      await this.scanLibrary(false);
    } else {
      this.ui.showToast(`⚠️ LAN Download error: ${res?.error || 'Failed'}`);
    }
  }

  handleLanDownloadProgress(data) {
    this.ui.showToast(`⬇️ LAN Transfer: ${data.fileName} (${data.percent}% at ${data.speedMBs})`);
  }

  handleLanDownloadCompleted(data) {
    this.ui.showToast(`🎉 LAN Download complete: ${data.fileName}! Added to library.`);
    this.scanLibrary(false);
  }
}

// Start application when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  window.animeApp = new AnimeApp();
});

/**
 * OST Mini-Player Controller
 * Manages a fixed-bottom audio bar for previewing anime theme songs.
 * Since Electron doesn't allow YouTube audio directly, we open YouTube
 * search links and track playlist state for UI display.
 */
class OSTPlayer {
  constructor() {
    this.playlist = [];
    this.currentIdx = 0;
    this.isVisible = false;

    this.bar      = document.getElementById('ostPlayerBar');
    this.titleEl  = document.getElementById('ostTrackTitle');
    this.typeEl   = document.getElementById('ostTrackType');
    this.playBtn  = document.getElementById('ostPlayPauseBtn');
    this.playIcon = document.getElementById('ostPlayIcon');
    this.prevBtn  = document.getElementById('ostPrevBtn');
    this.nextBtn  = document.getElementById('ostNextBtn');
    this.closeBtn = document.getElementById('ostCloseBtn');
    this.ytLink   = document.getElementById('ostYTLink');
    this.progressFill = document.getElementById('ostProgressFill');
    this.currentTimeEl = document.getElementById('ostCurrentTime');
    this.durationEl   = document.getElementById('ostDuration');

    // Hidden audio element for potential future direct audio playback
    this.audio = new Audio();
    this.audio.addEventListener('timeupdate', () => this.onTimeUpdate());
    this.audio.addEventListener('ended', () => this.onTrackEnd());

    this.bindEvents();
  }

  bindEvents() {
    this.prevBtn?.addEventListener('click', () => this.prev());
    this.nextBtn?.addEventListener('click', () => this.next());
    this.closeBtn?.addEventListener('click', () => this.hide());
    this.playBtn?.addEventListener('click', () => this.togglePlay());
    document.getElementById('ostProgressBar')?.addEventListener('click', (e) => {
      if (!this.audio.duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      this.audio.currentTime = pos * this.audio.duration;
    });
  }

  loadPlaylist(playlist, startIdx = 0) {
    this.playlist = playlist;
    this.currentIdx = startIdx;
    this.show();
    this.playTrack(startIdx);
  }

  playTrack(idx) {
    if (!this.playlist || this.playlist.length === 0) return;
    this.currentIdx = Math.max(0, Math.min(idx, this.playlist.length - 1));
    const track = this.playlist[this.currentIdx];

    this.titleEl.textContent = track.title;
    this.typeEl.textContent  = track.type;

    const ytSearch = `https://www.youtube.com/results?search_query=${encodeURIComponent(track.title + ' anime')}`;
    this.ytLink.href = ytSearch;

    // Update prev/next state
    this.prevBtn.style.opacity = this.currentIdx === 0 ? '0.3' : '1';
    this.nextBtn.style.opacity = this.currentIdx >= this.playlist.length - 1 ? '0.3' : '1';

    // We can't directly play YouTube audio, so we show the bar + open YT when user clicks play
    this.setPlayingState(false);
    this.progressFill.style.width = '0%';
    this.currentTimeEl.textContent = '0:00';
    this.durationEl.textContent = '?:??';

    // Flash the bar to indicate track changed
    this.bar.style.borderTopColor = 'var(--accent-primary)';
    setTimeout(() => { this.bar.style.borderTopColor = ''; }, 600);
  }

  togglePlay() {
    if (this.audio.src && this.audio.src !== window.location.href) {
      if (this.audio.paused) {
        this.audio.play().catch(() => this.openOnYouTube());
        this.setPlayingState(true);
      } else {
        this.audio.pause();
        this.setPlayingState(false);
      }
    } else {
      // No direct audio — open on YouTube
      this.openOnYouTube();
    }
  }

  openOnYouTube() {
    if (this.ytLink?.href && this.ytLink.href !== '#') {
      window.open(this.ytLink.href, '_blank');
    }
  }

  setPlayingState(isPlaying) {
    if (isPlaying) {
      this.playIcon.innerHTML = `<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>`;
    } else {
      this.playIcon.innerHTML = `<path d="M8 5v14l11-7z"/>`;
    }
  }

  onTimeUpdate() {
    if (!this.audio.duration) return;
    const pct = (this.audio.currentTime / this.audio.duration) * 100;
    this.progressFill.style.width = `${pct}%`;
    this.currentTimeEl.textContent = this.formatTime(this.audio.currentTime);
    this.durationEl.textContent = this.formatTime(this.audio.duration);
  }

  onTrackEnd() {
    this.next();
  }

  next() {
    if (this.currentIdx < this.playlist.length - 1) {
      this.playTrack(this.currentIdx + 1);
    }
  }

  prev() {
    if (this.currentIdx > 0) {
      this.playTrack(this.currentIdx - 1);
    }
  }

  show() {
    this.isVisible = true;
    this.bar.classList.add('visible');
    document.body.classList.add('ost-active');
  }

  hide() {
    this.isVisible = false;
    this.bar.classList.remove('visible');
    document.body.classList.remove('ost-active');
    this.audio.pause();
    this.audio.src = '';
    this.setPlayingState(false);
  }

  formatTime(sec) {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }
}

/**
 * InAppBrowser Controller
 * Provides an embedded web browser to popular anime distribution & streaming portals
 * (Nyaa.si, SubsPlease, AnimePahe, HiAnime, Erai-raws, Archive.org).
 * Intercepts downloads so video files/torrents land straight inside the active library folder,
 * with real-time download speed & progress indicators and automatic library rescan upon completion.
const BROWSER_MODES = {
  anime: {
    label: 'Anime Sites:',
    defaultUrl: 'https://nyaa.si',
    homeTitle: 'Home (Nyaa)',
    placeholder: 'Enter URL or search anime releases...',
    searchUrl: (q) => `https://nyaa.si/?f=0&c=0_0&q=${encodeURIComponent(q)}`,
    chips: [
      { label: '🌸 Nyaa.si', url: 'https://nyaa.si' },
      { label: '⚡ SubsPlease', url: 'https://subsplease.org' },
      { label: '🍿 AnimePahe', url: 'https://animepahe.ru' },
      { label: '🎌 HiAnime', url: 'https://hianime.to' },
      { label: '📼 Erai-raws', url: 'https://www.erai-raws.info' },
      { label: '📦 Archive.org', url: 'https://archive.org/details/anime' }
    ]
  },
  cinema: {
    label: 'Movie & TV Sites:',
    defaultUrl: 'https://yts.mx',
    homeTitle: 'Home (YTS)',
    placeholder: 'Enter URL or search movies & TV shows...',
    searchUrl: (q) => `https://yts.mx/browse-movies/${encodeURIComponent(q)}/all/all/0/latest/0/all`,
    chips: [
      { label: '🎬 YTS.mx', url: 'https://yts.mx' },
      { label: '📺 EZTV', url: 'https://eztv.re' },
      { label: '🍿 1337x Movies', url: 'https://1337x.to/cat/Movies/1/' },
      { label: '📽️ 1337x TV', url: 'https://1337x.to/cat/TV/1/' },
      { label: '📼 Feature Films', url: 'https://archive.org/details/feature_films' },
      { label: '🎞️ Classic Movies', url: 'https://publicdomainmovie.net' }
    ]
  }
};

/**
 * InAppBrowser Controller
 * Provides an embedded web browser with mode-specific portals for Anime vs Cinema
 * (Nyaa, SubsPlease, AnimePahe vs YTS, EZTV, 1337x, Archive Films).
 * Intercepts downloads so video files/torrents land straight inside the active library folder,
 * with real-time download speed & progress indicators and automatic library rescan upon completion.
 */
class InAppBrowser {
  constructor(app) {
    this.app = app;
    this.modal = document.getElementById('inAppBrowserModal');
    this.webview = document.getElementById('inAppWebview');
    this.urlInput = document.getElementById('browserUrlInput');
    this.btnGo = document.getElementById('browserBtnGo');
    this.btnBack = document.getElementById('browserBtnBack');
    this.btnForward = document.getElementById('browserBtnForward');
    this.btnReload = document.getElementById('browserBtnReload');
    this.btnHome = document.getElementById('browserBtnHome');
    this.btnClose = document.getElementById('browserBtnClose');
    this.btnMinimize = document.getElementById('browserBtnMinimize');
    this.btnOpenNav = document.getElementById('btnOpenBrowser');
    this.btnEmptyPrompt = document.getElementById('btnEmptyBrowsePrompt');
    this.targetFolderEl = document.getElementById('browserTargetFolder');
    this.loadingBar = document.getElementById('browserLoadingBar');

    // Downloads banner & drawer elements
    this.downloadBar = document.getElementById('browserDownloadBar');
    this.dlFilenameEl = document.getElementById('browserDlFilename');
    this.dlStatsEl = document.getElementById('browserDlStats');
    this.dlProgressFill = document.getElementById('browserDlProgressFill');
    this.btnOpenDlFromBanner = document.getElementById('btnOpenDlDrawerFromBanner');
    this.btnBannerPauseResume = document.getElementById('btnBannerPauseResume');
    this.btnBannerCancel = document.getElementById('btnBannerCancel');
    this.currentActiveDlId = null;

    // Refresh Download Link Modal elements
    this.refreshModal = document.getElementById('refreshLinkModal');
    this.refreshFilenameEl = document.getElementById('refreshLinkFilename');
    this.refreshInputEl = document.getElementById('refreshLinkInput');
    this.btnPasteRefresh = document.getElementById('btnPasteRefreshLink');
    this.btnConfirmRefresh = document.getElementById('btnConfirmRefreshLink');
    this.btnCancelRefresh = document.getElementById('btnCancelRefreshLink');
    this.btnCloseRefresh = document.getElementById('btnCloseRefreshLink');
    this.refreshTargetId = null;

    this.drawer = document.getElementById('browserDownloadsDrawer');
    this.btnToggleDl = document.getElementById('btnToggleBrowserDownloads');
    this.btnCloseDlDrawer = document.getElementById('btnCloseDlDrawer');
    this.btnClearCompletedDl = document.getElementById('btnClearCompletedDl');
    this.badgeCountEl = document.getElementById('browserDlBadgeCount');
    this.dlItemsListEl = document.getElementById('browserDlItemsList');
    this.dlEmptyState = document.getElementById('dlEmptyState');
    this.activeSummaryEl = document.getElementById('browserDlActiveSummary');

    // Floating background dock in main library view
    this.floatingDock = document.getElementById('floatingBrowserDock');
    this.floatingDockBadge = document.getElementById('floatingBrowserDlBadge');
    this.floatingDockText = document.getElementById('floatingBrowserDockText');

    this.suggestionsLabelEl = document.getElementById('browserSuggestionsLabel');
    this.builtinChipsContainer = document.getElementById('browserBuiltinChips');

    this.currentBrowserMode = this.app.currentMode || 'anime';
    this.animeUrl = 'https://nyaa.si';
    this.cinemaUrl = 'https://yts.mx';
    this.defaultUrl = 'https://nyaa.si';
    this.isOpen = false;
    this.downloads = new Map(); // id -> download item
  }

  init() {
    this.bindButtons();
    this.bindWebviewEvents();
    this.bindDownloadEvents();
    this.setMode(this.app.currentMode || 'anime', false);
  }

  setMode(mode, shouldNavigate = true) {
    this.currentBrowserMode = mode;
    this.renderModeSites(mode);
    this.updateTargetFolderDisplay();
    this.initBookmarks();

    if (shouldNavigate && this.isOpen) {
      const target = mode === 'cinema' ? this.cinemaUrl : this.animeUrl;
      this.navigate(target);
    }
  }

  renderModeSites(mode) {
    const cfg = BROWSER_MODES[mode] || BROWSER_MODES.anime;
    this.defaultUrl = cfg.defaultUrl;
    if (this.suggestionsLabelEl) this.suggestionsLabelEl.textContent = cfg.label;
    if (this.urlInput) this.urlInput.placeholder = cfg.placeholder;
    if (this.btnHome) this.btnHome.title = cfg.homeTitle;

    if (this.builtinChipsContainer) {
      this.builtinChipsContainer.innerHTML = '';
      cfg.chips.forEach(chip => {
        const btn = document.createElement('button');
        btn.className = 'suggestion-chip';
        btn.dataset.url = chip.url;
        btn.dataset.builtin = 'true';
        btn.textContent = chip.label;
        btn.addEventListener('click', () => {
          this.builtinChipsContainer.querySelectorAll('.suggestion-chip').forEach(c => c.classList.remove('active'));
          btn.classList.add('active');
          this.navigate(chip.url);
        });
        this.builtinChipsContainer.appendChild(btn);
      });
    }
  }

  updateTargetFolderDisplay() {
    if (!this.targetFolderEl) return;
    const isCinema = this.currentBrowserMode === 'cinema';
    const targetFolder = isCinema ? this.app.store?.cinemaFolder : this.app.store?.libraryFolder;
    if (targetFolder) {
      const cleanName = targetFolder.replace(/\\/g, '/').split('/').filter(Boolean).pop() || targetFolder;
      this.targetFolderEl.textContent = `${isCinema ? '🎬' : '🌸'} ${cleanName}`;
      this.targetFolderEl.title = `Saving downloads to: ${targetFolder}`;
    } else {
      this.targetFolderEl.textContent = isCinema
        ? '⚠️ Movies Folder not set (Select in Settings)'
        : '⚠️ Anime Folder not set (Select in Settings)';
      this.targetFolderEl.title = 'No folder selected for downloads';
    }
  }

  bindButtons() {
    // Open trigger from top toolbar & empty state
    this.btnOpenNav?.addEventListener('click', () => this.open());
    this.btnEmptyPrompt?.addEventListener('click', () => this.open());

    // Close button (minimizes to background if downloads are active)
    this.btnClose?.addEventListener('click', () => this.close());
    this.btnMinimize?.addEventListener('click', () => this.minimize());

    // Floating dock click to resume
    this.floatingDock?.addEventListener('click', () => this.open());

    // Downloads Drawer toggles
    this.btnToggleDl?.addEventListener('click', () => this.toggleDrawer());
    this.btnCloseDlDrawer?.addEventListener('click', () => this.closeDrawer());
    this.btnOpenDlFromBanner?.addEventListener('click', () => this.openDrawer());
    this.btnClearCompletedDl?.addEventListener('click', () => this.clearCompleted());

    // Concurrency selector
    const dlConcurrencySelect = document.getElementById('selectDlConcurrency');
    if (dlConcurrencySelect) {
      if (window.api?.getStore) {
        window.api.getStore('maxConcurrentDownloads').then(val => {
          if (val !== undefined && val !== null) {
            dlConcurrencySelect.value = String(val);
          }
        }).catch(() => {});
      }

      dlConcurrencySelect.addEventListener('change', async (e) => {
        const val = parseInt(e.target.value, 10);
        await window.api.setDownloadConcurrency(val);
        this.app.ui.showToast(`⚡ Max concurrent downloads set to ${val === 0 ? 'Unlimited' : val}`);
      });
    }

    // Banner Quick Actions (Pause / Resume & Cancel active download)
    this.btnBannerPauseResume?.addEventListener('click', async () => {
      if (!this.currentActiveDlId) return;
      const item = this.downloads.get(this.currentActiveDlId);
      if (!item) return;
      if (item.state === 'downloading') {
        await window.api.pauseDownload(this.currentActiveDlId);
        item.state = 'paused';
        this.updateBannerControls(item);
        this.renderDownloadCards();
      } else if (item.state === 'paused') {
        await window.api.resumeDownload(this.currentActiveDlId);
        item.state = 'downloading';
        this.updateBannerControls(item);
        this.renderDownloadCards();
      }
    });

    this.btnBannerCancel?.addEventListener('click', async () => {
      if (!this.currentActiveDlId) return;
      await window.api.cancelDownload(this.currentActiveDlId);
      const item = this.downloads.get(this.currentActiveDlId);
      if (item) item.state = 'cancelled';
      this.renderDownloadCards();
      this.updateBadgeCounts();
      if (this.downloadBar) this.downloadBar.classList.add('hidden');
    });

    // Refresh Link Modal actions
    this.btnCloseRefresh?.addEventListener('click', () => this.closeRefreshModal());
    this.btnCancelRefresh?.addEventListener('click', () => this.closeRefreshModal());
    this.btnPasteRefresh?.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text && this.refreshInputEl) {
          this.refreshInputEl.value = text.trim();
        }
      } catch (_) {}
    });
    this.btnConfirmRefresh?.addEventListener('click', async () => {
      const newUrl = this.refreshInputEl?.value?.trim();
      if (!newUrl) {
        this.app.ui.showToast('⚠️ Please enter or paste a valid download URL or magnet link');
        return;
      }
      const targetId = this.refreshTargetId;
      this.closeRefreshModal();
      this.app.ui.showToast('🔄 Refreshing download with updated link...');
      const res = await window.api.refreshDownloadLink({ id: targetId, newUrl });
      if (res && res.error) {
        this.app.ui.showToast(`⚠️ Could not start refreshed download: ${res.error}`);
      } else {
        this.app.ui.showToast('⬇️ Refreshed download started!');
        this.openDrawer();
      }
    });

    // Navigation buttons
    this.btnBack?.addEventListener('click', () => {
      if (this.webview && this.webview.canGoBack()) this.webview.goBack();
    });

    this.btnForward?.addEventListener('click', () => {
      if (this.webview && this.webview.canGoForward()) this.webview.goForward();
    });

    this.btnReload?.addEventListener('click', () => {
      if (this.webview) this.webview.reload();
    });

    this.btnHome?.addEventListener('click', () => {
      this.navigate(this.defaultUrl);
    });

    // Address bar Go button & Enter key
    this.btnGo?.addEventListener('click', () => {
      this.navigate(this.urlInput.value.trim());
    });

    this.urlInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.navigate(this.urlInput.value.trim());
      }
    });

    // Quick site suggestion chips
    const chips = document.querySelectorAll('.browser-suggestions-strip .suggestion-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const targetUrl = chip.dataset.url;
        if (targetUrl) this.navigate(targetUrl);
      });
    });

    // Keyboard shortcut: Esc minimizes browser back to library
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.minimize();
      }
      // Ctrl+D = bookmark current page
      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && this.isOpen) {
        e.preventDefault();
        this.bookmarkCurrentPage();
      }
    });

    // Bookmark current page button
    document.getElementById('btnBookmarkPage')?.addEventListener('click', () => {
      this.bookmarkCurrentPage();
    });

    // Bookmarks panel toggle
    document.getElementById('btnToggleBookmarksPanel')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const panel = document.getElementById('bookmarksPanel');
      if (panel) {
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) {
          document.getElementById('bookmarkNameInput')?.focus();
        }
      }
    });

    document.getElementById('btnCloseBookmarksPanel')?.addEventListener('click', () => {
      document.getElementById('bookmarksPanel')?.classList.add('hidden');
    });

    // Close bookmarks panel when clicking outside
    document.addEventListener('click', (e) => {
      const panel = document.getElementById('bookmarksPanel');
      if (panel && !panel.classList.contains('hidden')) {
        if (!panel.contains(e.target) && !e.target.closest('#btnToggleBookmarksPanel') && !e.target.closest('#btnBookmarkPage')) {
          panel.classList.add('hidden');
        }
      }
    });

    // Add custom bookmark form
    document.getElementById('btnAddCustomBookmark')?.addEventListener('click', () => {
      const nameInput = document.getElementById('bookmarkNameInput');
      const urlInput  = document.getElementById('bookmarkUrlInput');
      const emoji     = document.getElementById('bookmarkEmojiSelect')?.value || '🔖';
      const name = nameInput?.value.trim();
      let url    = urlInput?.value.trim();
      if (!name || !url) {
        this.app.ui.showToast('⚠️ Please enter both a site name and URL');
        return;
      }
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      this.addBookmark({ name, url, emoji, addedAt: Date.now() });
      if (nameInput) nameInput.value = '';
      if (urlInput)  urlInput.value  = '';
    });

    document.getElementById('bookmarkNameInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('btnAddCustomBookmark')?.click();
    });
    document.getElementById('bookmarkUrlInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('btnAddCustomBookmark')?.click();
    });
  }

  bindWebviewEvents() {
    if (!this.webview) return;

    this.webview.addEventListener('did-start-loading', () => {
      if (this.loadingBar) this.loadingBar.classList.remove('hidden');
    });

    this.webview.addEventListener('did-stop-loading', () => {
      if (this.loadingBar) this.loadingBar.classList.add('hidden');
      try {
        const currentUrl = this.webview.getURL();
        if (currentUrl && this.urlInput) {
          this.urlInput.value = currentUrl;
          this.highlightActiveChip(currentUrl);
          this.updateDockText(currentUrl);
          const isBookmarked = this.bookmarks?.some(b => b.url === currentUrl);
          this.updateBookmarkStarBtn(currentUrl, isBookmarked);
        }
      } catch (_) {}

      // Update back/forward button states
      if (this.btnBack) {
        this.btnBack.disabled = !this.webview.canGoBack();
      }
      if (this.btnForward) {
        this.btnForward.disabled = !this.webview.canGoForward();
      }
    });

    // Handle new popups, target="_blank", or torrent magnet links
    this.webview.addEventListener('new-window', (e) => {
      e.preventDefault();
      if (e.url.startsWith('magnet:')) {
        this.handleMagnetLink(e.url);
      } else {
        this.navigate(e.url);
      }
    });

    // Intercept magnet navigation
    this.webview.addEventListener('will-navigate', (e) => {
      if (e.url.startsWith('magnet:')) {
        e.preventDefault();
        this.handleMagnetLink(e.url);
      }
    });
  }

  handleMagnetLink(magnetUrl) {
    window.api.copyToClipboard(magnetUrl);
    if (window.api.startTorrent) {
      window.api.startTorrent(magnetUrl);
      this.app.ui.showToast('🧲 Magnet link added! In-app torrent downloading to library...');
      this.openDrawer();
    } else {
      window.api.openExternalUrl(magnetUrl);
      this.app.ui.showToast('🧲 Magnet link copied & sent to external torrent client!');
    }
  }

  openRefreshModal(id) {
    const item = this.downloads.get(id);
    if (!item) return;
    this.refreshTargetId = id;
    if (this.refreshFilenameEl) {
      this.refreshFilenameEl.textContent = `File: ${item.filename} (Folder: ${item.seriesFolder})`;
    }
    if (this.refreshInputEl) {
      this.refreshInputEl.value = (item.url && !item.url.startsWith('blob:')) ? item.url : '';
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(clip => {
          if (clip && (clip.startsWith('http://') || clip.startsWith('https://') || clip.startsWith('magnet:'))) {
            if (!this.refreshInputEl.value || this.refreshInputEl.value === item.url) {
              this.refreshInputEl.value = clip.trim();
            }
          }
        }).catch(() => {});
      }
    }
    if (this.refreshModal) {
      this.refreshModal.classList.remove('hidden');
    }
    setTimeout(() => this.refreshInputEl?.focus(), 80);
  }

  closeRefreshModal() {
    if (this.refreshModal) {
      this.refreshModal.classList.add('hidden');
    }
    this.refreshTargetId = null;
    if (this.refreshInputEl) this.refreshInputEl.value = '';
  }

  updateBannerControls(activeItem) {
    if (!this.downloadBar) return;
    if (!activeItem || (activeItem.state !== 'downloading' && activeItem.state !== 'paused')) {
      const hasActive = Array.from(this.downloads.values()).some(d => d.state === 'downloading' || d.state === 'paused');
      if (!hasActive) {
        this.downloadBar.classList.add('hidden');
      }
      return;
    }

    this.currentActiveDlId = activeItem.id;
    if (this.btnBannerPauseResume) {
      if (activeItem.state === 'paused') {
        this.btnBannerPauseResume.textContent = '▶️ Resume';
        this.btnBannerPauseResume.title = 'Resume download';
      } else {
        this.btnBannerPauseResume.textContent = '⏸️ Pause';
        this.btnBannerPauseResume.title = 'Pause download';
      }
    }
  }

  bindDownloadEvents() {
    // 1. Download Started (HTTP or Torrent)
    if (window.api.onDownloadStarted) {
      window.api.onDownloadStarted((data) => {
        const item = {
          id: data.id,
          filename: data.filename,
          seriesFolder: data.seriesFolder || 'Anime Downloads',
          totalBytes: data.totalBytes || 0,
          receivedBytes: 0,
          percent: 0,
          state: 'downloading',
          isTorrent: !!data.isTorrent,
          savePath: data.savePath || null,
          url: data.url || null,
          startTime: Date.now()
        };
        this.downloads.set(data.id, item);
        this.currentActiveDlId = data.id;

        // Show live progress banner
        if (this.downloadBar) this.downloadBar.classList.remove('hidden');
        if (this.dlFilenameEl) this.dlFilenameEl.textContent = `⬇️ Downloading: ${data.filename}`;
        if (this.dlStatsEl) this.dlStatsEl.textContent = 'Starting download...';
        if (this.dlProgressFill) this.dlProgressFill.style.width = '0%';
        this.updateBannerControls(item);

        this.app.ui.showToast(`⬇️ Downloading "${data.filename}" to folder "${item.seriesFolder}"`);
        this.renderDownloadCards();
        this.updateBadgeCounts();
      });
    }

    // 2. Download Progress
    if (window.api.onDownloadProgress) {
      window.api.onDownloadProgress((data) => {
        const item = this.downloads.get(data.id);
        if (item) {
          Object.assign(item, data);
          item.state = 'downloading';
        }

        // Update banner
        if (this.downloadBar) this.downloadBar.classList.remove('hidden');
        const recMb = (data.receivedBytes / 1048576).toFixed(1);
        const totMb = data.totalBytes > 0 ? (data.totalBytes / 1048576).toFixed(1) : '?';
        const speedText = data.downloadSpeed ? ` • ${(data.downloadSpeed / 1048576).toFixed(1)} MB/s` : '';
        const peerText = data.numPeers !== undefined ? ` • ${data.numPeers} peers` : '';

        if (this.dlStatsEl) {
          this.dlStatsEl.textContent = `${data.percent}% • ${recMb} MB / ${totMb} MB${speedText}${peerText}`;
        }
        if (this.dlProgressFill) {
          this.dlProgressFill.style.width = `${data.percent}%`;
        }

        if (item) this.updateBannerControls(item);
        this.updateCardProgress(data.id, data);
        this.updateBadgeCounts();
      });
    }

    // 3. Download Completed
    if (window.api.onDownloadCompleted) {
      window.api.onDownloadCompleted(async (data) => {
        const item = this.downloads.get(data.id);
        if (item) {
          item.percent = 100;
          item.state = 'completed';
          item.savePath = data.savePath;
          if (data.seriesFolder) item.seriesFolder = data.seriesFolder;
        }

        if (this.dlStatsEl) this.dlStatsEl.textContent = '100% • Complete!';
        if (this.dlProgressFill) this.dlProgressFill.style.width = '100%';
        this.app.ui.showToast(`🎉 Download complete: "${data.filename}" added to your library!`);

        setTimeout(() => {
          const hasActive = Array.from(this.downloads.values()).some(d => d.state === 'downloading' || d.state === 'paused');
          if (!hasActive && this.downloadBar) {
            this.downloadBar.classList.add('hidden');
          }
        }, 3000);

        this.renderDownloadCards();
        this.updateBadgeCounts();

        // Automatically re-scan library so the newly downloaded item immediately appears!
        if (this.app.currentMode === 'cinema') {
          await this.app.scanCinemaLibrary(false);
        } else {
          await this.app.scanLibrary(false);
        }
      });
    }

    // 4. Download Failed / Interrupted
    if (window.api.onDownloadFailed) {
      window.api.onDownloadFailed((data) => {
        const item = this.downloads.get(data.id);
        if (item) {
          item.state = 'failed';
          item.error = data.state || 'Error';
        }

        if (this.dlStatsEl) this.dlStatsEl.textContent = `Download cancelled or failed (${data.state})`;
        this.app.ui.showToast(`⚠️ Download failed for "${data.filename}" (use Refresh Link to update URL)`);

        this.renderDownloadCards();
        this.updateBadgeCounts();
      });
    }

    // 5. Download Paused
    if (window.api.onDownloadPaused) {
      window.api.onDownloadPaused((data) => {
        const item = this.downloads.get(data.id);
        if (item) {
          item.state = 'paused';
        }
        if (this.dlStatsEl) this.dlStatsEl.textContent = `⏸️ Paused: ${data.filename}`;
        if (item) this.updateBannerControls(item);
        this.renderDownloadCards();
        this.updateBadgeCounts();
      });
    }

    // 6. Download Resumed
    if (window.api.onDownloadResumed) {
      window.api.onDownloadResumed((data) => {
        const item = this.downloads.get(data.id);
        if (item) {
          item.state = 'downloading';
        }
        if (this.dlStatsEl) this.dlStatsEl.textContent = `▶️ Resumed: ${data.filename}`;
        if (item) this.updateBannerControls(item);
        this.renderDownloadCards();
        this.updateBadgeCounts();
      });
    }

    // 7. Download Cancelled
    if (window.api.onDownloadCancelled) {
      window.api.onDownloadCancelled((data) => {
        const item = this.downloads.get(data.id);
        if (item) {
          item.state = 'cancelled';
        }
        if (this.dlStatsEl) this.dlStatsEl.textContent = `✕ Cancelled: ${data.filename}`;
        this.renderDownloadCards();
        this.updateBadgeCounts();
        setTimeout(() => {
          const hasActive = Array.from(this.downloads.values()).some(d => d.state === 'downloading' || d.state === 'paused');
          if (!hasActive && this.downloadBar) this.downloadBar.classList.add('hidden');
        }, 1500);
      });
    }

    // 8. System Wake / Resume Detection
    if (window.api.onSystemResumed) {
      window.api.onSystemResumed((data) => {
        this.app.ui.showToast('⚡ System awake — AnimeOpen active & checking downloads');
        if (this.app.currentMode === 'cinema') {
          this.app.scanCinemaLibrary(false);
        } else {
          this.app.scanLibrary(false);
        }
      });
    }
  }

  renderDownloadCards() {
    if (!this.dlItemsListEl) return;
    const items = Array.from(this.downloads.values()).reverse();

    if (items.length === 0) {
      this.dlItemsListEl.innerHTML = `
        <div class="dl-empty-state" id="dlEmptyState">
          <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <p>No active or recent downloads</p>
          <small>Direct video links and torrents will be tracked here and organized into series folders</small>
        </div>
      `;
      return;
    }

    this.dlItemsListEl.innerHTML = '';
    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'dl-card';
      card.id = `dlCard_${item.id}`;

      const recMb = (item.receivedBytes / 1048576).toFixed(1);
      const totMb = item.totalBytes > 0 ? (item.totalBytes / 1048576).toFixed(1) : '?';
      const speedText = item.downloadSpeed ? ` • ${(item.downloadSpeed / 1048576).toFixed(1)} MB/s` : '';
      const peerText = item.numPeers !== undefined ? ` • ${item.numPeers} peers` : '';

      let statusBadge = `<span class="dl-status-badge downloading">⬇️ ${item.percent}%</span>`;
      if (item.state === 'completed') {
        statusBadge = `<span class="dl-status-badge completed">✓ Finished</span>`;
      } else if (item.state === 'failed') {
        statusBadge = `<span class="dl-status-badge failed">✕ Failed</span>`;
      } else if (item.state === 'paused') {
        statusBadge = `<span class="dl-status-badge paused">⏸️ Paused</span>`;
      } else if (item.state === 'cancelled') {
        statusBadge = `<span class="dl-status-badge cancelled">✕ Cancelled</span>`;
      } else if (item.state === 'queued') {
        statusBadge = `<span class="dl-status-badge queued">⏳ Queued</span>`;
      }

      const torrentBadge = item.isTorrent ? `<span class="dl-series-pill dl-torrent-badge">🧲 Torrent</span>` : '';

      // Priority up/down buttons for active or queued items
      const isPending = item.state === 'downloading' || item.state === 'queued' || item.state === 'paused';
      const priorityBtns = isPending ? `
        <div class="dl-priority-btns">
          <button class="btn-dl-priority btn-dl-up" data-id="${item.id}" title="Move Up in Priority">▲</button>
          <button class="btn-dl-priority btn-dl-down" data-id="${item.id}" title="Move Down in Priority">▼</button>
        </div>
      ` : '';

      // Action buttons based on state
      let actionsHtml = '';
      if (item.state === 'downloading') {
        actionsHtml += `<button class="btn-dl-action btn-dl-pause" data-id="${item.id}" title="Pause download">⏸️ Pause</button>`;
        actionsHtml += `<button class="btn-dl-action btn-dl-cancel" data-id="${item.id}" title="Cancel download">✕ Cancel</button>`;
        actionsHtml += `<button class="btn-dl-action btn-dl-refresh" data-id="${item.id}" title="Update expired link or provide new URL">🔗 Refresh Link</button>`;
      } else if (item.state === 'queued') {
        actionsHtml += `<button class="btn-dl-action btn-dl-cancel" data-id="${item.id}" title="Cancel queued download">✕ Cancel</button>`;
        actionsHtml += `<button class="btn-dl-action btn-dl-refresh" data-id="${item.id}" title="Update URL">🔗 Refresh Link</button>`;
      } else if (item.state === 'paused') {
        actionsHtml += `<button class="btn-dl-action btn-dl-resume" data-id="${item.id}" title="Resume download">▶️ Resume</button>`;
        actionsHtml += `<button class="btn-dl-action btn-dl-cancel" data-id="${item.id}" title="Cancel download">✕ Cancel</button>`;
        actionsHtml += `<button class="btn-dl-action btn-dl-refresh" data-id="${item.id}" title="Update expired link or provide new URL">🔗 Refresh Link</button>`;
      } else if (item.state === 'failed' || item.state === 'cancelled') {
        actionsHtml += `<button class="btn-dl-action btn-dl-refresh" data-id="${item.id}" title="Update expired or broken link with new URL">🔗 Refresh Link</button>`;
      } else if (item.state === 'completed') {
        if (item.savePath) {
          actionsHtml += `<button class="btn-dl-action btn-show-folder" data-path="${item.savePath}" title="Open containing folder">📁 Folder</button>`;
        }
      }

      card.innerHTML = `
        <div class="dl-card-header">
          <div class="dl-card-info">
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
              <span class="dl-series-pill">📁 ${item.seriesFolder}</span>
              ${torrentBadge}
            </div>
            <div class="dl-file-title" title="${item.filename}">${item.filename}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            ${priorityBtns}
            ${statusBadge}
          </div>
        </div>
        <div class="dl-card-progress">
          <div class="dl-card-progress-fill" style="width: ${item.percent}%"></div>
        </div>
        <div class="dl-stats-row">
          <span>${recMb} MB of ${totMb} MB${speedText}${peerText}</span>
          <div class="dl-card-actions">
            ${actionsHtml}
          </div>
        </div>
      `;

      // Bind button click handlers
      card.querySelector('.btn-dl-up')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = e.currentTarget.dataset.id;
        const res = await window.api.reorderDownloadQueue(id, 'up');
        if (res?.success && res.newOrder) {
          this.reorderDownloadsMap(res.newOrder);
          this.renderDownloadCards();
          this.app.ui.showToast('⬆️ Moved download up in priority');
        }
      });

      card.querySelector('.btn-dl-down')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = e.currentTarget.dataset.id;
        const res = await window.api.reorderDownloadQueue(id, 'down');
        if (res?.success && res.newOrder) {
          this.reorderDownloadsMap(res.newOrder);
          this.renderDownloadCards();
          this.app.ui.showToast('⬇️ Moved download down in priority');
        }
      });

      card.querySelector('.btn-dl-pause')?.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        await window.api.pauseDownload(id);
        item.state = 'paused';
        this.updateBannerControls(item);
        this.renderDownloadCards();
      });

      card.querySelector('.btn-dl-resume')?.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        const res = await window.api.resumeDownload(id);
        if (res && res.error) {
          this.app.ui.showToast(`⚠️ ${res.error}`);
        } else {
          item.state = 'downloading';
          this.updateBannerControls(item);
          this.renderDownloadCards();
        }
      });

      card.querySelector('.btn-dl-cancel')?.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        await window.api.cancelDownload(id);
        item.state = 'cancelled';
        this.renderDownloadCards();
        this.updateBadgeCounts();
      });

      card.querySelector('.btn-dl-refresh')?.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        this.openRefreshModal(id);
      });

      card.querySelector('.btn-show-folder')?.addEventListener('click', (e) => {
        const p = e.currentTarget.dataset.path;
        if (p) window.api.showInFolder(p);
      });

      this.dlItemsListEl.appendChild(card);
    });
  }

  reorderDownloadsMap(newOrderIds) {
    if (!Array.isArray(newOrderIds)) return;
    const newMap = new Map();
    newOrderIds.forEach(id => {
      if (this.downloads.has(id)) {
        newMap.set(id, this.downloads.get(id));
      }
    });
    for (const [id, item] of this.downloads.entries()) {
      if (!newMap.has(id)) newMap.set(id, item);
    }
    this.downloads = newMap;
  }

  updateCardProgress(id, data) {
    const card = document.getElementById(`dlCard_${id}`);
    if (!card) return;

    const fill = card.querySelector('.dl-card-progress-fill');
    if (fill) fill.style.width = `${data.percent}%`;

    const statusBadge = card.querySelector('.dl-status-badge');
    if (statusBadge && statusBadge.classList.contains('downloading')) {
      statusBadge.textContent = `⬇️ ${data.percent}%`;
    }

    const recMb = (data.receivedBytes / 1048576).toFixed(1);
    const totMb = data.totalBytes > 0 ? (data.totalBytes / 1048576).toFixed(1) : '?';
    const speedText = data.downloadSpeed ? ` • ${(data.downloadSpeed / 1048576).toFixed(1)} MB/s` : '';
    const peerText = data.numPeers !== undefined ? ` • ${data.numPeers} peers` : '';

    const statsSpan = card.querySelector('.dl-stats-row span');
    if (statsSpan) {
      statsSpan.textContent = `${recMb} MB of ${totMb} MB${speedText}${peerText}`;
    }
  }

  updateBadgeCounts() {
    const items = Array.from(this.downloads.values());
    const activeCount = items.filter(d => d.state === 'downloading').length;
    const completedCount = items.filter(d => d.state === 'completed').length;

    // Browser header button badge
    if (this.badgeCountEl) {
      if (activeCount > 0) {
        this.badgeCountEl.textContent = activeCount;
        this.badgeCountEl.classList.remove('hidden');
      } else {
        this.badgeCountEl.classList.add('hidden');
      }
    }

    // Drawer subtitle
    if (this.activeSummaryEl) {
      this.activeSummaryEl.textContent = `${activeCount} active • ${completedCount} completed`;
    }

    // Floating dock badge
    if (this.floatingDockBadge) {
      if (activeCount > 0) {
        this.floatingDockBadge.textContent = `${activeCount} DL`;
        this.floatingDockBadge.classList.remove('hidden');
      } else {
        this.floatingDockBadge.classList.add('hidden');
      }
    }
  }

  clearCompleted() {
    for (const [id, item] of this.downloads.entries()) {
      if (item.state === 'completed' || item.state === 'failed') {
        this.downloads.delete(id);
      }
    }
    this.renderDownloadCards();
    this.updateBadgeCounts();
    this.app.ui.showToast('Cleared completed download history');
  }

  toggleDrawer() {
    if (!this.drawer) return;
    if (this.drawer.classList.contains('hidden')) {
      this.openDrawer();
    } else {
      this.closeDrawer();
    }
  }

  openDrawer() {
    if (!this.drawer) return;
    this.renderDownloadCards();
    this.drawer.classList.remove('hidden');
  }

  closeDrawer() {
    if (this.drawer) this.drawer.classList.add('hidden');
  }

  highlightActiveChip(currentUrl) {
    const chips = document.querySelectorAll('.browser-suggestions-strip .suggestion-chip');
    chips.forEach(chip => {
      const u = chip.dataset.url;
      try {
        if (u && currentUrl.includes(new URL(u).hostname)) {
          chip.classList.add('active');
        } else {
          chip.classList.remove('active');
        }
      } catch (_) {}
    });
  }

  updateDockText(url) {
    if (!this.floatingDockText) return;
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      this.floatingDockText.textContent = `🌐 ${host}`;
    } catch (_) {
      this.floatingDockText.textContent = `🌐 In-App Browser`;
    }
  }

  navigate(rawInput) {
    if (!this.webview) return;
    let url = (rawInput || '').trim();
    const cfg = BROWSER_MODES[this.currentBrowserMode] || BROWSER_MODES.anime;

    if (!url) {
      url = this.defaultUrl;
    } else if (url.startsWith('magnet:')) {
      this.handleMagnetLink(url);
      return;
    } else if (url.startsWith('http://') || url.startsWith('https://')) {
      // Valid URL
    } else if (url.includes('.') && !url.includes(' ')) {
      // Domain name without protocol
      url = 'https://' + url;
    } else {
      // Search term -> query mode search engine
      url = cfg.searchUrl(url);
    }

    if (this.currentBrowserMode === 'cinema') {
      this.cinemaUrl = url;
    } else {
      this.animeUrl = url;
    }

    this.urlInput.value = url;
    this.webview.src = url;
    this.highlightActiveChip(url);
    this.updateDockText(url);
  }

  open(initialUrl) {
    this.isOpen = true;
    if (this.modal) this.modal.classList.remove('hidden');
    if (this.floatingDock) this.floatingDock.classList.add('hidden');

    this.setMode(this.app.currentMode || 'anime', false);

    if (initialUrl) {
      this.navigate(initialUrl);
    } else {
      const target = this.currentBrowserMode === 'cinema' ? this.cinemaUrl : this.animeUrl;
      if (!this.webview.src || this.webview.src === 'about:blank' || this.webview.src !== target) {
        this.navigate(target);
      }
    }
  }

  minimize() {
    this.isOpen = false;
    if (this.modal) this.modal.classList.add('hidden');
    if (this.floatingDock) this.floatingDock.classList.remove('hidden');
    this.app.ui.showToast('🌐 Browser running in background. Click dock to resume anytime!');
  }

  close() {
    this.isOpen = false;
    if (this.modal) this.modal.classList.add('hidden');
    // If there are downloads still active in background, keep dock visible
    const hasActive = Array.from(this.downloads.values()).some(d => d.state === 'downloading');
    if (hasActive && this.floatingDock) {
      this.floatingDock.classList.remove('hidden');
    } else if (this.floatingDock) {
      this.floatingDock.classList.add('hidden');
    }
  }

  // ─── Bookmarks ─────────────────────────────────────────────────────────────

  async initBookmarks() {
    this.bookmarks = [];
    const storeKey = this.currentBrowserMode === 'cinema' ? 'cinemaBookmarks' : 'browserBookmarks';
    try {
      const saved = await window.api.getStore(storeKey);
      if (Array.isArray(saved)) {
        this.bookmarks = saved;
      } else if (saved && typeof saved === 'object' && Array.isArray(saved[storeKey])) {
        this.bookmarks = saved[storeKey];
      } else if (this.app?.store?.[storeKey] && Array.isArray(this.app.store[storeKey])) {
        this.bookmarks = this.app.store[storeKey];
      }
    } catch (_) {
      if (this.app?.store?.[storeKey] && Array.isArray(this.app.store[storeKey])) {
        this.bookmarks = this.app.store[storeKey];
      }
    }
    this.renderBookmarks();
    this.renderBookmarkStrip();
    this.updateBookmarkStarBtn();
  }

  async saveBookmarks() {
    const storeKey = this.currentBrowserMode === 'cinema' ? 'cinemaBookmarks' : 'browserBookmarks';
    try {
      if (this.app?.store) {
        this.app.store[storeKey] = this.bookmarks;
      }
      if (window.api?.setStore) {
        await window.api.setStore(storeKey, this.bookmarks);
      }
      if (window.api?.saveStore && this.app?.store) {
        await window.api.saveStore(this.app.store);
      }
    } catch (e) {
      console.warn('Could not persist bookmarks:', e);
    }
  }

  async addBookmark(bookmark) {
    if (!bookmark || !bookmark.url) return;
    const exists = this.bookmarks.some(b => b.url.toLowerCase() === bookmark.url.toLowerCase());
    if (exists) {
      this.app.ui.showToast(`⭐ Already bookmarked! "${bookmark.name}"`);
      return;
    }
    bookmark.id = 'bm_' + Date.now();
    this.bookmarks.unshift(bookmark);
    await this.saveBookmarks();
    this.renderBookmarks();
    this.renderBookmarkStrip();
    this.updateBookmarkStarBtn(bookmark.url, true);
    this.app.ui.showToast(`⭐ Bookmarked: "${bookmark.name}"`);
  }

  async removeBookmark(id) {
    const bm = this.bookmarks.find(b => b.id === id);
    this.bookmarks = this.bookmarks.filter(b => b.id !== id);
    await this.saveBookmarks();
    this.renderBookmarks();
    this.renderBookmarkStrip();
    if (bm) this.updateBookmarkStarBtn(bm.url, false);
    this.app.ui.showToast('Bookmark removed');
  }

  bookmarkCurrentPage() {
    let url = '';
    try {
      url = (this.webview && typeof this.webview.getURL === 'function') ? this.webview.getURL() : '';
    } catch (_) {}
    if (!url || url === 'about:blank') {
      url = this.urlInput?.value?.trim() || '';
    }
    if (!url || url === 'about:blank') {
      this.app.ui.showToast('⚠️ No page loaded to bookmark');
      return;
    }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    // Try to get a clean page title
    let title = '';
    try {
      if (this.webview && typeof this.webview.getTitle === 'function') {
        title = this.webview.getTitle();
      }
    } catch (_) {}
    if (!title) {
      try { title = new URL(url).hostname.replace(/^www\./, ''); } catch (_) { title = url; }
    }

    const alreadyBookmarked = this.bookmarks.some(b => b.url.toLowerCase() === url.toLowerCase());
    if (alreadyBookmarked) {
      const bm = this.bookmarks.find(b => b.url.toLowerCase() === url.toLowerCase());
      if (bm) this.removeBookmark(bm.id);
      return;
    }

    this.addBookmark({
      name: title,
      url,
      emoji: '🔖',
      addedAt: Date.now()
    });

    // Open panel so user immediately sees their newly added bookmark
    const panel = document.getElementById('bookmarksPanel');
    if (panel) panel.classList.remove('hidden');
  }

  updateBookmarkStarBtn(url, isBookmarked) {
    const btn = document.getElementById('btnBookmarkPage');
    if (!btn) return;
    let currentUrl = '';
    try {
      currentUrl = (this.webview && typeof this.webview.getURL === 'function') ? this.webview.getURL() : '';
    } catch (_) {}
    if (!currentUrl) currentUrl = this.urlInput?.value?.trim() || '';

    const checkUrl = url || currentUrl;
    const bookmarked = typeof isBookmarked === 'boolean'
      ? isBookmarked
      : this.bookmarks.some(b => b.url.toLowerCase() === checkUrl.toLowerCase());

    if (bookmarked) {
      btn.classList.add('is-bookmarked');
      btn.title = 'Remove bookmark (Ctrl+D)';
    } else {
      btn.classList.remove('is-bookmarked');
      btn.title = 'Bookmark current page (Ctrl+D)';
    }
  }

  renderBookmarks() {
    const listEl     = document.getElementById('bookmarksList');
    const emptyEl    = document.getElementById('bookmarksEmpty');
    const countBadge = document.getElementById('bookmarksCountBadge');
    if (!listEl) return;

    if (countBadge) countBadge.textContent = this.bookmarks.length;

    if (this.bookmarks.length === 0) {
      listEl.innerHTML = '';
      emptyEl?.classList.remove('hidden');
      return;
    }

    emptyEl?.classList.add('hidden');
    listEl.innerHTML = '';

    this.bookmarks.forEach(bm => {
      const row = document.createElement('div');
      row.className = 'bookmark-row';

      let displayHost = bm.url;
      try { displayHost = new URL(bm.url).hostname.replace(/^www\./, ''); } catch (_) {}

      row.innerHTML = `
        <div class="bookmark-row-emoji">${bm.emoji || '🔖'}</div>
        <div class="bookmark-row-info">
          <div class="bookmark-row-name" title="${bm.name}">${bm.name}</div>
          <div class="bookmark-row-url" title="${bm.url}">${displayHost}</div>
        </div>
        <div class="bookmark-row-actions">
          <button class="btn-bm-action btn-bm-open" title="Open site" data-url="${bm.url}">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
          </button>
          <button class="btn-bm-action btn-bm-delete" title="Remove bookmark" data-id="${bm.id}">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
      `;

      // Click on the row (not buttons) navigates there
      row.addEventListener('click', (e) => {
        if (e.target.closest('.bookmark-row-actions')) return;
        this.navigate(bm.url);
        document.getElementById('bookmarksPanel')?.classList.add('hidden');
      });

      row.querySelector('.btn-bm-open')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.navigate(bm.url);
        document.getElementById('bookmarksPanel')?.classList.add('hidden');
      });

      row.querySelector('.btn-bm-delete')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeBookmark(bm.id);
      });

      listEl.appendChild(row);
    });
  }

  renderBookmarkStrip() {
    const chipsContainer = document.getElementById('bookmarksStripChips');
    const divider        = document.getElementById('bookmarksDivider');
    const label          = document.getElementById('bookmarksStripLabel');
    if (!chipsContainer) return;

    chipsContainer.innerHTML = '';

    if (this.bookmarks.length === 0) {
      divider?.classList.add('hidden');
      label?.classList.add('hidden');
      return;
    }

    divider?.classList.remove('hidden');
    label?.classList.remove('hidden');

    // Show at most 8 bookmarks in the strip
    this.bookmarks.slice(0, 8).forEach(bm => {
      const chip = document.createElement('button');
      chip.className = 'suggestion-chip bookmark-chip';
      chip.title = bm.url;
      chip.textContent = `${bm.emoji || '🔖'} ${bm.name}`;
      chip.addEventListener('click', () => {
        document.querySelectorAll('.browser-suggestions-strip .suggestion-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.navigate(bm.url);
      });
      chipsContainer.appendChild(chip);
    });
  }
}





