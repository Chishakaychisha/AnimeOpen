/**
 * Scanner & Parser for local anime files and directories
 */

class AnimeScanner {
  // Regex patterns to strip release groups, resolutions, audio codecs, and common garbage
  static CLEAN_PATTERNS = [
    /\[[^\]]+\]/g,                     // [SubsPlease], [1080p], [ABCD1234]
    /\([^\)]+\)/g,                     // (1080p), (Dual Audio), (Hi10P)
    /\b(1080p|720p|480p|2160p|4k|uhd)\b/gi,
    /\b(x264|x265|hevc|h264|h265|avc|10bit|8bit)\b/gi,
    /\b(aac|flac|ac3|dts|mp3|eac3)\b/gi,
    /\b(web-dl|webrip|bluray|bdrip|dvdrip|hdtv)\b/gi,
    /\b(dual-audio|multi-audio|subbed|dubbed)\b/gi,
    /\b(v1|v2|v3|v4|v5|end|final)\b/gi,
    /[_.]/g                            // Replace underscores and dots with spaces
  ];

  /**
   * Cleans a filename or folder name to isolate the anime title
   */
  static cleanTitle(rawName) {
    let name = rawName;
    
    // Remove file extension if present
    name = name.replace(/\.(mp4|mkv|webm|avi|mov|m4v|ts)$/i, '');

    // Strip bracketed release tags first e.g. [SubsPlease], [HorribleSubs]
    name = name.replace(/^\[[^\]]+\]\s*/g, '');

    // Strip leading web/ripper tags like AnimePahe, AnimeKaizoku, etc.
    name = name.replace(/^(AnimePahe|AnimeKaizoku|SubsPlease|HorribleSubs|Erai-raws)[_ ]+/i, '');

    // Replace underscores and dots with spaces so episode matchers can work
    name = name.replace(/[_.]/g, ' ');

    // Cut off before episode indicators like " - 01", " S01E01", " E01", " Episode 1"
    const epMatch = name.search(/(\s*-\s*\d+|\s+S\d+E\d+|\s+E\d+|\s+Episode\s+\d+)/i);
    if (epMatch > 0) {
      name = name.substring(0, epMatch);
    }

    // Apply cleaner regexes
    for (const pattern of this.CLEAN_PATTERNS) {
      name = name.replace(pattern, ' ');
    }

    // Clean whitespace
    name = name.replace(/\s+/g, ' ').trim();
    return name;
  }

  /**
   * Parse episode and season number from filename
   */
  static parseEpisodeInfo(filename) {
    let season = 1;
    let episode = 1;
    let title = filename;

    // Remove extension
    const baseName = filename.replace(/\.(mp4|mkv|webm|avi|mov|m4v|ts)$/i, '');

    // Match leading episode number like "12_The_Master_Of_Ragnarok..." or "01 - Title"
    const leadMatch = baseName.match(/^(\d{1,4})[_\s.-]/);
    if (leadMatch) {
      episode = parseInt(leadMatch[1], 10);
      return { season: 1, episode, displayTitle: `Episode ${episode}` };
    }

    // Match S01E02 or s1e2
    const sMatch = baseName.match(/S(\d+)[\s._-]*E(\d+)/i);
    if (sMatch) {
      season = parseInt(sMatch[1], 10);
      episode = parseInt(sMatch[2], 10);
      return { season, episode, displayTitle: `Season ${season} - Episode ${episode}` };
    }

    // Match "Season 2 - 05" or "Season 2 Episode 5"
    const sNameMatch = baseName.match(/Season\s*(\d+)[\s._-]*(?:Episode|EP|E)?\s*(\d+)/i);
    if (sNameMatch) {
      season = parseInt(sNameMatch[1], 10);
      episode = parseInt(sNameMatch[2], 10);
      return { season, episode, displayTitle: `Season ${season} - Episode ${episode}` };
    }

    // Match " - 01" or " - 12v2"
    const dashMatch = baseName.match(/(?:^|\s)-\s*(\d{1,4})(?:v\d)?(?:\s|$)/i);
    if (dashMatch) {
      episode = parseInt(dashMatch[1], 10);
      return { season: 1, episode, displayTitle: `Episode ${episode}` };
    }

    // Match "Episode 05" or "EP 05" or "E05"
    const epMatch = baseName.match(/\b(?:Episode|EP|E)[\s._-]*(\d{1,4})\b/i);
    if (epMatch) {
      episode = parseInt(epMatch[1], 10);
      return { season: 1, episode, displayTitle: `Episode ${episode}` };
    }

    // Match "#05"
    const hashMatch = baseName.match(/#(\d{1,4})/);
    if (hashMatch) {
      episode = parseInt(hashMatch[1], 10);
      return { season: 1, episode, displayTitle: `Episode ${episode}` };
    }

    // Standalone number in filename after stripping tags and converting underscores to spaces
    const cleanForNum = baseName.replace(/\[[^\]]+\]/g, '').replace(/[_\s.-]+/g, ' ').trim();
    const standaloneNum = cleanForNum.match(/\b(\d{1,3})\b/);
    if (standaloneNum) {
      episode = parseInt(standaloneNum[1], 10);
      return { season: 1, episode, displayTitle: `Episode ${episode}` };
    }

    return { season, episode, displayTitle: baseName };
  }

  static pathBaseNameNoExt(fullPath) {
    if (!fullPath) return '';
    const clean = fullPath.replace(/\\/g, '/');
    const base = clean.substring(clean.lastIndexOf('/') + 1);
    return base.replace(/\.[^/.]+$/, '');
  }

  /**
   * Group scanned file items into structured Anime series
   */
  static processScannedFiles(files, libraryFolder) {
    const seriesMap = new Map();

    for (const file of files) {
      // Determine anime folder or root grouping
      const normalizedPath = file.fullPath.replace(/\\/g, '/');
      const normalizedLib = libraryFolder.replace(/\\/g, '/').replace(/\/$/, '');
      const relPath = normalizedPath.replace(normalizedLib + '/', '');
      const parts = relPath.split('/');

      let rawAnimeName = '';
      if (file.isZip && parts.length === 1) {
        // Zip file directly in library folder e.g. "D:/Anime/Death_Note_Batch.zip"
        rawAnimeName = AnimeScanner.pathBaseNameNoExt(file.zipPath);
      } else if (parts.length > 1) {
        // First folder under the library is usually the anime folder
        rawAnimeName = parts[0];
      } else {
        // Flat file inside library folder - derive from filename
        rawAnimeName = file.name;
      }

      const cleanTitle = this.cleanTitle(rawAnimeName);
      const groupKey = cleanTitle.toLowerCase();

      if (!seriesMap.has(groupKey)) {
        seriesMap.set(groupKey, {
          id: 'anime_' + Math.abs(this.hashCode(cleanTitle)),
          rawTitle: rawAnimeName,
          title: cleanTitle,
          folderPath: parts.length > 1 ? `${normalizedLib}/${parts[0]}` : (file.isZip ? file.zipPath : file.fullPath),
          episodes: [],
          totalEpisodes: 0,
          totalSize: 0,
          lastModified: file.mtime,
          hasZip: false
        });
      }

      const anime = seriesMap.get(groupKey);
      const epInfo = this.parseEpisodeInfo(file.name);

      if (file.isZip) anime.hasZip = true;

      anime.episodes.push({
        id: 'ep_' + Math.abs(this.hashCode(file.isZip ? file.zipPath + '#' + file.entryName : file.fullPath)),
        fileName: file.name,
        filePath: file.fullPath,
        size: file.size,
        mtime: file.mtime,
        season: epInfo.season,
        episode: epInfo.episode,
        episodeNumber: epInfo.episode,
        displayTitle: epInfo.displayTitle,
        isZip: !!file.isZip,
        zipPath: file.zipPath || null,
        entryName: file.entryName || null,
        isExtracted: !!file.isExtracted,
        extractedPath: file.extractedPath || null
      });

      anime.totalSize += file.size;
      if (file.mtime > anime.lastModified) {
        anime.lastModified = file.mtime;
      }
    }

    // Sort episodes for each anime (by season, then episode)
    const animeList = Array.from(seriesMap.values());
    for (const anime of animeList) {
      anime.episodes.sort((a, b) => {
        if (a.season !== b.season) return a.season - b.season;
        return a.episode - b.episode;
      });
      anime.totalEpisodes = anime.episodes.length;
    }

    // Sort anime by recently modified / updated
    animeList.sort((a, b) => b.lastModified - a.lastModified);

    return animeList;
  }

  static hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }
}

window.AnimeScanner = AnimeScanner;
