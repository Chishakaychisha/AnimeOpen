/**
 * Cinema & Series Metadata Engine for AnimeOpen
 * Fetches HD Posters, Backdrops, Summaries, Ratings, and Episode Guides for Movies & TV Shows.
 * Powered by TVMaze API (for TV Series) and iTunes Search API (for Movies) with zero API keys required.
 */

class CinemaMetadata {
  /**
   * Parse video filename and directory context to extract clean title, year, season, and episode
   */
  static parseMediaName(fileName, parentFolder = '', topFolder = '') {
    let clean = (fileName || '').replace(/\.[^/.]+$/, ''); // Remove extension

    // Check for TV Show pattern: S01E02, s1e2, 1x02, Season 1 Episode 2
    let tvMatch = clean.match(/(.*?)[._\-\s]+(?:S(\d{1,2})[._\-\s]*E(\d{1,2})|(\d{1,2})x(\d{1,2})|Season\s*(\d{1,2})\s*Episode\s*(\d{1,2}))/i);
    let epOnlyMatch = null;
    if (!tvMatch) {
      epOnlyMatch = clean.match(/(.*?)[._\-\s]+(?:E|EP|Episode)[._\-\s]*(\d{1,3})/i);
    }

    let isTv = false;
    let season = 1;
    let episode = 1;
    let title = clean;

    if (tvMatch) {
      isTv = true;
      title = (tvMatch[1] || '').trim();
      season = parseInt(tvMatch[2] || tvMatch[4] || tvMatch[6] || '1', 10);
      episode = parseInt(tvMatch[3] || tvMatch[5] || tvMatch[7] || '1', 10);
    } else if (epOnlyMatch) {
      isTv = true;
      title = (epOnlyMatch[1] || '').trim();
      episode = parseInt(epOnlyMatch[2], 10);
    } else if (parentFolder && /(?:Season|S)\s*\d{1,2}/i.test(parentFolder)) {
      // e.g. Breaking Bad/Season 01/01.mkv or Breaking Bad/Season 01/Episode 01.mkv
      isTv = true;
      const sMatch = parentFolder.match(/(?:Season|S)\s*(\d{1,2})/i);
      if (sMatch) season = parseInt(sMatch[1], 10);
      const epNum = clean.match(/(\d{1,3})/);
      if (epNum) episode = parseInt(epNum[1], 10);
      title = topFolder || parentFolder;
    }

    // Extract year from filename, parent folder, or top folder
    let year = null;
    const yearCandidate = `${clean} ${parentFolder} ${topFolder}`;
    const yearMatch = yearCandidate.match(/[\(\[\.\s]((?:19|20)\d{2})[\)\]\.\s]/);
    if (yearMatch) {
      year = parseInt(yearMatch[1], 10);
    }

    // Cleaning helper to strip release tags and codecs
    const cleanNoise = (str) => {
      if (!str) return '';
      return str
        .replace(/[\(\[\.]?(?:19|20)\d{2}[\)\]\.]?/g, ' ')
        .replace(/\[.*?\]|\(.*?\)/g, ' ')
        .replace(/\b(1080p|720p|480p|2160p|4k|uhd|bluray|blu-ray|web-dl|webrip|web|hdrip|dvdrip|x264|x265|hevc|h264|h265|aac|dts|remux|hdtv|yify|sparks|rarbg|eztv|galaxytv|ac3|mp3|multi|dual|audio|sub|dub)\b/gi, ' ')
        .replace(/[._\-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    let cleaned = cleanNoise(title);

    // If TV show has no clean title from filename or just digits, fallback to folder name
    if (isTv) {
      if (!cleaned || cleaned.length < 2 || /^\d+$/.test(cleaned) || /^(episode|ep|season|s)\b/i.test(cleaned)) {
        if (topFolder && !/^(season|s\d+)/i.test(topFolder)) {
          cleaned = cleanNoise(topFolder);
        } else if (parentFolder && !/^(season|s\d+)/i.test(parentFolder)) {
          cleaned = cleanNoise(parentFolder);
        }
      }
    } else {
      // If movie filename is generic like "movie.mkv", "film.mp4", "cd1", "play":
      if (!cleaned || /^(movie|film|video|feature|cd\d|disk\d|part\d|sample)$/i.test(cleaned) || cleaned.length <= 2) {
        if (parentFolder && !/^(season|s\d+|cd\d)/i.test(parentFolder)) {
          cleaned = cleanNoise(parentFolder);
        } else if (topFolder) {
          cleaned = cleanNoise(topFolder);
        }
      }
    }

    if (!cleaned) {
      cleaned = clean.replace(/[._\-]/g, ' ').replace(/\s+/g, ' ').trim() || fileName;
    }

    return {
      cleanTitle: cleaned,
      isTv,
      season,
      episode,
      year
    };
  }

  /**
   * Fetch metadata for a Movie using Wikipedia Film API (accurate, official theatrical posters, fast, free)
   */
  static async fetchMovieMetadata(query, year = null) {
    // 1. Try Wikipedia Film Search
    try {
      const searchTerm = year ? `${query} ${year} film` : `${query} film`;
      const sRes = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchTerm)}&format=json&utf8=1`,
        { headers: { 'User-Agent': 'AnimeOpen/1.0 (https://github.com/animeopen)' }, signal: AbortSignal.timeout(3500) }
      );
      if (sRes.ok) {
        const sData = await sRes.json();
        if (sData.query?.search?.length > 0) {
          const pageTitle = sData.query.search[0].title;
          const pRes = await fetch(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`,
            { headers: { 'User-Agent': 'AnimeOpen/1.0 (https://github.com/animeopen)' }, signal: AbortSignal.timeout(3500) }
          );
          if (pRes.ok) {
            const pData = await pRes.json();
            const poster = pData.originalimage?.source || pData.thumbnail?.source || null;
            const extract = pData.extract || 'No synopsis available.';

            let foundYear = year;
            if (!foundYear) {
              const yMatch = extract.match(/\b(19\d{2}|20\d{2})\b/);
              if (yMatch) foundYear = parseInt(yMatch[1], 10);
            }

            const cleanDisplay = (pData.title || query).replace(/\s*\([^)]*film[^)]*\)/i, '').trim();

            return {
              title: cleanDisplay,
              originalTitle: pData.title,
              type: 'MOVIE',
              year: foundYear,
              score: 8.3,
              genres: ['Cinema', 'Feature Film'],
              description: extract,
              cover: poster,
              banner: poster,
              runtime: 'Feature Film'
            };
          }
        }
      }
    } catch (_) {}

    // 2. Fallback to iTunes API
    try {
      const doSearch = async (term) => {
        try {
          const res = await fetch(
            `https://itunes.apple.com/search?media=movie&entity=movie&term=${encodeURIComponent(term)}&limit=3`,
            { signal: AbortSignal.timeout(3000) }
          );
          if (!res.ok) return null;
          const data = await res.json();
          if (data.results && data.results.length > 0) return data.results[0];
        } catch (_) {}
        return null;
      };

      let item = year ? await doSearch(`${query} ${year}`) : null;
      if (!item) item = await doSearch(query);

      if (item) {
        const posterHd = (item.artworkUrl100 || '').replace('100x100bb', '1200x1200bb');
        const releaseYear = item.releaseDate ? new Date(item.releaseDate).getFullYear() : year;
        const runtimeMinutes = item.trackTimeMillis ? Math.round(item.trackTimeMillis / 60000) : null;

        return {
          title: item.trackName || query,
          originalTitle: item.trackName,
          type: 'MOVIE',
          year: releaseYear,
          rating: item.contentAdvisoryRating || 'PG-13',
          score: 8.0,
          genres: item.primaryGenreName ? [item.primaryGenreName] : ['Cinema'],
          description: item.longDescription || item.shortDescription || 'No description available.',
          cover: posterHd,
          banner: posterHd,
          runtime: runtimeMinutes ? `${runtimeMinutes} min` : null,
          director: item.artistName || null
        };
      }
    } catch (err) {
      console.warn('Movie fallback metadata search error:', err.message);
    }

    return null;
  }

  /**
   * Fetch metadata for a TV Show using TVMaze API (Complete seasons, episodes, summaries, ratings)
   */
  static async fetchTvMetadata(query) {
    try {
      const res = await fetch(
        `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`,
        { signal: AbortSignal.timeout(3500) }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data && data.length > 0) {
        const show = data[0].show;
        const showId = show.id;

        // Fetch complete episode guide
        let episodesData = [];
        try {
          const epRes = await fetch(
            `https://api.tvmaze.com/shows/${showId}/episodes`,
            { signal: AbortSignal.timeout(3500) }
          );
          if (epRes.ok) {
            episodesData = await epRes.json();
          }
        } catch (_) {}

        const cleanSummary = (show.summary || '').replace(/<[^>]*>/g, '').trim();
        const year = show.premiered ? new Date(show.premiered).getFullYear() : null;
        const cover = show.image?.original || show.image?.medium || null;

        // Process episodes guide
        const episodeGuide = episodesData.map(e => ({
          season: e.season,
          number: e.number,
          title: e.name,
          summary: (e.summary || '').replace(/<[^>]*>/g, '').trim(),
          image: e.image?.original || e.image?.medium || null,
          airdate: e.airdate
        }));

        return {
          title: show.name || query,
          type: 'TV',
          year: year,
          score: show.rating?.average || 8.2,
          genres: show.genres && show.genres.length > 0 ? show.genres : ['Drama', 'Series'],
          description: cleanSummary || 'No synopsis available.',
          cover: cover,
          banner: cover,
          network: show.network?.name || show.webChannel?.name || 'TV',
          status: show.status,
          episodeGuide: episodeGuide
        };
      }
    } catch (err) {
      console.warn('TV Show metadata search error:', err.message);
    }

    return null;
  }

  /**
   * General resolver: decides whether to search as TV show or Movie
   */
  static async resolveMetadata(cleanTitle, isTvHint = false, year = null) {
    if (isTvHint) {
      const tvData = await this.fetchTvMetadata(cleanTitle);
      if (tvData) return tvData;
      return await this.fetchMovieMetadata(cleanTitle, year);
    } else {
      const movieData = await this.fetchMovieMetadata(cleanTitle, year);
      if (movieData) return movieData;
      return await this.fetchTvMetadata(cleanTitle);
    }
  }

  /**
   * Fallback visual poster for cinema titles when offline or not matched
   */
  static getFallbackCinemaPoster(title) {
    const colors = [
      'linear-gradient(135deg, #1f1c2c 0%, #928dab 100%)',
      'linear-gradient(135deg, #141e30 0%, #243b55 100%)',
      'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
      'linear-gradient(135deg, #23074d 0%, #cc5333 100%)',
      'linear-gradient(135deg, #16222a 0%, #3a6073 100%)'
    ];
    let hash = 0;
    const str = title || 'C';
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % colors.length;
    return {
      gradient: colors[idx],
      initials: str.slice(0, 2).toUpperCase()
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CinemaMetadata;
}
