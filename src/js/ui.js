/**
 * UI Renderer for AnimeOpen
 */

class AnimeUI {
  constructor(app) {
    this.app = app;
    this.toastTimeout = null;
  }

  showToast(message, duration = 3000) {
    let toast = document.getElementById('appToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'appToast';
      toast.className = 'app-toast';
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add('visible');

    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.classList.remove('visible');
    }, duration);
  }

  renderLibrary(animeList, continueWatchingList = []) {
    const grid = document.getElementById('animeGrid');
    const emptyState = document.getElementById('emptyState');
    const continueSection = document.getElementById('continueWatchingSection');
    const continueGrid = document.getElementById('continueGrid');
    const heroBanner = document.getElementById('heroBanner');

    if (!animeList || animeList.length === 0) {
      grid.innerHTML = '';
      emptyState.classList.remove('hidden');
      if (continueSection) continueSection.classList.add('hidden');
      if (heroBanner) heroBanner.classList.add('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    // Render Netflix-style Hero Featured / Recently Added Banner
    this.renderHeroBanner(animeList, continueWatchingList);

    // Render Continue Watching shelf if any
    if (continueWatchingList.length > 0 && continueSection && continueGrid) {
      continueSection.classList.remove('hidden');
      continueGrid.innerHTML = '';

      continueWatchingList.slice(0, 10).forEach(item => {
        const card = this.createContinueCard(item);
        continueGrid.appendChild(card);
      });
    } else if (continueSection) {
      continueSection.classList.add('hidden');
    }

    // Render Main Anime Grid
    grid.innerHTML = '';
    animeList.forEach(anime => {
      const card = this.createAnimeCard(anime);
      grid.appendChild(card);
    });
  }

  renderHeroBanner(animeList, continueWatchingList = []) {
    const heroBanner = document.getElementById('heroBanner');
    if (!heroBanner) return;

    if (!animeList || animeList.length === 0) {
      heroBanner.classList.add('hidden');
      return;
    }

    // Pick featured anime:
    // First anime in the current view that has banner or cover image metadata,
    // or fallback to the very first item
    const featuredAnime = animeList.find(a => {
      const m = a.metadata;
      return m && (m.banner || m.localBanner || m.cover || m.localCover);
    }) || animeList[0];

    if (!featuredAnime) {
      heroBanner.classList.add('hidden');
      return;
    }

    heroBanner.classList.remove('hidden');

    const meta = featuredAnime.metadata || {};
    const backdropEl = document.getElementById('heroBackdrop');
    const titleEl = document.getElementById('heroTitle');
    const yearEl = document.getElementById('heroYear');
    const epCountEl = document.getElementById('heroEpCount');
    const scoreEl = document.getElementById('heroScore');
    const descEl = document.getElementById('heroDesc');
    const tagLabelEl = document.getElementById('heroTagLabel');
    const btnPlay = document.getElementById('btnHeroPlay');
    const btnInfo = document.getElementById('btnHeroInfo');

    // Series / Film title
    const title = meta.title || featuredAnime.title || 'Unknown Title';
    if (titleEl) titleEl.textContent = title;

    const isCinema = this.app.currentMode === 'cinema';
    const typeBadgeEl = heroBanner.querySelector('.hero-badge-type');
    if (typeBadgeEl) {
      if (isCinema) {
        typeBadgeEl.textContent = (featuredAnime.type === 'MOVIE' || featuredAnime.isMovie) ? 'Movie' : 'TV Series';
      } else {
        typeBadgeEl.textContent = 'Anime';
      }
    }

    // Meta row (Year, Episode Count, Score)
    if (yearEl) {
      const year = meta.year || (featuredAnime.episodes && featuredAnime.episodes[0] ? new Date(featuredAnime.episodes[0].mtime || Date.now()).getFullYear() : '2026');
      yearEl.textContent = year;
    }
    if (epCountEl) {
      if (featuredAnime.type === 'MOVIE' || featuredAnime.isMovie) {
        epCountEl.textContent = meta.runtime || 'Feature Film';
      } else {
        const count = featuredAnime.totalEpisodes || (featuredAnime.episodes ? featuredAnime.episodes.length : 1);
        epCountEl.textContent = `${count} ${count === 1 ? 'Episode' : 'Episodes'}`;
      }
    }
    if (scoreEl) {
      if (meta.score) {
        scoreEl.textContent = `★ ${meta.score}`;
        scoreEl.style.display = 'inline';
      } else {
        scoreEl.style.display = 'none';
      }
    }

    // Description (clean any HTML tags)
    if (descEl) {
      const rawDesc = meta.description || 'Watch now in high quality with auto-episode tracking, subtitle sync controls, and local LAN sharing.';
      descEl.textContent = rawDesc.replace(/<[^>]*>/g, '').trim();
    }

    // Banner / Backdrop Artwork
    let bannerUrl = '';
    if (meta.localBanner) {
      bannerUrl = window.api.getLocalImageUrl(meta.localBanner);
    } else if (meta.banner) {
      bannerUrl = meta.banner;
    } else if (meta.localCover) {
      bannerUrl = window.api.getLocalImageUrl(meta.localCover);
    } else if (meta.cover) {
      bannerUrl = meta.cover;
    }

    if (backdropEl) {
      if (bannerUrl) {
        backdropEl.style.backgroundImage = `url('${bannerUrl}')`;
        backdropEl.style.backgroundColor = 'transparent';
      } else {
        const fallback = isCinema
          ? CinemaMetadata.getFallbackCinemaPoster(title)
          : AnimeMetadata.getFallbackPoster(title);
        backdropEl.style.backgroundImage = 'none';
        backdropEl.style.background = fallback.gradient;
      }
    }

    // Badge label
    if (tagLabelEl) {
      tagLabelEl.textContent = 'Recently Added';
    }

    // Target Episode for Play Button (either resume in-progress, or first episode)
    let targetEpisode = null;
    const continueItem = continueWatchingList.find(c => c.anime.id === featuredAnime.id);
    if (continueItem && continueItem.episode) {
      targetEpisode = continueItem.episode;
    } else if (featuredAnime.episodes && featuredAnime.episodes.length > 0) {
      targetEpisode = featuredAnime.episodes[0];
    }

    // Clone & re-bind play / info buttons
    if (btnPlay) {
      const newBtnPlay = btnPlay.cloneNode(true);
      btnPlay.parentNode.replaceChild(newBtnPlay, btnPlay);
      newBtnPlay.addEventListener('click', (e) => {
        e.stopPropagation();
        if (targetEpisode) {
          this.app.player.loadEpisode(featuredAnime, targetEpisode);
        } else {
          this.app.showAnimeDetail(featuredAnime);
        }
      });
    }

    if (btnInfo) {
      const newBtnInfo = btnInfo.cloneNode(true);
      btnInfo.parentNode.replaceChild(newBtnInfo, btnInfo);
      newBtnInfo.addEventListener('click', (e) => {
        e.stopPropagation();
        this.app.showAnimeDetail(featuredAnime);
      });
    }
  }

  createAnimeCard(anime) {
    const card = document.createElement('div');
    card.className = 'anime-card';
    card.dataset.id = anime.id;

    const isCinema = this.app.currentMode === 'cinema';
    const meta = anime.metadata || {};
    // Prefer locally cached cover if available
    const coverUrl = meta.localCover
      ? window.api.getLocalImageUrl(meta.localCover)
      : meta.cover;
    const fallback = isCinema
      ? CinemaMetadata.getFallbackCinemaPoster(anime.title)
      : AnimeMetadata.getFallbackPoster(anime.title);
    const score = meta.score ? `<div class="card-badge score-badge">★ ${meta.score}</div>` : '';
    
    let format = '';
    if (anime.type === 'MOVIE' || anime.isMovie) {
      format = `<div class="card-badge format-badge movie-badge" style="background:rgba(0, 200, 255, 0.25);color:#00e5ff;border:1px solid rgba(0, 200, 255, 0.45);font-weight:700;">🎬 MOVIE</div>`;
    } else if (anime.type === 'TV' || anime.isTv) {
      format = `<div class="card-badge format-badge tv-badge" style="background:rgba(181, 55, 242, 0.25);color:#da77f2;border:1px solid rgba(181, 55, 242, 0.45);font-weight:700;">📺 TV SHOW</div>`;
    } else if (meta.format) {
      format = `<div class="card-badge format-badge">${meta.format}</div>`;
    }

    const zipBadge = anime.hasZip ? `<div class="card-badge zip-badge">📦 ZIP</div>` : '';
    const epCount = (anime.type === 'MOVIE' || anime.isMovie)
      ? (meta.runtime || 'Feature Film')
      : `${anime.totalEpisodes} ${anime.totalEpisodes === 1 ? 'EP' : 'EPS'}`;

    let coverHtml = '';
    if (coverUrl) {
      coverHtml = `
        <img class="card-cover-img" src="${coverUrl}" alt="${anime.title}" loading="lazy" 
             onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
        <div class="card-fallback-cover" style="background: ${fallback.gradient}; display: none;">
          <span>${fallback.initials}</span>
        </div>
      `;
    } else {
      coverHtml = `
        <div class="card-fallback-cover" style="background: ${fallback.gradient};">
          <span>${fallback.initials}</span>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="card-media-wrapper">
        ${coverHtml}
        <div class="card-badges-top">
          ${score}
          ${format}
          ${zipBadge}
        </div>
        <div class="card-overlay">
          <button class="btn-card-play" title="View Episodes">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div>
        <div class="card-footer-info">
          <span class="card-ep-count">${epCount}</span>
        </div>
      </div>
      <div class="card-body">
        <h3 class="card-title" title="${meta.title || anime.title}">${meta.title || anime.title}</h3>
        <p class="card-subtitle">${meta.romajiTitle || meta.year || anime.episodes[0]?.fileName || ''}</p>
      </div>
    `;

    card.addEventListener('click', () => {
      this.app.showAnimeDetail(anime);
    });

    return card;
  }

  createContinueCard({ anime, episode, history, isNextUp }) {
    const card = document.createElement('div');
    card.className = 'continue-card';

    const meta = anime.metadata || {};
    // Prefer locally cached banner/cover
    const localBannerSrc = meta.localBanner
      ? window.api.getLocalImageUrl(meta.localBanner)
      : (meta.localCover ? window.api.getLocalImageUrl(meta.localCover) : null);
    const bannerUrl = localBannerSrc || meta.banner || meta.cover;
    const progressPercent = isNextUp ? 0 : Math.min(100, Math.round((history.progress / (history.duration || 1)) * 100));

    card.innerHTML = `
      <div class="continue-media">
        <img class="continue-img" src="${bannerUrl || ''}" alt="${anime.title}" onerror="this.src=''" />
        <div class="continue-overlay">
          <button class="continue-play-btn" title="${isNextUp ? 'Play Next Episode' : 'Resume'}">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div>
        ${isNextUp ? '<div class="continue-next-badge">UP NEXT</div>' : `
          <div class="continue-progress-bar">
            <div class="continue-progress-fill" style="width: ${progressPercent}%;"></div>
          </div>
        `}
      </div>
      <div class="continue-info">
        <div class="continue-title" title="${meta.title || anime.title}">${meta.title || anime.title}</div>
        <div class="continue-ep">${isNextUp ? `▶ Up Next: ${episode.displayTitle}` : `Resume ${episode.displayTitle} (${progressPercent}%)`}</div>
      </div>
    `;

    card.addEventListener('click', () => {
      this.app.player.loadEpisode(anime, episode);
    });

    return card;
  }

  renderAnimeDetail(anime) {
    const meta = anime.metadata || {};
    const heroBackdrop = document.getElementById('detailHeroBackdrop');
    const posterImg = document.getElementById('detailPoster');
    const titleEl = document.getElementById('detailTitle');
    const romajiEl = document.getElementById('detailRomaji');
    const descEl = document.getElementById('detailDescription');
    const metaStats = document.getElementById('detailMetaStats');
    const genresList = document.getElementById('detailGenres');
    const episodesList = document.getElementById('detailEpisodesList');
    const epCountBadge = document.getElementById('detailEpCountBadge');

    // Backdrop & Poster — prefer locally cached images
    const fallback = AnimeMetadata.getFallbackPoster(anime.title);
    const coverUrl = meta.localCover
      ? window.api.getLocalImageUrl(meta.localCover)
      : meta.cover;
    const bannerUrl = meta.localBanner
      ? window.api.getLocalImageUrl(meta.localBanner)
      : (meta.banner || meta.cover);

    if (bannerUrl || coverUrl) {
      heroBackdrop.style.backgroundImage = `url('${bannerUrl || coverUrl}')`;
    } else {
      heroBackdrop.style.background = fallback.gradient;
    }

    if (coverUrl) {
      posterImg.src = coverUrl;
      posterImg.style.display = 'block';
    } else {
      posterImg.style.display = 'none';
    }

    // Texts
    titleEl.textContent = meta.title || anime.title;
    romajiEl.textContent = meta.romajiTitle || meta.nativeTitle || '';
    descEl.textContent = meta.description || 'No detailed synopsis available.';

    // Meta stats (Rating, Year, Status, Studio)
    metaStats.innerHTML = '';
    if (meta.score) {
      metaStats.innerHTML += `<div class="meta-pill score-pill">★ ${meta.score} / 10</div>`;
    }
    if (meta.year) {
      metaStats.innerHTML += `<div class="meta-pill">${meta.year}</div>`;
    }
    if (meta.status) {
      metaStats.innerHTML += `<div class="meta-pill status-pill">${meta.status}</div>`;
    }
    if (meta.format) {
      metaStats.innerHTML += `<div class="meta-pill">${meta.format}</div>`;
    }
    if (meta.studio) {
      metaStats.innerHTML += `<div class="meta-pill studio-pill">${meta.studio}</div>`;
    }

    // Genres
    genresList.innerHTML = '';
    (meta.genres || []).forEach(genre => {
      const g = document.createElement('span');
      g.className = 'genre-tag';
      g.textContent = genre;
      genresList.appendChild(g);
    });

    // Episodes or Movie Play
    const isMovie = anime.type === 'MOVIE' || anime.isMovie;
    if (isMovie) {
      epCountBadge.textContent = meta.runtime || 'Feature Film';
    } else {
      epCountBadge.textContent = `${anime.episodes.length} Episodes available`;
    }

    episodesList.innerHTML = '';
    anime.episodes.forEach((episode, index) => {
      const epRow = this.createEpisodeRow(anime, episode, index);
      episodesList.appendChild(epRow);
    });

    // Resume or Play button
    const btnPlayNext = document.getElementById('btnDetailPlayFirst');
    if (isMovie && anime.episodes.length > 0) {
      btnPlayNext.innerHTML = `
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        Play Movie
      `;
      btnPlayNext.onclick = () => this.app.player.loadEpisode(anime, anime.episodes[0]);
    } else {
      const historyEp = this.app.getSuggestedNextEpisode(anime);
      if (historyEp) {
        btnPlayNext.innerHTML = `
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          Resume ${historyEp.displayTitle}
        `;
        btnPlayNext.onclick = () => this.app.player.loadEpisode(anime, historyEp);
      } else if (anime.episodes.length > 0) {
        btnPlayNext.innerHTML = `
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          Play Episode 1
        `;
        btnPlayNext.onclick = () => this.app.player.loadEpisode(anime, anime.episodes[0]);
      }
    }

    // Open in folder button
    const btnOpenFolder = document.getElementById('btnDetailOpenFolder');
    btnOpenFolder.onclick = () => {
      window.api.showInFolder(anime.episodes[0]?.filePath || anime.folderPath);
    };

    // Extract All Zip button (if anime contains zip)
    let btnExtractZip = document.getElementById('btnDetailExtractZip');
    if (!btnExtractZip) {
      btnExtractZip = document.createElement('button');
      btnExtractZip.id = 'btnDetailExtractZip';
      btnExtractZip.className = 'btn-secondary';
      btnOpenFolder.parentNode.insertBefore(btnExtractZip, btnOpenFolder.nextSibling);
    }

    if (anime.hasZip) {
      btnExtractZip.style.display = 'inline-flex';
      btnExtractZip.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-1 8h-3v3h-2v-3h-3v-2h3V9h2v3h3v2z"/></svg>
        Extract All ZIP Episodes
      `;
      btnExtractZip.onclick = async () => {
        const zipEps = anime.episodes.filter(e => e.isZip && e.zipPath);
        if (zipEps.length === 0) return;
        const zipFile = zipEps[0].zipPath;
        this.app.ui.showToast('Extracting all episodes from archive...', 6000);
        btnExtractZip.disabled = true;
        const res = await window.api.extractZipAll(zipFile);
        btnExtractZip.disabled = false;
        if (res.success) {
          this.app.ui.showToast('All episodes extracted successfully!');
          // Rescan library to update paths
          this.app.scanLibrary(false);
        } else {
          this.app.ui.showToast(`Extraction failed: ${res.error}`);
        }
      };
    } else {
      btnExtractZip.style.display = 'none';
    }

    // Airing & Missing Episodes Banner
    const airingBanner = document.getElementById('detailAiringBanner');
    if (airingBanner) {
      airingBanner.innerHTML = '';
      if (meta.nextAiring) {
        const days = Math.max(0, Math.round(meta.nextAiring.timeUntilAiring / 86400));
        airingBanner.innerHTML += `
          <div class="airing-badge">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14h2v2h-2zm0-10h2v8h-2z"/></svg>
            Airing: Ep ${meta.nextAiring.episode} expected in ${days} days
          </div>
        `;
      }
      if (meta.totalEpisodes && anime.episodes.length > 0) {
        const localEpNums = new Set(anime.episodes.map(e => e.episodeNumber || e.episode).filter(Boolean));
        const missing = [];
        for (let i = 1; i <= meta.totalEpisodes; i++) {
          if (!localEpNums.has(i)) missing.push(i);
        }
        if (missing.length === 0) {
          airingBanner.innerHTML += `
            <div class="complete-badge">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              Complete Season (${anime.episodes.length}/${meta.totalEpisodes} Episodes)
            </div>
          `;
        } else if (localEpNums.size > 0) {
          const listStr = missing.slice(0, 4).join(', ') + (missing.length > 4 ? ` +${missing.length - 4} more` : '');
          airingBanner.innerHTML += `
            <div class="missing-ep-badge">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
              Missing ${missing.length} Episode(s) (Ep ${listStr})
            </div>
          `;
        }
      }
    }

    // Auto-enrich metadata if cached without idMal or characters
    if ((!meta.idMal || !meta.characters || meta.characters.length === 0) && !anime._enriching) {
      anime._enriching = true;
      const fetcher = meta.anilistId ? AnimeMetadata.fetchById(meta.anilistId) : AnimeMetadata.fetchMetadata(anime.title);
      fetcher.then(fresh => {
        anime._enriching = false;
        if (fresh) {
          anime.metadata = { ...meta, ...fresh };
          this.app.store.cachedMetadata[anime.title.toLowerCase()] = anime.metadata;
          window.api.saveStore(this.app.store);
          this.renderAnimeDetail(anime);
        }
      }).catch(() => { anime._enriching = false; });
    }

    // Watch Status Dropdown
    const statusSelect = document.getElementById('detailWatchStatus');
    if (statusSelect) {
      if (!this.app.store.animeWatchStatus) this.app.store.animeWatchStatus = {};
      statusSelect.value = this.app.store.animeWatchStatus[anime.id] || 'WATCHING';
      statusSelect.onchange = async (e) => {
        this.app.store.animeWatchStatus[anime.id] = e.target.value;
        await window.api.saveStore(this.app.store);
        this.app.ui.showToast(`Updated status to ${e.target.options[e.target.selectedIndex].text}`);
        this.app.applyFilters();
      };
    }

    // Batch Rename button
    const btnBatchRename = document.getElementById('btnDetailBatchRename');
    if (btnBatchRename) {
      btnBatchRename.onclick = () => {
        this.app.openBatchRenameModal(anime);
      };
    }

    // Characters & Seiyuu Showcase
    const castSection = document.getElementById('detailCharactersSection');
    const castCarousel = document.getElementById('detailCastCarousel');
    if (castSection && castCarousel) {
      if (meta.characters && meta.characters.length > 0) {
        castCarousel.innerHTML = meta.characters.map(c => `
          <div class="cast-card">
            <div class="cast-images-duo">
              <img class="cast-char-img" src="${c.image || 'https://via.placeholder.com/80'}" alt="${c.name}" onerror="this.style.opacity='0.2'" />
              ${c.voiceActor?.image ? `<img class="cast-seiyuu-img" src="${c.voiceActor.image}" alt="${c.voiceActor.name}" title="Seiyuu: ${c.voiceActor.name}" />` : ''}
            </div>
            <div class="cast-name" title="${c.name}">${c.name}</div>
            <div class="cast-seiyuu" title="Voice Actor: ${c.voiceActor?.name || 'N/A'}">${c.voiceActor?.name || 'Seiyuu N/A'}</div>
            <span class="cast-role-tag">${c.role}</span>
          </div>
        `).join('');
        castSection.style.display = 'block';
      } else {
        castSection.style.display = 'none';
      }
    }

    // Themes (Openings & Endings) Showcase
    const themesSection = document.getElementById('detailThemesSection');
    const themesGrid = document.getElementById('detailThemesGrid');
    if (themesSection && themesGrid) {
      if (meta.idMal) {
        AnimeMetadata.fetchThemeSongs(meta.idMal).then(themes => {
          if (themes && (themes.openings.length > 0 || themes.endings.length > 0)) {
            // Build full playlist for OST player
            const playlist = [
              ...themes.openings.map(t => ({ title: t, type: 'Opening Theme' })),
              ...themes.endings.map(t => ({ title: t, type: 'Ending Theme' }))
            ];

            themesGrid.innerHTML = `
              <div class="theme-card-box">
                <h4>Opening Themes</h4>
                <ul class="theme-list-items">
                  ${themes.openings.map((t, i) => `
                    <li>
                      <span>${t}</span>
                      <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
                        <button class="theme-ost-btn" data-playlist-idx="${i}" data-title="${encodeURIComponent(t)}" data-type="Opening Theme">▶ Play</button>
                        <a class="theme-yt-link" href="https://www.youtube.com/results?search_query=${encodeURIComponent(t)}" target="_blank">YT</a>
                      </div>
                    </li>
                  `).join('') || '<li>No openings listed</li>'}
                </ul>
              </div>
              <div class="theme-card-box">
                <h4>Ending Themes</h4>
                <ul class="theme-list-items">
                  ${themes.endings.map((t, i) => `
                    <li>
                      <span>${t}</span>
                      <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
                        <button class="theme-ost-btn" data-playlist-idx="${themes.openings.length + i}" data-title="${encodeURIComponent(t)}" data-type="Ending Theme">▶ Play</button>
                        <a class="theme-yt-link" href="https://www.youtube.com/results?search_query=${encodeURIComponent(t)}" target="_blank">YT</a>
                      </div>
                    </li>
                  `).join('') || '<li>No endings listed</li>'}
                </ul>
              </div>
            `;
            themesSection.style.display = 'block';

            // Wire up in-app play buttons
            themesGrid.querySelectorAll('.theme-ost-btn').forEach(btn => {
              btn.addEventListener('click', () => {
                const title = decodeURIComponent(btn.dataset.title);
                const type = btn.dataset.type;
                if (this.app.ostPlayer) {
                  this.app.ostPlayer.loadPlaylist(playlist, parseInt(btn.dataset.playlistIdx));
                }
              });
            });
          } else {
            themesSection.style.display = 'none';
          }
        });
      } else {
        themesSection.style.display = 'none';
      }
    }

    // Rematch button
    const btnRematch = document.getElementById('btnDetailRematch');
    if (btnRematch) {
      btnRematch.onclick = () => {
        this.app.openRematchModal(anime);
      };
    }

    // Manual Edit button
    const btnManualEdit = document.getElementById('btnDetailManualEdit');
    if (btnManualEdit) {
      btnManualEdit.onclick = () => {
        this.app.openManualMetaModal(anime);
      };
    }
  }

  createEpisodeRow(anime, episode, index) {
    const row = document.createElement('div');
    row.className = 'episode-row';

    const history = this.app.store.watchHistory[episode.filePath];
    let statusBadge = '';
    let progressLine = '';

    if (episode.isZip) {
      statusBadge += episode.isExtracted 
        ? `<span class="ep-badge zip-badge">Extracted ZIP</span>` 
        : `<span class="ep-badge zip-badge">📦 ZIP Archive</span>`;
    }

    if (history?.completed) {
      statusBadge += `<span class="ep-badge watched-badge">✓ Watched</span>`;
    } else if (history && history.progress > 15) {
      const pct = Math.round((history.progress / (history.duration || 1)) * 100);
      statusBadge += `<span class="ep-badge progress-badge">${pct}%</span>`;
      progressLine = `<div class="ep-progress-bar"><div class="ep-progress-fill" style="width:${pct}%;"></div></div>`;
    }

    const fileSizeFormatted = this.formatBytes(episode.size);

    row.innerHTML = `
      <div class="ep-num">${episode.episode || index + 1}</div>
      <div class="ep-details">
        <div class="ep-title-row">
          <span class="ep-title">${episode.displayTitle}</span>
          ${statusBadge}
        </div>
        <div class="ep-subtext">${episode.fileName} • ${fileSizeFormatted}</div>
        ${progressLine}
      </div>
      <div class="ep-actions">
        <button class="btn-ep-play" title="Play episode">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          Play
        </button>
      </div>
    `;

    row.querySelector('.btn-ep-play').addEventListener('click', (e) => {
      e.stopPropagation();
      this.app.player.loadEpisode(anime, episode);
    });

    row.addEventListener('click', () => {
      this.app.player.loadEpisode(anime, episode);
    });

    return row;
  }

  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}

window.AnimeUI = AnimeUI;
