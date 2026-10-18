/**
 * Official Trailer Player Modal for AnimeOpen & CinemaOpen
 * Plays high-res official theatrical trailers for movies, TV series, and anime.
 */

class TrailerModal {
  constructor(app) {
    this.app = app;
    this.modalEl = null;
    this.iframeEl = null;
    this.titleEl = null;
    this.externalBtn = null;
    this.currentYtId = null;
    this.currentTitle = '';
    this.initDOM();
  }

  initDOM() {
    this.modalEl = document.getElementById('trailerModal');
    this.iframeEl = document.getElementById('trailerIframe');
    this.titleEl = document.getElementById('trailerTitle');
    this.closeBtn = document.getElementById('btnCloseTrailer');
    this.externalBtn = document.getElementById('btnTrailerExternal');

    this.closeBtn?.addEventListener('click', () => this.close());
    this.externalBtn?.addEventListener('click', () => this.openExternal());
    this.modalEl?.addEventListener('click', (e) => {
      if (e.target === this.modalEl) this.close();
    });
  }

  async open(mediaItem) {
    if (!mediaItem) return;
    const title = mediaItem.metadata?.title || mediaItem.title;
    const year = mediaItem.metadata?.year || mediaItem.year || '';
    const isCinema = this.app.currentMode === 'cinema';

    this.currentTitle = title;
    this.currentYtId = null;

    if (this.titleEl) {
      this.titleEl.textContent = `🎬 ${title} ${year ? `(${year})` : ''} • Official Trailer`;
    }

    if (this.modalEl) {
      this.modalEl.classList.remove('hidden');
    }

    // 1. Direct YouTube trailer ID from metadata if present
    let ytId = null;
    if (mediaItem.metadata?.trailer?.site?.toLowerCase() === 'youtube' && mediaItem.metadata?.trailer?.id) {
      ytId = mediaItem.metadata.trailer.id;
    }

    // 2. Search YouTube video via main process IPC (no CORS blocks)
    if (!ytId && window.api?.searchYoutubeVideo) {
      const query = `${title} ${year} official trailer ${isCinema ? 'movie' : 'anime'}`;
      try {
        const res = await window.api.searchYoutubeVideo(query);
        if (res && res.success && res.videoId) {
          ytId = res.videoId;
        }
      } catch (err) {
        console.warn('Trailer search failed:', err);
      }
    }

    this.currentYtId = ytId;

    if (this.iframeEl) {
      if (ytId) {
        this.iframeEl.src = `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&rel=0&modestbranding=1`;
      } else {
        // Direct search fallback
        this.iframeEl.srcdoc = `
          <div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;background:#0d0c14;font-family:sans-serif;text-align:center;padding:20px;">
            <div style="font-size:2.4rem;margin-bottom:10px;">🎬</div>
            <h3 style="margin-bottom:8px;">${title} Trailer</h3>
            <p style="color:#aaa;font-size:0.9rem;margin-bottom:16px;">Direct embed unavailable for this title.</p>
            <button onclick="window.parent.postMessage({action:'openYoutube'}, '*')" style="padding:10px 20px;background:#ff3366;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;">
              ▶ Search & Watch on YouTube
            </button>
          </div>
        `;
      }
    }
  }

  openExternal() {
    const targetUrl = this.currentYtId 
      ? `https://www.youtube.com/watch?v=${this.currentYtId}`
      : `https://www.youtube.com/results?search_query=${encodeURIComponent(this.currentTitle + ' official trailer')}`;
    if (window.api?.openExternalUrl) {
      window.api.openExternalUrl(targetUrl);
    }
  }

  close() {
    if (this.iframeEl) {
      this.iframeEl.src = '';
      this.iframeEl.srcdoc = '';
    }
    if (this.modalEl) {
      this.modalEl.classList.add('hidden');
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TrailerModal;
}
