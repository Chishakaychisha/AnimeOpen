/**
 * High-performance Video Player Controller for AnimeOpen
 */

class AnimePlayer {
  constructor(app) {
    this.app = app;
    this.video = null;
    this.container = null;
    this.currentAnime = null;
    this.currentEpisode = null;
    this.currentEpIndex = -1;
    this.controlsTimeout = null;
    this.saveProgressInterval = null;
    this.nextEpPromptShown = false;
    this.nextEpCountdown = null;
    this.subtitleOffset = 0;
    
    this.initDOM();
    this.bindEvents();
    this.bindKeyboardShortcuts();
    this.bindGlobalKeys();
    this.bindRemoteCommands();
    this.initSubtitleStyles();
    this.bindOnlineSubtitlesModal();
  }

  initDOM() {
    this.container = document.getElementById('playerView');
    this.video = document.getElementById('mainVideo');
    this.controls = document.getElementById('playerControls');
    this.topbar = document.getElementById('playerTopbar');
    this.progressBar = document.getElementById('playerProgress');
    this.progressFill = document.getElementById('playerProgressFill');
    this.bufferFill = document.getElementById('playerBufferFill');
    this.timeTooltip = document.getElementById('playerTimeTooltip');
    this.timeDisplay = document.getElementById('playerTimeDisplay');
    this.playBtn = document.getElementById('btnPlayPause');
    this.volumeSlider = document.getElementById('playerVolumeSlider');
    this.volumeIcon = document.getElementById('btnVolumeIcon');
    this.fullscreenBtn = document.getElementById('btnFullscreen');
    this.prevBtn = document.getElementById('btnPrevEp');
    this.nextBtn = document.getElementById('btnNextEp');
    this.speedBtn = document.getElementById('btnSpeed');
    this.speedMenu = document.getElementById('playerSpeedMenu');
    this.pipBtn = document.getElementById('btnPip');
    this.backBtn = document.getElementById('btnPlayerBack');
    this.titleHeader = document.getElementById('playerAnimeTitle');
    this.epHeader = document.getElementById('playerEpisodeTitle');
    this.centerActionIcon = document.getElementById('centerActionIcon');
    this.nextOverlay = document.getElementById('nextEpisodeOverlay');
    // Track selectors
    this.audioTrackBtn    = document.getElementById('btnAudioTrack');
    this.audioTrackMenu   = document.getElementById('audioTrackMenu');
    this.audioTrackCtrl   = document.getElementById('audioTrackControl');
    this.subTrackBtn      = document.getElementById('btnSubTrack');
    this.subTrackMenu     = document.getElementById('subtitleTrackMenu');
    this.subTrackCtrl     = document.getElementById('subtitleTrackControl');
    // AniSkip & Tools
    this.skipIntroBtn     = document.getElementById('btnSkipIntro');
    this.skipEndingBtn    = document.getElementById('btnSkipEnding');
    this.screenshotBtn    = document.getElementById('btnPlayerScreenshot');
    this.externalPlayerBtn = document.getElementById('btnPlayerExternal');
    // Netflix-style Intro Bumper
    this.bumperEl         = document.getElementById('playerIntroBumper');
    this.skipBumperBtn     = document.getElementById('btnSkipBumper');
  }

  bindEvents() {
    // Intro Bumper
    this.skipBumperBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.endBumper();
    });
    this.bumperEl?.addEventListener('click', () => this.endBumper());

    // Video standard events
    this.video.addEventListener('timeupdate', () => this.onTimeUpdate());
    this.video.addEventListener('loadedmetadata', () => {
      this.onLoadedMetadata();
      this.sendPlaybackState();
    });
    this.video.addEventListener('progress', () => this.updateBuffer());
    this.video.addEventListener('ended', () => {
      this.onEnded();
      this.sendPlaybackState();
    });
    this.video.addEventListener('play', () => {
      this.updatePlayIcon(true);
      this.sendPlaybackState();
    });
    this.video.addEventListener('pause', () => {
      this.updatePlayIcon(false);
      this.sendPlaybackState();
    });
    this.video.addEventListener('volumechange', () => this.sendPlaybackState());
    this.video.addEventListener('click', () => this.togglePlay());
    this.video.addEventListener('dblclick', () => this.toggleFullscreen());
    this.video.addEventListener('error', () => {
      console.error('Video error:', this.video.error);
      const code = this.video.error?.code;
      this.app.ui.showToast(`Unable to play video (Error Code ${code || 'Unknown'}). Check file format.`);
    });

    // Screenshot & External Player
    this.screenshotBtn?.addEventListener('click', () => this.takeScreenshot());
    this.externalPlayerBtn?.addEventListener('click', () => this.playInExternalPlayer());

    // AniSkip Buttons
    this.skipIntroBtn?.addEventListener('click', () => this.skipIntro());
    this.skipEndingBtn?.addEventListener('click', () => this.skipEnding());

    // Track selectors
    this.audioTrackBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.audioTrackMenu.classList.toggle('active');
      this.subTrackMenu.classList.remove('active');
    });
    this.subTrackBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.subTrackMenu.classList.toggle('active');
      this.audioTrackMenu.classList.remove('active');
    });
    document.addEventListener('click', () => {
      this.audioTrackMenu?.classList.remove('active');
      this.subTrackMenu?.classList.remove('active');
    });

    // Playback buttons
    this.playBtn.addEventListener('click', () => this.togglePlay());
    this.backBtn.addEventListener('click', () => this.close());

    // Seeking
    this.progressBar.addEventListener('click', (e) => this.seek(e));
    this.progressBar.addEventListener('mousemove', (e) => this.updateSeekTooltip(e));

    // Volume
    this.volumeSlider.addEventListener('input', (e) => {
      this.setVolume(parseFloat(e.target.value));
    });
    this.volumeIcon.addEventListener('click', () => this.toggleMute());

    // Speed
    this.speedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.speedMenu.classList.toggle('active');
    });
    document.querySelectorAll('.speed-option').forEach(item => {
      item.addEventListener('click', (e) => {
        const speed = parseFloat(e.target.dataset.speed);
        this.video.playbackRate = speed;
        this.speedBtn.textContent = `${speed}x`;
        this.speedMenu.classList.remove('active');
      });
    });

    // Prev / Next
    this.prevBtn.addEventListener('click', () => this.playPreviousEpisode());
    this.nextBtn.addEventListener('click', () => this.playNextEpisode());

    // Fullscreen & PiP
    this.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
    if (this.pipBtn && document.pictureInPictureEnabled) {
      this.pipBtn.addEventListener('click', () => this.togglePiP());
    } else if (this.pipBtn) {
      this.pipBtn.style.display = 'none';
    }

    // Hide controls on mouse idle
    this.container.addEventListener('mousemove', () => this.showControlsTemporarily());
    this.container.addEventListener('mouseleave', () => this.hideControls());

    // Next Episode Auto Prompt Buttons
    document.getElementById('btnNextEpNow')?.addEventListener('click', () => {
      this.hideNextEpPrompt();
      this.playNextEpisode();
    });
    document.getElementById('btnNextEpCancel')?.addEventListener('click', () => {
      this.hideNextEpPrompt();
    });

    // Close speed menu when clicking elsewhere
    document.addEventListener('click', (e) => {
      if (!this.speedBtn.contains(e.target) && !this.speedMenu.contains(e.target)) {
        this.speedMenu.classList.remove('active');
      }
    });
  }

  bindKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (this.container.classList.contains('hidden')) return;

      // Avoid triggering when focused on input fields
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          this.togglePlay();
          break;
        case 'arrowright':
        case 'l':
          e.preventDefault();
          this.skip(10);
          break;
        case 'arrowleft':
        case 'j':
          e.preventDefault();
          this.skip(-10);
          break;
        case 'arrowup':
          e.preventDefault();
          this.setVolume(Math.min(1, this.video.volume + 0.1));
          break;
        case 'arrowdown':
          e.preventDefault();
          this.setVolume(Math.max(0, this.video.volume - 0.1));
          break;
        case 'm':
          this.toggleMute();
          break;
        case 'f':
          this.toggleFullscreen();
          break;
        case 's':
          this.takeScreenshot();
          break;
        case 'n':
          this.playNextEpisode();
          break;
        case 'p':
          this.playPreviousEpisode();
          break;
        case 'escape':
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            this.close();
          }
          break;
      }
    });
  }

  bindRemoteCommands() {
    if (window.api?.onRemoteCommand) {
      window.api.onRemoteCommand((cmd) => {
        if (!cmd) return;
        switch (cmd.action) {
          case 'togglePlay':
            this.togglePlay();
            break;
          case 'play':
            this.video.play().catch(() => {});
            break;
          case 'pause':
            this.video.pause();
            break;
          case 'seek':
            if (typeof cmd.time === 'number') this.video.currentTime = cmd.time;
            break;
          case 'seekRel':
            if (typeof cmd.delta === 'number') {
              this.video.currentTime = Math.max(0, Math.min(this.video.duration || 0, this.video.currentTime + cmd.delta));
            }
            break;
          case 'nextEp':
            this.playNextEpisode();
            break;
          case 'prevEp':
            this.playPreviousEpisode();
            break;
          case 'skipIntro':
            this.skipIntro();
            break;
          case 'skipEnding':
            this.skipEnding();
            break;
          case 'toggleFullscreen':
            this.toggleFullscreen();
            break;
          case 'setVolume':
            if (typeof cmd.volume === 'number') {
              this.video.volume = Math.max(0, Math.min(1, cmd.volume));
              this.volumeSlider.value = this.video.volume;
              this.updateVolumeIcon();
            }
            break;
          case 'toggleMute':
            this.video.muted = !this.video.muted;
            this.updateVolumeIcon();
            break;
        }
        this.sendPlaybackState();
      });
    }
  }

  playEpisode(anime, episode) {
    return this.loadEpisode(anime, episode);
  }

  sendPlaybackState() {
    if (!window.api?.sendPlaybackState || !this.video) return;
    const isPlaying = !this.video.paused && !this.video.ended;
    const mainTitle = this.currentAnime?.metadata?.title || this.currentAnime?.title || this.titleHeader?.textContent || 'AnimeOpen';
    const epTitle = this.currentEpisode?.displayTitle || this.currentEpisode?.fileName || this.epHeader?.textContent || 'Ready to stream';
    const coverUrl = this.currentAnime?.metadata?.cover || '';

    window.api.sendPlaybackState({
      playing: isPlaying,
      currentTime: this.video.currentTime || 0,
      duration: this.video.duration || 0,
      title: mainTitle,
      episodeTitle: epTitle,
      cover: coverUrl,
      volume: this.video.volume,
      muted: this.video.muted,
      filePath: this.currentEpisode?.filePath || null,
      isCinema: this.app.currentMode === 'cinema'
    });
  }

  async loadEpisode(anime, episode) {
    this.currentAnime = anime;
    this.currentEpisode = episode;
    this.currentEpIndex = anime.episodes.findIndex(e => e.id === episode.id);

    // If episode is inside a zip file and not yet extracted, extract it now!
    if (episode.isZip && !episode.isExtracted) {
      this.app.ui.showToast(`Extracting ${episode.displayTitle} from archive...`, 5000);
      try {
        const extractRes = await window.api.extractZipEntry({
          zipPath: episode.zipPath,
          entryName: episode.entryName
        });
        if (!extractRes.success) {
          this.app.ui.showToast(`Failed to extract video: ${extractRes.error}`);
          return;
        }
        episode.isExtracted = true;
        episode.filePath = extractRes.filePath;
        this.app.ui.showToast(`Extraction complete! Starting playback...`, 2000);
      } catch (err) {
        console.error('Zip extraction error:', err);
        this.app.ui.showToast(`Error extracting archive: ${err.message}`);
        return;
      }
    }

    // Setup headers
    const mainTitle = anime.metadata?.title || anime.title;
    this.titleHeader.textContent = mainTitle;
    this.epHeader.textContent = `${episode.displayTitle} • ${episode.fileName}`;

    // Update Next/Prev button states
    this.prevBtn.disabled = this.currentEpIndex <= 0;
    this.nextBtn.disabled = this.currentEpIndex >= anime.episodes.length - 1;

    // Show Player View
    this.container.classList.remove('hidden');
    document.body.classList.add('in-player');

    // Get Media Stream URL (supports direct LAN HTTP stream URL or local protocol)
    const streamUrl = episode.streamUrl || window.api.getMediaUrl(episode.filePath);
    this.video.src = streamUrl;
    this.video.load();

    // Check saved progress
    const historyKey = episode.filePath || episode.streamUrl;
    const history = this.app.store.watchHistory[historyKey];
    if (history && history.progress > 15 && !history.completed) {
      this.video.currentTime = history.progress;
      this.app.ui.showToast(`Resuming at ${this.formatTime(history.progress)}`);
    }

    // Clear old subtitle tracks & reset offset
    this.subtitleOffset = 0;
    this.video.querySelectorAll('track').forEach(t => t.remove());

    // Auto-detect subtitles in the folder if local file
    if (episode.filePath && window.api.findSubtitles) {
      window.api.findSubtitles(episode.filePath).then(subFiles => {
        if (subFiles && subFiles.length > 0) {
          subFiles.forEach((sub, idx) => {
            this.addSubtitleTrack(sub.fileName, sub.content, idx === 0);
          });
          this.app.ui.showToast(`Found companion subtitle: ${subFiles[0].fileName}`);
        } else {
          this.buildTrackMenus();
        }
      });
    } else {
      this.buildTrackMenus();
    }

    // Reset AniSkip & fetch intervals
    this.skipIntervals = null;
    this.skipIntroBtn?.classList.add('hidden');
    this.skipEndingBtn?.classList.add('hidden');

    const checkSkipTimes = (idMal) => {
      if (!idMal) return;
      const epNum = episode.episodeNumber || episode.episode || 1;
      AnimeMetadata.fetchSkipTimes(idMal, epNum, this.video.duration).then(intervals => {
        if (intervals) {
          this.skipIntervals = intervals;
          console.log('AniSkip times loaded:', intervals);
        }
      });
    };

    if (anime.metadata?.idMal) {
      checkSkipTimes(anime.metadata.idMal);
    } else {
      // Auto-fetch idMal if cached metadata didn't have it
      AnimeMetadata.fetchMetadata(anime.title).then(fresh => {
        if (fresh && fresh.idMal) {
          anime.metadata = { ...(anime.metadata || {}), ...fresh };
          this.app.store.cachedMetadata[anime.title.toLowerCase()] = anime.metadata;
          window.api.saveStore(this.app.store);
          checkSkipTimes(fresh.idMal);
        }
      });
    }

    // Play Netflix-style AnimeOpen Intro Bumper animation & chime
    await this.triggerIntroBumper();

    try {
      await this.video.play();
    } catch (err) {
      console.warn('Auto-play blocked or failed:', err);
    }

    // Start auto-save progress interval
    this.startSavingProgress();
    this.showControlsTemporarily();
  }

  triggerIntroBumper() {
    return new Promise((resolve) => {
      if (!this.bumperEl || this.app.store?.playIntroBumper === false) {
        return resolve();
      }

      this.bumperEl.classList.remove('hidden');
      this.bumperEl.classList.remove('fade-out');
      this.playCinematicChime();

      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        this.endBumper();
        resolve();
      };

      this._bumperTimer = setTimeout(finish, 2200);
      this._resolveBumper = finish;
    });
  }

  endBumper() {
    if (this._bumperTimer) {
      clearTimeout(this._bumperTimer);
      this._bumperTimer = null;
    }
    if (this._resolveBumper) {
      const res = this._resolveBumper;
      this._resolveBumper = null;
      res();
    }
    if (this.bumperEl) {
      this.bumperEl.classList.add('fade-out');
      setTimeout(() => {
        this.bumperEl.classList.add('hidden');
      }, 400);
    }
  }

  playCinematicChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // 1. Deep Sub Bass Impact Boom (Netflix-style punch)
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(85, now);
      subOsc.frequency.exponentialRampToValueAtTime(30, now + 0.9);
      subGain.gain.setValueAtTime(0.7, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      subOsc.connect(subGain);
      subGain.connect(ctx.destination);
      subOsc.start(now);
      subOsc.stop(now + 1.3);

      // 2. High Shimmer Celeste Chimes (Japanese anime sparkle)
      const chimeFreqs = [1046.5, 1318.51, 1567.98, 2093.0];
      chimeFreqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + 0.15 + (i * 0.05));
        gain.gain.setValueAtTime(0.18, now + 0.15 + (i * 0.05));
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4 + (i * 0.1));
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + 0.15 + (i * 0.05));
        osc.stop(now + 1.5 + (i * 0.1));
      });

      // 3. Stereo Energy Swell Chord
      const chordFreqs = [261.63, 329.63, 392.00, 523.25];
      chordFreqs.forEach(freq => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + 0.2);
        gain.gain.setValueAtTime(0.01, now + 0.2);
        gain.gain.linearRampToValueAtTime(0.1, now + 0.6);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.9);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + 0.2);
        osc.stop(now + 2.0);
      });
    } catch (e) {
      console.warn('AudioContext chime warning:', e);
    }
  }

  onLoadedMetadata() {
    this.timeDisplay.textContent = `00:00 / ${this.formatTime(this.video.duration)}`;
    this.nextEpPromptShown = false;
    this.buildTrackMenus();

    // Re-query skip times with duration if not yet loaded
    if (!this.skipIntervals && this.currentAnime?.metadata?.idMal) {
      const epNum = this.currentEpisode?.episodeNumber || this.currentEpisode?.episode || 1;
      AnimeMetadata.fetchSkipTimes(
        this.currentAnime.metadata.idMal,
        epNum,
        this.video.duration
      ).then(intervals => {
        if (intervals) this.skipIntervals = intervals;
      });
    }
  }

  srtToVtt(srtContent) {
    if (!srtContent) return 'WEBVTT\n\n';
    let vtt = srtContent
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    if (!vtt.startsWith('WEBVTT')) {
      vtt = 'WEBVTT\n\n' + vtt;
    }
    return vtt;
  }

  addSubtitleTrack(name, content, autoShow = true) {
    const vtt = this.srtToVtt(content);
    const blob = new Blob([vtt], { type: 'text/vtt' });
    const url = URL.createObjectURL(blob);
    const trackEl = document.createElement('track');
    trackEl.kind = 'subtitles';
    trackEl.label = name;
    trackEl.srclang = 'en';
    trackEl.src = url;
    if (autoShow) trackEl.default = true;
    this.video.appendChild(trackEl);
    this.buildTrackMenus();
    setTimeout(() => {
      if (autoShow && trackEl.track) {
        trackEl.track.mode = 'showing';
      }
    }, 100);
  }

  buildTrackMenus() {
    // 1. Audio Track Menu (Always Visible)
    this.audioTrackCtrl.style.display = 'block';
    this.audioTrackMenu.innerHTML = '';

    const audioTracks = this.video.audioTracks;
    if (audioTracks && audioTracks.length > 1) {
      Array.from(audioTracks).forEach((track, i) => {
        const btn = document.createElement('button');
        btn.className = 'track-option' + (track.enabled ? ' active-track' : '');
        btn.textContent = `🔊 ${track.label || track.language || 'Audio Track ' + (i + 1)}`;
        btn.onclick = (e) => {
          e.stopPropagation();
          Array.from(audioTracks).forEach(t => t.enabled = false);
          track.enabled = true;
          this.audioTrackMenu.querySelectorAll('.track-option').forEach(b => b.classList.remove('active-track'));
          btn.classList.add('active-track');
          this.audioTrackMenu.classList.remove('active');
        };
        this.audioTrackMenu.appendChild(btn);
      });
    } else {
      const defaultAudioBtn = document.createElement('button');
      defaultAudioBtn.className = 'track-option active-track';
      defaultAudioBtn.textContent = '🔊 Default Audio (Active)';
      this.audioTrackMenu.appendChild(defaultAudioBtn);
    }

    // Direct Dual-Audio Switcher shortcut to VLC/MPV
    const vlcAudioBtn = document.createElement('button');
    vlcAudioBtn.className = 'track-option';
    vlcAudioBtn.style.color = 'var(--accent-gold)';
    vlcAudioBtn.style.borderTop = '1px solid rgba(255,255,255,0.08)';
    vlcAudioBtn.style.marginTop = '4px';
    vlcAudioBtn.innerHTML = '🚀 Dual-Audio Switcher (VLC / MPV)';
    vlcAudioBtn.onclick = (e) => {
      e.stopPropagation();
      this.playInExternalPlayer();
      this.audioTrackMenu.classList.remove('active');
    };
    this.audioTrackMenu.appendChild(vlcAudioBtn);

    // 2. Subtitle Track Menu (Always Visible)
    this.subTrackCtrl.style.display = 'block';
    this.subTrackMenu.innerHTML = '';

    const textTracks = this.video.textTracks;
    let anyActive = false;

    // Subtitle Tracks Header
    const tracksSectionHeader = document.createElement('div');
    tracksSectionHeader.className = 'sub-menu-section-title';
    tracksSectionHeader.textContent = 'AVAILABLE TRACKS';
    this.subTrackMenu.appendChild(tracksSectionHeader);

    // Off option
    const offBtn = document.createElement('button');
    offBtn.className = 'track-option';
    offBtn.textContent = '🔘 Subtitles: Off';
    offBtn.onclick = (e) => {
      e.stopPropagation();
      Array.from(textTracks).forEach(t => t.mode = 'disabled');
      this.subTrackMenu.querySelectorAll('.track-option').forEach(b => b.classList.remove('active-track'));
      offBtn.classList.add('active-track');
      this.subTrackMenu.classList.remove('active');
    };
    this.subTrackMenu.appendChild(offBtn);

    if (textTracks && textTracks.length > 0) {
      Array.from(textTracks).forEach((track, i) => {
        const isShowing = track.mode === 'showing';
        if (isShowing) anyActive = true;
        const btn = document.createElement('button');
        btn.className = 'track-option' + (isShowing ? ' active-track' : '');
        btn.textContent = `💬 ${track.label || track.language || 'Subtitles ' + (i + 1)}`;
        btn.onclick = (e) => {
          e.stopPropagation();
          Array.from(textTracks).forEach(t => t.mode = 'disabled');
          track.mode = 'showing';
          this.subTrackMenu.querySelectorAll('.track-option').forEach(b => b.classList.remove('active-track'));
          btn.classList.add('active-track');
          this.subTrackMenu.classList.remove('active');
        };
        this.subTrackMenu.appendChild(btn);
      });
    }

    if (!anyActive) {
      offBtn.classList.add('active-track');
    }

    // --- Subtitle Sync (Timing Offset) Section ---
    const syncSection = document.createElement('div');
    syncSection.className = 'sub-menu-section';
    syncSection.innerHTML = `
      <div class="sub-menu-section-title">⏱️ SUBTITLE TIMING OFFSET</div>
      <div class="sub-sync-row">
        <button class="sub-sync-btn" id="btnSubMinus500" title="Delay subtitles by 0.5s">-0.5s</button>
        <button class="sub-sync-btn" id="btnSubMinus100" title="Delay subtitles by 0.1s">-0.1s</button>
        <span class="sub-sync-val" id="subOffsetValBadge">${this.subtitleOffset >= 0 ? '+' : ''}${this.subtitleOffset.toFixed(1)}s</span>
        <button class="sub-sync-btn" id="btnSubPlus100" title="Advance subtitles by 0.1s">+0.1s</button>
        <button class="sub-sync-btn" id="btnSubPlus500" title="Advance subtitles by 0.5s">+0.5s</button>
        <button class="sub-sync-btn reset" id="btnSubReset" title="Reset timing offset to 0.0s">Reset</button>
      </div>
    `;

    syncSection.querySelector('#btnSubMinus500').onclick = (e) => { e.stopPropagation(); this.adjustSubtitleOffset(-0.5); };
    syncSection.querySelector('#btnSubMinus100').onclick = (e) => { e.stopPropagation(); this.adjustSubtitleOffset(-0.1); };
    syncSection.querySelector('#btnSubPlus100').onclick  = (e) => { e.stopPropagation(); this.adjustSubtitleOffset(0.1); };
    syncSection.querySelector('#btnSubPlus500').onclick  = (e) => { e.stopPropagation(); this.adjustSubtitleOffset(0.5); };
    syncSection.querySelector('#btnSubReset').onclick    = (e) => { e.stopPropagation(); this.resetSubtitleOffset(); };
    this.subTrackMenu.appendChild(syncSection);

    // --- Subtitle Appearance Styling Section ---
    const styleSection = document.createElement('div');
    styleSection.className = 'sub-menu-section';
    const currentSize = this.subStyleSettings?.fontSize || '1.25rem';
    const currentColor = this.subStyleSettings?.color || '#ffffff';
    const currentMode = this.subStyleSettings?.style || 'shadow';

    styleSection.innerHTML = `
      <div class="sub-menu-section-title">🎨 SUBTITLE STYLING</div>
      <div class="sub-style-row" style="margin-bottom:6px;">
        <span style="font-size:0.75rem;color:var(--text-muted);min-width:42px;">Size:</span>
        <button class="sub-chip ${currentSize === '1.0rem' ? 'active' : ''}" data-size="1.0rem">S</button>
        <button class="sub-chip ${currentSize === '1.25rem' ? 'active' : ''}" data-size="1.25rem">M</button>
        <button class="sub-chip ${currentSize === '1.5rem' ? 'active' : ''}" data-size="1.5rem">L</button>
        <button class="sub-chip ${currentSize === '1.85rem' ? 'active' : ''}" data-size="1.85rem">XL</button>
      </div>
      <div class="sub-style-row" style="margin-bottom:6px;">
        <span style="font-size:0.75rem;color:var(--text-muted);min-width:42px;">Color:</span>
        <button class="sub-color-dot ${currentColor === '#ffffff' ? 'active' : ''}" data-color="#ffffff" style="background:#ffffff;" title="White"></button>
        <button class="sub-color-dot ${currentColor === '#fde047' ? 'active' : ''}" data-color="#fde047" style="background:#fde047;" title="Yellow"></button>
        <button class="sub-color-dot ${currentColor === '#22d3ee' ? 'active' : ''}" data-color="#22d3ee" style="background:#22d3ee;" title="Cyan"></button>
        <button class="sub-color-dot ${currentColor === '#a7f3d0' ? 'active' : ''}" data-color="#a7f3d0" style="background:#a7f3d0;" title="Mint Green"></button>
      </div>
      <div class="sub-style-row">
        <span style="font-size:0.75rem;color:var(--text-muted);min-width:42px;">Outline:</span>
        <button class="sub-chip ${currentMode === 'shadow' ? 'active' : ''}" data-mode="shadow">Shadow</button>
        <button class="sub-chip ${currentMode === 'box' ? 'active' : ''}" data-mode="box">Box</button>
      </div>
    `;

    styleSection.querySelectorAll('[data-size]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        styleSection.querySelectorAll('[data-size]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.applySubtitleStyles({ fontSize: btn.dataset.size });
      };
    });

    styleSection.querySelectorAll('[data-color]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        styleSection.querySelectorAll('[data-color]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.applySubtitleStyles({ color: btn.dataset.color });
      };
    });

    styleSection.querySelectorAll('[data-mode]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        styleSection.querySelectorAll('[data-mode]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.applySubtitleStyles({ style: btn.dataset.mode });
      };
    });

    this.subTrackMenu.appendChild(styleSection);

    // --- Subtitle Actions: Load Local & Search Online ---
    const loadSubBtn = document.createElement('button');
    loadSubBtn.className = 'track-option';
    loadSubBtn.style.color = 'var(--accent-cyan)';
    loadSubBtn.style.borderTop = '1px solid rgba(255,255,255,0.08)';
    loadSubBtn.style.marginTop = '4px';
    loadSubBtn.innerHTML = '📁 Load Subtitle (.srt, .vtt, .ass)...';
    loadSubBtn.onclick = async (e) => {
      e.stopPropagation();
      this.subTrackMenu.classList.remove('active');
      const res = await window.api.selectSubtitle();
      if (res && res.content) {
        this.addSubtitleTrack(res.fileName, res.content, true);
        this.app.ui.showToast(`Loaded subtitle: ${res.fileName}`);
      }
    };
    this.subTrackMenu.appendChild(loadSubBtn);

    const onlineSubBtn = document.createElement('button');
    onlineSubBtn.className = 'track-option';
    onlineSubBtn.style.color = 'var(--accent-gold)';
    onlineSubBtn.innerHTML = '🌐 Search Subtitles Online (Auto-Download)...';
    onlineSubBtn.onclick = (e) => {
      e.stopPropagation();
      this.subTrackMenu.classList.remove('active');
      this.openOnlineSubtitlesModal();
    };
    this.subTrackMenu.appendChild(onlineSubBtn);
  }

  onTimeUpdate() {
    if (!this.video.duration) return;
    const current = this.video.currentTime;
    const duration = this.video.duration;

    const percent = (current / duration) * 100;
    this.progressFill.style.width = `${percent}%`;
    this.timeDisplay.textContent = `${this.formatTime(current)} / ${this.formatTime(duration)}`;

    // Intro / Opening Detection (AniSkip or Smart 85s Intro)
    if (this.skipIntervals?.op) {
      const { start, end } = this.skipIntervals.op;
      if (current >= start && current < end) {
        if (this.app.store.autoSkip) {
          this.video.currentTime = end;
          this.app.ui.showToast('⏭️ Auto-skipped Opening!');
        } else {
          if (this.skipIntroBtn) {
            this.skipIntroBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg> Skip Opening';
            this.skipIntroBtn.classList.remove('hidden');
          }
        }
      } else {
        this.skipIntroBtn?.classList.add('hidden');
      }
    } else if (current >= 15 && current <= 165 && duration > 450 && (this.currentAnime?.isTv || this.app.currentMode === 'anime')) {
      if (this.skipIntroBtn) {
        this.skipIntroBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg> Skip Intro (+85s)';
        this.skipIntroBtn.classList.remove('hidden');
      }
    } else {
      this.skipIntroBtn?.classList.add('hidden');
    }

    // Outro / Ending Detection (AniSkip or Smart Credits Skip)
    const timeLeft = duration - current;
    if (this.skipIntervals?.ed) {
      const { start, end } = this.skipIntervals.ed;
      if (current >= start && current < end) {
        if (this.app.store.autoSkip) {
          this.video.currentTime = end;
          this.app.ui.showToast('⏭️ Auto-skipped Ending!');
        } else {
          if (this.skipEndingBtn) {
            this.skipEndingBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg> Skip Ending';
            this.skipEndingBtn.classList.remove('hidden');
          }
        }
      } else {
        this.skipEndingBtn?.classList.add('hidden');
      }
    } else if (timeLeft <= 90 && timeLeft >= 20 && duration > 450 && (this.currentAnime?.isTv || this.app.currentMode === 'anime')) {
      if (this.skipEndingBtn) {
        this.skipEndingBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg> Skip Outro';
        this.skipEndingBtn.classList.remove('hidden');
      }
    } else {
      this.skipEndingBtn?.classList.add('hidden');
    }

    // Prompt next episode near end (last 30 seconds or 95%)
    if ((timeLeft <= 30 || percent >= 95) && !this.nextEpPromptShown && this.currentEpIndex < this.currentAnime.episodes.length - 1) {
      this.showNextEpPrompt(timeLeft);
    }

    // Sync playback state to Mobile Remote / LAN companion (heartbeat every 800ms)
    const now = Date.now();
    if (!this._lastRemoteSync || now - this._lastRemoteSync > 800) {
      this._lastRemoteSync = now;
      if (window.api?.sendPlaybackState) {
        window.api.sendPlaybackState({
          playing: !this.video.paused,
          currentTime: current,
          duration: duration,
          title: this.titleHeader.textContent || 'AnimeOpen',
          episodeTitle: this.epHeader.textContent || '',
          cover: this.currentAnime?.metadata?.cover || (this.currentAnime?.metadata?.localCover ? window.api.getLocalImageUrl(this.currentAnime.metadata.localCover) : ''),
          volume: this.video.volume,
          muted: this.video.muted,
          filePath: this.currentEpisode?.filePath || null,
          isCinema: this.app.currentMode === 'cinema'
        });
      }
    }
  }

  updateBuffer() {
    if (this.video.buffered.length > 0 && this.video.duration) {
      const bufferedEnd = this.video.buffered.end(this.video.buffered.length - 1);
      const percent = (bufferedEnd / this.video.duration) * 100;
      this.bufferFill.style.width = `${percent}%`;
    }
  }

  seek(e) {
    const rect = this.progressBar.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const targetTime = pos * this.video.duration;
    this.video.currentTime = targetTime;
  }

  updateSeekTooltip(e) {
    const rect = this.progressBar.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const hoverTime = pos * this.video.duration;
    
    this.timeTooltip.textContent = this.formatTime(hoverTime);
    this.timeTooltip.style.left = `${pos * 100}%`;
  }

  skip(seconds) {
    if (!this.video.duration) return;
    this.video.currentTime = Math.max(0, Math.min(this.video.duration, this.video.currentTime + seconds));
    this.showFlashIcon(seconds > 0 ? 'icon-forward' : 'icon-backward');
    this.showControlsTemporarily();
  }

  togglePlay() {
    if (this.video.paused) {
      this.video.play();
      this.showFlashIcon('icon-play');
    } else {
      this.video.pause();
      this.showFlashIcon('icon-pause');
    }
  }

  updatePlayIcon(isPlaying) {
    const playIconSvg = document.getElementById('playIconSvg');
    if (isPlaying) {
      playIconSvg.innerHTML = `<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>`;
    } else {
      playIconSvg.innerHTML = `<path d="M8 5v14l11-7z"/>`;
    }
  }

  setVolume(vol) {
    this.video.volume = vol;
    this.volumeSlider.value = vol;
    this.updateVolumeIcon(vol);
  }

  toggleMute() {
    this.video.muted = !this.video.muted;
    if (this.video.muted) {
      this.volumeSlider.value = 0;
      this.updateVolumeIcon(0);
    } else {
      this.volumeSlider.value = this.video.volume;
      this.updateVolumeIcon(this.video.volume);
    }
  }

  updateVolumeIcon(vol) {
    const svg = document.getElementById('volumeIconSvg');
    if (vol === 0 || this.video.muted) {
      svg.innerHTML = `<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>`;
    } else if (vol < 0.5) {
      svg.innerHTML = `<path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>`;
    } else {
      svg.innerHTML = `<path d="M3 9v6h4l5 5V4L9 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>`;
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      this.container.requestFullscreen().catch(err => console.error(err));
    } else {
      document.exitFullscreen().catch(err => console.error(err));
    }
  }

  async togglePiP() {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await this.video.requestPictureInPicture();
      }
    } catch (err) {
      console.error('PiP error:', err);
    }
  }

  showFlashIcon(type) {
    this.centerActionIcon.className = `center-action-icon flash ${type}`;
    setTimeout(() => {
      this.centerActionIcon.className = 'center-action-icon';
    }, 600);
  }

  showControlsTemporarily() {
    this.controls.classList.remove('idle-hide');
    this.topbar.classList.remove('idle-hide');
    this.container.style.cursor = 'default';

    clearTimeout(this.controlsTimeout);
    if (!this.video.paused) {
      this.controlsTimeout = setTimeout(() => {
        this.hideControls();
      }, 2500);
    }
  }

  hideControls() {
    if (!this.video.paused) {
      this.controls.classList.add('idle-hide');
      this.topbar.classList.add('idle-hide');
      this.container.style.cursor = 'none';
    }
  }

  showNextEpPrompt(timeLeft) {
    this.nextEpPromptShown = true;
    const nextEp = this.currentAnime.episodes[this.currentEpIndex + 1];
    if (!nextEp) return;

    const titleEl = document.getElementById('nextEpTitlePreview');
    if (titleEl) titleEl.textContent = `${nextEp.displayTitle}`;

    // Set preview thumbnail
    const thumbEl = document.getElementById('nextEpThumbImg');
    if (thumbEl) {
      const meta = this.currentAnime?.metadata || {};
      const bannerSrc = meta.localBanner
        ? window.api.getLocalImageUrl(meta.localBanner)
        : (meta.localCover ? window.api.getLocalImageUrl(meta.localCover) : meta.cover);
      if (bannerSrc) {
        thumbEl.src = bannerSrc;
        thumbEl.style.display = 'block';
      } else {
        thumbEl.style.display = 'none';
      }
    }

    this.nextOverlay.classList.remove('hidden');

    let seconds = Math.min(15, Math.max(3, Math.floor(timeLeft || 10)));
    const countdownEl = document.getElementById('nextEpCountdown');
    if (countdownEl) countdownEl.textContent = `Auto-playing in ${seconds}s...`;

    clearInterval(this.nextEpCountdown);
    this.nextEpCountdown = setInterval(() => {
      seconds--;
      if (seconds <= 0) {
        clearInterval(this.nextEpCountdown);
        this.hideNextEpPrompt();
        this.playNextEpisode();
      } else {
        if (countdownEl) countdownEl.textContent = `Auto-playing in ${seconds}s...`;
      }
    }, 1000);
  }

  hideNextEpPrompt() {
    clearInterval(this.nextEpCountdown);
    this.nextOverlay.classList.add('hidden');
  }

  playNextEpisode() {
    if (this.currentEpIndex < this.currentAnime.episodes.length - 1) {
      this.saveProgress(true); // Mark current as watched
      const nextEp = this.currentAnime.episodes[this.currentEpIndex + 1];
      this.loadEpisode(this.currentAnime, nextEp);
    }
  }

  playPreviousEpisode() {
    if (this.currentEpIndex > 0) {
      const prevEp = this.currentAnime.episodes[this.currentEpIndex - 1];
      this.loadEpisode(this.currentAnime, prevEp);
    }
  }

  onEnded() {
    this.saveProgress(true);

    // 1. Check Marathon Queue first!
    if (this.app.queueManager && this.app.queueManager.hasNext()) {
      this.app.ui.showToast('⏭️ Playing next item from Marathon Queue...');
      this.app.queueManager.playNext();
      return;
    }

    if (this.currentEpIndex < this.currentAnime.episodes.length - 1) {
      this.playNextEpisode();
    } else {
      this.app.ui.showToast('You finished the last episode of this collection!');
    }
  }

  startSavingProgress() {
    clearInterval(this.saveProgressInterval);
    this.saveProgressInterval = setInterval(() => {
      this.saveProgress(false);
    }, 4000);
  }

  saveProgress(isCompleted = false) {
    if (!this.currentEpisode || !this.video.duration) return;

    const current = this.video.currentTime;
    const duration = this.video.duration;
    const completed = isCompleted || (current / duration) >= 0.88;

    this.app.updateWatchProgress(
      this.currentEpisode.filePath,
      current,
      duration,
      completed,
      this.currentAnime.id,
      this.currentEpisode.id
    );
  }

  close() {
    this.saveProgress(false);
    clearInterval(this.saveProgressInterval);
    clearInterval(this.nextEpCountdown);
    this.hideNextEpPrompt();
    this.video.pause();
    this.video.src = '';

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }

    this.container.classList.add('hidden');
    document.body.classList.remove('in-player');
    this.app.onPlayerClosed();
  }

  skipIntro() {
    if (this.skipIntervals?.op) {
      this.video.currentTime = this.skipIntervals.op.end;
      this.skipIntroBtn?.classList.add('hidden');
      this.app.ui.showToast('⏭️ Skipped Opening!');
    } else {
      this.video.currentTime = Math.min(this.video.currentTime + 85, this.video.duration - 15);
      this.skipIntroBtn?.classList.add('hidden');
      this.app.ui.showToast('⏭️ Skipped Intro (+85s)!');
    }
  }

  skipEnding() {
    if (this.skipIntervals?.ed) {
      this.video.currentTime = this.skipIntervals.ed.end;
      this.skipEndingBtn?.classList.add('hidden');
      this.app.ui.showToast('⏭️ Skipped Ending!');
    } else {
      this.video.currentTime = Math.max(0, this.video.duration - 2);
      this.skipEndingBtn?.classList.add('hidden');
      this.app.ui.showToast('⏭️ Skipped Outro!');
    }
  }

  async takeScreenshot() {
    if (!this.video || !this.video.videoWidth) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = this.video.videoWidth;
      canvas.height = this.video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(this.video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');

      // Visual flash animation
      const flash = document.createElement('div');
      flash.className = 'screenshot-flash';
      this.container.appendChild(flash);
      setTimeout(() => flash.remove(), 400);

      // Copy to clipboard if supported
      canvas.toBlob(blob => {
        if (blob && navigator.clipboard && window.ClipboardItem) {
          navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).catch(() => {});
        }
      });

      const res = await window.api.saveScreenshot({
        dataUrl,
        animeTitle: this.currentAnime?.title,
        epNumber: this.currentEpisode?.episodeNumber
      });

      if (res.success) {
        this.app.ui.showToast(`📸 Saved: ${res.filename} (also copied to clipboard)`);
      } else {
        this.app.ui.showToast('📸 Screenshot copied to clipboard!');
      }
    } catch (err) {
      console.error('Screenshot error:', err);
      this.app.ui.showToast('Failed to capture screenshot');
    }
  }

  async playInExternalPlayer() {
    if (!this.currentEpisode) return;
    this.video.pause();
    const currentTime = this.video.currentTime || 0;
    const res = await window.api.openExternalPlayer({
      filePath: this.currentEpisode.filePath,
      startTime: currentTime
    });
    if (res.success) {
      this.app.ui.showToast(`🚀 Launched in ${res.player} at ${this.formatTime(currentTime)}`);
    } else {
      this.app.ui.showToast(`External player error: ${res.error}`);
    }
  }

  bindGlobalKeys() {
    if (window.api?.onPlayerGlobalKey) {
      window.api.onPlayerGlobalKey((action) => {
        if (!this.container || !this.video) return;
        const isPlayerActive = !this.container.classList.contains('hidden') || !this.video.paused;
        if (!isPlayerActive) return;

        if (action === 'play-pause') {
          this.togglePlay();
        } else if (action === 'next') {
          this.playNextEpisode();
        } else if (action === 'prev') {
          this.playPreviousEpisode();
        }
      });
    }
  }

  async initSubtitleStyles() {
    let settings = {
      fontSize: '1.25rem',
      color: '#ffffff',
      style: 'shadow'
    };
    try {
      if (window.api?.getStore) {
        const saved = await window.api.getStore('subStyleSettings');
        if (saved && typeof saved === 'object') {
          settings = { ...settings, ...saved };
        }
      }
    } catch (e) {}
    this.subStyleSettings = settings;
    this.applySubtitleStyles(settings);
  }

  applySubtitleStyles(settings) {
    this.subStyleSettings = { ...this.subStyleSettings, ...settings };
    const root = document.documentElement;

    root.style.setProperty('--sub-font-size', this.subStyleSettings.fontSize || '1.25rem');
    root.style.setProperty('--sub-color', this.subStyleSettings.color || '#ffffff');

    if (this.subStyleSettings.style === 'box') {
      root.style.setProperty('--sub-bg', 'rgba(0, 0, 0, 0.85)');
      root.style.setProperty('--sub-shadow', 'none');
    } else {
      root.style.setProperty('--sub-bg', 'transparent');
      root.style.setProperty('--sub-shadow', '0 0 4px #000, 0 0 4px #000, 2px 2px 4px #000, -2px -2px 4px #000');
    }

    if (window.api?.setStore) {
      window.api.setStore('subStyleSettings', this.subStyleSettings).catch(() => {});
    }
  }

  adjustSubtitleOffset(delta) {
    this.subtitleOffset += delta;
    const badge = document.getElementById('subOffsetValBadge');
    if (badge) {
      badge.textContent = `${this.subtitleOffset >= 0 ? '+' : ''}${this.subtitleOffset.toFixed(1)}s`;
    }

    for (let i = 0; i < this.video.textTracks.length; i++) {
      const track = this.video.textTracks[i];
      if (track.cues) {
        for (let j = 0; j < track.cues.length; j++) {
          const cue = track.cues[j];
          cue.startTime = Math.max(0, cue.startTime + delta);
          cue.endTime = Math.max(0, cue.endTime + delta);
        }
      }
    }

    const sign = this.subtitleOffset >= 0 ? '+' : '';
    this.app.ui.showToast(`Subtitle sync: ${sign}${this.subtitleOffset.toFixed(1)}s (${delta > 0 ? '+' : ''}${delta}s)`);
  }

  resetSubtitleOffset() {
    const delta = -this.subtitleOffset;
    if (Math.abs(delta) < 0.001) return;
    this.adjustSubtitleOffset(delta);
    this.subtitleOffset = 0;
    const badge = document.getElementById('subOffsetValBadge');
    if (badge) badge.textContent = '0.0s';
  }

  bindOnlineSubtitlesModal() {
    const modal = document.getElementById('onlineSubtitlesModal');
    const closeBtn = document.getElementById('btnCloseOnlineSubModal');
    const searchBtn = document.getElementById('btnOnlineSubSearch');
    const queryInput = document.getElementById('onlineSubSearchQuery');
    const epInput = document.getElementById('onlineSubEpisodeNum');

    if (!modal) return;

    closeBtn?.addEventListener('click', () => {
      modal.classList.add('hidden');
    });

    searchBtn?.addEventListener('click', () => {
      this.searchOnlineSubs();
    });

    queryInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.searchOnlineSubs();
    });

    epInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.searchOnlineSubs();
    });
  }

  openOnlineSubtitlesModal() {
    const modal = document.getElementById('onlineSubtitlesModal');
    const queryInput = document.getElementById('onlineSubSearchQuery');
    const epInput = document.getElementById('onlineSubEpisodeNum');
    if (!modal) return;

    if (queryInput) queryInput.value = this.currentAnime?.metadata?.title || this.currentAnime?.title || '';
    if (epInput) epInput.value = this.currentEpisode?.episodeNumber || '';

    modal.classList.remove('hidden');
    this.searchOnlineSubs();
  }

  async searchOnlineSubs() {
    const queryInput = document.getElementById('onlineSubSearchQuery');
    const epInput = document.getElementById('onlineSubEpisodeNum');
    const resultsContainer = document.getElementById('onlineSubResultsList');
    if (!resultsContainer) return;

    const query = queryInput ? queryInput.value.trim() : '';
    const episodeNumber = epInput ? epInput.value.trim() : '';

    resultsContainer.innerHTML = `
      <div style="padding:28px;text-align:center;color:var(--text-muted)">
        <div class="download-spinner" style="margin:0 auto 12px;width:24px;height:24px;border:3px solid var(--accent-primary);border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
        Searching subtitle databases (AnimeTosho, OpenSubtitles)...
      </div>
    `;

    try {
      const res = await window.api.searchOnlineSubtitles({
        query,
        episodeNumber,
        animeTitle: this.currentAnime?.title
      });

      if (!res.success || !res.subtitles || res.subtitles.length === 0) {
        resultsContainer.innerHTML = `
          <div style="padding:28px;text-align:center;color:var(--text-muted)">
            <p style="font-weight:600;margin-bottom:6px;">No subtitles found matching "${query}" Ep ${episodeNumber || 'any'}.</p>
            <small>Try modifying the anime title or clearing the episode number to search all available tracks.</small>
          </div>
        `;
        return;
      }

      resultsContainer.innerHTML = '';
      res.subtitles.forEach(sub => {
        const card = document.createElement('div');
        card.className = 'online-sub-card';
        card.innerHTML = `
          <div class="online-sub-info">
            <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;">
              <span class="sub-chip active" style="font-size:0.7rem;padding:2px 8px;background:var(--accent-primary);color:#fff;">${sub.language || 'English'}</span>
              <span class="sub-chip" style="font-size:0.7rem;padding:2px 8px;background:rgba(255,255,255,0.1);">${sub.source || 'AnimeTosho'}</span>
              ${sub.format ? `<span class="sub-chip" style="font-size:0.7rem;padding:2px 8px;background:rgba(255,255,255,0.06);">${sub.format.toUpperCase()}</span>` : ''}
            </div>
            <div class="online-sub-filename" title="${sub.filename}">${sub.filename}</div>
          </div>
          <button class="btn-primary btn-apply-sub" style="padding:6px 14px;font-size:0.85rem;white-space:nowrap;">
            ⬇ Apply Subtitle
          </button>
        `;

        const applyBtn = card.querySelector('.btn-apply-sub');
        applyBtn.addEventListener('click', async () => {
          applyBtn.textContent = '⏳ Applying...';
          applyBtn.disabled = true;

          const dlRes = await window.api.downloadOnlineSubtitle({
            downloadUrl: sub.downloadUrl,
            fileName: sub.filename,
            videoFilePath: this.currentEpisode?.filePath
          });

          if (dlRes && dlRes.success && dlRes.content) {
            this.addSubtitleTrack(dlRes.fileName || sub.filename, dlRes.content, true);
            this.app.ui.showToast(`✅ Subtitle attached: ${dlRes.fileName || sub.filename}`);
            document.getElementById('onlineSubtitlesModal')?.classList.add('hidden');
          } else {
            applyBtn.textContent = 'Failed';
            this.app.ui.showToast(`⚠️ Could not apply subtitle: ${dlRes?.error || 'Unknown error'}`);
          }
        });

        resultsContainer.appendChild(card);
      });
    } catch (err) {
      resultsContainer.innerHTML = `
        <div style="padding:28px;text-align:center;color:#ef4444">
          Error searching subtitles: ${err.message || err}
        </div>
      `;
    }
  }

  formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}

window.AnimePlayer = AnimePlayer;

