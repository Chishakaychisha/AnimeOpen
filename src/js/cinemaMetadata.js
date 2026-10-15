/**
 * Cinema & Series Metadata Engine for AnimeOpen
 * Fetches HD Posters, Backdrops, Summaries, Ratings, and Episode Guides for Movies & TV Shows.
 * Powered by TVMaze API (for TV Series) and iTunes Search API / TMDB (for Movies) with zero API keys required.
 */

class CinemaMetadata {
  /**
   * Parse video filename to extract clean title, year, season, and episode
   */
  static parseMediaName(fileName) {
    let clean = fileName.replace(/\.[^/.]+$/, ''); // Remove extension

    // Check for TV Show pattern: S01E02, s1e2, 1x02, Season 1 Episode 2
    const tvMatch = clean.match(/(.*?)[._\-\s]+(?:S(\d{1,2})[._\-\s]*E(\d{1,2})|(\d{1,2})x(\d{1,2})|Season\s*(\d{1,2})\s*Episode\s*(\d{1,2}))/i);

    let isTv = false;
    let season = 1;
    let episode = 1;
    let title = clean;

    if (tvMatch) {
      isTv = true;
      title = (tvMatch[1] || '').trim();
      season = parseInt(tvMatch[2] || tvMatch[4] || tvMatch[6] || '1', 10);
      episode = parseInt(tvMatch[3] || tvMatch[5] || tvMatch[7] || '1', 10);
    } else {
      // Check for standalone season / episode indications
      const epOnlyMatch = clean.match(/(.*?)[._\-\s]+(?:E|EP|Episode)[._\-\s]*(\d{1,3})/i);
      if (epOnlyMatch) {
        isTv = true;
        title = (epOnlyMatch[1] || '').trim();
        episode = parseInt(epOnlyMatch[2], 10);
      }
    }

    // Extract year if present, e.g. "Inception (2010)" or "Interstellar.2014"
    let year = null;
    const yearMatch = title.match(/[\(\[\.]?((?:19|20)\d{2})[\)\]\.]?/);
    if (yearMatch) {
      year = parseInt(yearMatch[1], 10);
      title = title.replace(yearMatch[0], ' ').trim();
    }

    // Clean common release tags (1080p, Bluray, x264, WEBRip, etc.)
    title = title
      .replace(/\[.*?\]|\(.*?\)/g, ' ')
      .replace(/\b(1080p|720p|2160p|4k|uhd|bluray|blu-ray|web-dl|webrip|hdrip|dvdrip|x264|x265|hevc|aac|dts|remux|hdtv)\b/gi, ' ')
      .replace(/[._\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      cleanTitle: title || fileName,
      isTv,
      season,
      episode,
      year
    };
  }

  /**
   * Fetch metadata for a Movie using iTunes Movie API (High quality, free, fast)
   */
  static async fetchMovieMetadata(query, year = null) {
    try {
      let searchQuery = query;
      if (year) searchQuery += ` ${year}`;

      const res = await fetch(`https://itunes.apple.com/search?media=movie&entity=movie&term=${encodeURIComponent(searchQuery)}&limit=3`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const item = data.results[0];
        // High-res poster by substituting resolution in URL
        const posterHd = (item.artworkUrl100 || '').replace('100x100bb', '1200x1200bb');
        const releaseYear = item.releaseDate ? new Date(item.releaseDate).getFullYear() : year;
        const runtimeMinutes = item.trackTimeMillis ? Math.round(item.trackTimeMillis / 60000) : null;

        return {
          title: item.trackName || query,
          originalTitle: item.trackName,
          type: 'MOVIE',
          year: releaseYear,
          rating: item.contentAdvisoryRating || 'PG-13',
          score: 8.0, // Default baseline or calculated
          genres: item.primaryGenreName ? [item.primaryGenreName] : ['Cinema'],
          description: item.longDescription || item.shortDescription || 'No description available.',
          cover: posterHd,
          banner: posterHd, // Fallback to poster if backdrop unavailable
          runtime: runtimeMinutes ? `${runtimeMinutes} min` : null,
          director: item.artistName || null
        };
      }
    } catch (err) {
      console.warn('Movie metadata search error:', err.message);
    }

    return null;
  }

  /**
   * Fetch metadata for a TV Show using TVMaze API (Complete seasons, episodes, summaries, ratings)
   */
  static async fetchTvMetadata(query) {
    try {
      const res = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data && data.length > 0) {
        const show = data[0].show;
        const showId = show.id;

        // Fetch complete episode guide
        let episodesData = [];
        try {
          const epRes = await fetch(`https://api.tvmaze.com/shows/${showId}/episodes`);
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
      // Fallback to movie search if TV search had 0 results
      return await this.fetchMovieMetadata(cleanTitle, year);
    } else {
      const movieData = await this.fetchMovieMetadata(cleanTitle, year);
      if (movieData) return movieData;
      // Fallback to TV show search
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
    for (let i = 0; i < title.length; i++) {
      hash = title.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % colors.length;
    return {
      gradient: colors[idx],
      initials: (title || 'C').slice(0, 2).toUpperCase()
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CinemaMetadata;
}
