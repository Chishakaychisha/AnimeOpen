/**
 * Anime & Cinema Theme Jukebox & Music Vault
 * Explores and plays official openings, endings, and soundtrack themes.
 */

class AnimeJukebox {
  constructor(app) {
    this.app = app;
    this.modalEl = null;
    this.listEl = null;
    this.iframeEl = null;
    this.nowPlayingTitle = null;
    this.searchInput = null;
    this.allThemes = [];
    this.currentTrack = null;
    this.initDOM();
  }

  initDOM() {
    this.modalEl = document.getElementById('jukeboxModal');
    this.listEl = document.getElementById('jukeboxThemesList');
    this.playerContainer = document.getElementById('jukeboxPlayer');
    this.iframeEl = document.getElementById('jukeboxIframe');
    this.nowPlayingTitle = document.getElementById('jukeboxNowPlaying');
    this.closeBtn = document.getElementById('btnCloseJukebox');
    this.searchInput = document.getElementById('inputJukeboxSearch');

    this.closeBtn?.addEventListener('click', () => this.close());
    this.modalEl?.addEventListener('click', (e) => {
      if (e.target === this.modalEl) this.close();
    });

    this.searchInput?.addEventListener('input', () => {
      this.filterThemes(this.searchInput.value);
    });
  }

  async open() {
    if (this.modalEl) {
      this.modalEl.classList.remove('hidden');
    }
    await this.renderThemes();
  }

  close() {
    if (this.iframeEl) {
      this.iframeEl.src = '';
    }
    if (this.modalEl) {
      this.modalEl.classList.add('hidden');
    }
  }

  async renderThemes() {
    if (!this.listEl) return;
    this.listEl.innerHTML = `
      <div style="grid-column: 1/-1; text-align:center; padding: 40px; color:#888;">
        <div style="font-size:2rem; margin-bottom:10px;">🎵</div>
        <div>Loading themes from your collection...</div>
      </div>
    `;

    // Combine active anime and cinema lists
    const isCinema = this.app.currentMode === 'cinema';
    const mediaList = isCinema 
      ? (this.app.cinemaList?.length ? this.app.cinemaList : this.app.animeList)
      : (this.app.animeList?.length ? this.app.animeList : this.app.cinemaList);

    if (!mediaList || mediaList.length === 0) {
      this.listEl.innerHTML = `
        <div style="grid-column: 1/-1; text-align:center; padding: 40px; color:#888;">
          <div style="font-size:2rem; margin-bottom:10px;">📻</div>
          <h3>No Media In Library</h3>
          <p style="font-size:0.85rem; margin-top:6px;">Add anime or movies to unlock soundtracks and theme songs!</p>
        </div>
      `;
      return;
    }

    const themesList = [];
    const sample = mediaList.slice(0, 30);

    for (const item of sample) {
      const title = item.metadata?.title || item.title;
      const cover = item.metadata?.cover || '';
      const year = item.metadata?.year || '';

      if (isCinema || item.isMovie) {
        themesList.push({
          animeTitle: title,
          cover: cover,
          type: 'OST',
          text: 'Official Soundtrack / Main Theme',
          query: `${title} ${year} official soundtrack main theme`
        });
        themesList.push({
          animeTitle: title,
          cover: cover,
          type: 'Score',
          text: 'Theatrical Theme Suite',
          query: `${title} score soundtrack suite`
        });
      } else {
        // Anime OP & ED
        themesList.push({
          animeTitle: title,
          cover: cover,
          type: 'OP 1',
          text: 'Official Opening Theme',
          query: `${title} creditless opening 1`
        });
        themesList.push({
          animeTitle: title,
          cover: cover,
          type: 'ED 1',
          text: 'Official Ending Theme',
          query: `${title} creditless ending 1`
        });
      }
    }

    this.allThemes = themesList;
    this.renderThemeCards(themesList);
  }

  renderThemeCards(themes) {
    if (!this.listEl) return;
    this.listEl.innerHTML = '';

    if (themes.length === 0) {
      this.listEl.innerHTML = `
        <div style="grid-column: 1/-1; text-align:center; padding: 40px; color:#888;">
          <div>No themes match your search query.</div>
        </div>
      `;
      return;
    }

    themes.forEach(t => {
      const card = document.createElement('div');
      card.className = 'jukebox-theme-card';
      card.innerHTML = `
        <div style="display:flex; gap:12px; align-items:center;">
          <img src="${t.cover || ''}" style="width:48px;height:48px;border-radius:6px;object-fit:cover;background:#1a1726;" onerror="this.style.display='none'" alt="" />
          <div style="flex:1;min-width:0;">
            <span class="theme-type-badge">${t.type}</span>
            <div class="theme-title-text" title="${t.text}">${t.text}</div>
            <div class="theme-series-title" title="${t.animeTitle}">${t.animeTitle}</div>
          </div>
          <button class="btn-primary" style="padding:6px 12px;font-size:0.8rem;border-radius:6px;cursor:pointer;">
            ▶ Play
          </button>
        </div>
      `;

      card.onclick = () => this.playTheme(t);
      this.listEl.appendChild(card);
    });
  }

  filterThemes(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) {
      this.renderThemeCards(this.allThemes);
      return;
    }
    const filtered = this.allThemes.filter(t => 
      t.animeTitle.toLowerCase().includes(q) ||
      t.text.toLowerCase().includes(q) ||
      t.type.toLowerCase().includes(q)
    );
    this.renderThemeCards(filtered);
  }

  async playTheme(theme) {
    this.currentTrack = theme;
    if (this.nowPlayingTitle) {
      this.nowPlayingTitle.textContent = `⏳ Loading: ${theme.animeTitle} - ${theme.text}...`;
    }

    let ytId = null;
    if (window.api?.searchYoutubeVideo) {
      try {
        const res = await window.api.searchYoutubeVideo(theme.query);
        if (res && res.success && res.videoId) {
          ytId = res.videoId;
        }
      } catch (err) {
        console.warn('YouTube search for jukebox theme failed:', err);
      }
    }

    if (ytId && this.iframeEl) {
      if (this.nowPlayingTitle) {
        this.nowPlayingTitle.innerHTML = `
          <span>▶ Now Playing: <strong>${theme.animeTitle}</strong> - ${theme.text}</span>
          <a href="https://www.youtube.com/watch?v=${ytId}" target="_blank" style="color:var(--accent-gold);margin-left:10px;text-decoration:none;font-size:0.8rem;">[YouTube ↗]</a>
        `;
      }
      this.iframeEl.src = `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&rel=0&modestbranding=1`;
    } else {
      if (this.nowPlayingTitle) {
        this.nowPlayingTitle.textContent = `Could not load theme preview for "${theme.animeTitle}".`;
      }
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AnimeJukebox;
}
