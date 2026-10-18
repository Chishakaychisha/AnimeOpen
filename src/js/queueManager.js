/**
 * Binge Marathon Queue & Playlist Manager for AnimeOpen & CinemaOpen
 * Seamlessly manages continuous auto-playback across anime episodes, movies, and sagas.
 */

class QueueManager {
  constructor(app) {
    this.app = app;
    this.queue = [];
    this.currentIndex = -1;
    this.initDOM();
  }

  initDOM() {
    this.badgeEl = document.getElementById('marathonQueueBadge');
    this.modalEl = document.getElementById('marathonQueueModal');
    this.listEl = document.getElementById('marathonQueueList');
  }

  add(anime, episode) {
    if (!anime || !episode) return;
    const item = {
      id: 'q_' + Math.random().toString(36).substring(2, 9),
      anime,
      episode,
      title: anime.metadata?.title || anime.title,
      displayTitle: episode.displayTitle || episode.fileName,
      cover: anime.metadata?.cover || (anime.metadata?.localCover ? window.api.getLocalImageUrl(anime.metadata.localCover) : ''),
      filePath: episode.filePath,
      streamUrl: episode.streamUrl || null
    };

    this.queue.push(item);
    this.updateUI();
    this.app.ui.showToast(`➕ Added "${item.displayTitle}" to Marathon Queue!`);
  }

  addMultiple(anime, episodes = []) {
    if (!anime || !episodes.length) return;
    episodes.forEach(ep => {
      this.queue.push({
        id: 'q_' + Math.random().toString(36).substring(2, 9),
        anime,
        episode: ep,
        title: anime.metadata?.title || anime.title,
        displayTitle: ep.displayTitle || ep.fileName,
        cover: anime.metadata?.cover || (anime.metadata?.localCover ? window.api.getLocalImageUrl(anime.metadata.localCover) : ''),
        filePath: ep.filePath,
        streamUrl: ep.streamUrl || null
      });
    });
    this.updateUI();
    this.app.ui.showToast(`➕ Added ${episodes.length} items to Marathon Queue!`);
  }

  remove(index) {
    if (index >= 0 && index < this.queue.length) {
      this.queue.splice(index, 1);
      if (this.currentIndex >= index) {
        this.currentIndex = Math.max(-1, this.currentIndex - 1);
      }
      this.updateUI();
    }
  }

  clear() {
    this.queue = [];
    this.currentIndex = -1;
    this.updateUI();
    this.app.ui.showToast('Marathon Queue cleared');
  }

  hasNext() {
    return this.currentIndex + 1 < this.queue.length;
  }

  playNext() {
    if (!this.hasNext()) return false;
    this.currentIndex++;
    const nextItem = this.queue[this.currentIndex];
    this.updateUI();
    this.app.player.loadEpisode(nextItem.anime, nextItem.episode);
    return true;
  }

  playFromIndex(index) {
    if (index >= 0 && index < this.queue.length) {
      this.currentIndex = index;
      const item = this.queue[this.currentIndex];
      this.updateUI();
      this.app.player.loadEpisode(item.anime, item.episode);
      if (this.modalEl) this.modalEl.classList.add('hidden');
    }
  }

  updateUI() {
    if (this.badgeEl) {
      if (this.queue.length > 0) {
        this.badgeEl.textContent = this.queue.length;
        this.badgeEl.classList.remove('hidden');
      } else {
        this.badgeEl.classList.add('hidden');
      }
    }

    if (this.listEl) {
      if (this.queue.length === 0) {
        this.listEl.innerHTML = `
          <div style="text-align:center; padding: 40px 20px; color:#888;">
            <div style="font-size:2.5rem; margin-bottom:10px;">📺</div>
            <h3>Your Marathon Queue is Empty</h3>
            <p style="font-size:0.85rem; margin-top:6px;">Add movies or episodes to binge seamlessly with zero interruptions!</p>
          </div>
        `;
        return;
      }

      this.listEl.innerHTML = '';
      this.queue.forEach((item, idx) => {
        const isCurrent = idx === this.currentIndex;
        const row = document.createElement('div');
        row.className = `queue-item-row ${isCurrent ? 'active-queue-item' : ''}`;
        row.innerHTML = `
          <div class="queue-num">${idx + 1}</div>
          <img class="queue-thumb" src="${item.cover || ''}" alt="" onerror="this.style.display='none'" />
          <div class="queue-info">
            <div class="queue-series-title">${item.title}</div>
            <div class="queue-ep-title">${item.displayTitle}</div>
          </div>
          <div class="queue-actions">
            <button class="queue-play-btn" title="Play Now">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>
            <button class="queue-del-btn" title="Remove from Queue">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          </div>
        `;

        row.querySelector('.queue-play-btn').onclick = () => this.playFromIndex(idx);
        row.querySelector('.queue-del-btn').onclick = () => this.remove(idx);
        this.listEl.appendChild(row);
      });
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = QueueManager;
}
