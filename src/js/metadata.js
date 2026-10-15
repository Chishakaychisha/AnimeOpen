/**
 * Metadata fetcher using AniList GraphQL API, AniSkip API, and Jikan Theme Songs
 */

class AnimeMetadata {
  static ANILIST_URL = 'https://graphql.anilist.co';
  static ANISKIP_URL = 'https://api.aniskip.com/v2/skip-times';

  /**
   * Search AniList for single best match
   */
  static async fetchMetadata(title) {
    const query = `
      query ($search: String) {
        Media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
          id
          idMal
          title {
            romaji
            english
            native
          }
          coverImage {
            extraLarge
            large
            medium
            color
          }
          bannerImage
          description(asHtml: false)
          episodes
          duration
          genres
          averageScore
          meanScore
          popularity
          seasonYear
          format
          status
          studios(isMain: true) {
            nodes {
              name
            }
          }
          nextAiringEpisode {
            episode
            airingAt
            timeUntilAiring
          }
          characters(page: 1, perPage: 10, sort: ROLE) {
            edges {
              role
              node {
                name {
                  full
                }
                image {
                  medium
                }
              }
              voiceActors(language: JAPANESE) {
                name {
                  full
                }
                image {
                  medium
                }
              }
            }
          }
        }
      }
    `;

    try {
      const response = await fetch(this.ANILIST_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          query: query,
          variables: { search: title }
        })
      });

      if (!response.ok) {
        console.warn(`AniList responded with status ${response.status} for "${title}"`);
        return null;
      }

      const data = await response.json();
      if (data?.data?.Media) {
        return this.formatMediaData(data.data.Media);
      }
      return null;
    } catch (err) {
      console.warn(`Error fetching metadata for "${title}":`, err);
      return null;
    }
  }

  /**
   * Search AniList with multiple options (for manual rematching)
   */
  static async searchMultiple(title) {
    const query = `
      query ($search: String) {
        Page(page: 1, perPage: 8) {
          media(search: $search, type: ANIME) {
            id
            idMal
            title {
              romaji
              english
              native
            }
            coverImage {
              large
              color
            }
            bannerImage
            description(asHtml: false)
            episodes
            seasonYear
            format
            averageScore
            genres
            status
          }
        }
      }
    `;

    try {
      const response = await fetch(this.ANILIST_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          query: query,
          variables: { search: title }
        })
      });

      if (!response.ok) return [];

      const data = await response.json();
      const mediaList = data?.data?.Page?.media || [];
      return mediaList.map(m => this.formatMediaData(m));
    } catch (err) {
      console.error('Error searching multiple anime:', err);
      return [];
    }
  }

  /**
   * Fetch by exact AniList ID
   */
  static async fetchById(id) {
    const query = `
      query ($id: Int) {
        Media(id: $id, type: ANIME) {
          id
          idMal
          title {
            romaji
            english
            native
          }
          coverImage {
            extraLarge
            large
            medium
            color
          }
          bannerImage
          description(asHtml: false)
          episodes
          duration
          genres
          averageScore
          meanScore
          seasonYear
          format
          status
          studios(isMain: true) {
            nodes {
              name
            }
          }
          nextAiringEpisode {
            episode
            airingAt
            timeUntilAiring
          }
          characters(page: 1, perPage: 10, sort: ROLE) {
            edges {
              role
              node {
                name {
                  full
                }
                image {
                  medium
                }
              }
              voiceActors(language: JAPANESE) {
                name {
                  full
                }
                image {
                  medium
                }
              }
            }
          }
        }
      }
    `;

    try {
      const response = await fetch(this.ANILIST_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          query: query,
          variables: { id: parseInt(id, 10) }
        })
      });

      if (!response.ok) return null;
      const data = await response.json();
      if (data?.data?.Media) {
        return this.formatMediaData(data.data.Media);
      }
      return null;
    } catch (err) {
      console.error('Error fetching anime by id:', err);
      return null;
    }
  }

  /**
   * Fetch Opening & Ending skip timestamps from AniSkip API
   */
  static async fetchSkipTimes(idMal, episodeNumber, duration = 0) {
    if (!idMal || !episodeNumber) return null;
    const durParam = duration > 0 ? `&episodeLength=${Math.floor(duration)}` : '';
    const url = `${this.ANISKIP_URL}/${idMal}/${episodeNumber}?types[]=op&types[]=ed&types[]=mixed-op&types[]=mixed-ed${durParam}`;

    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const data = await response.json();
      if (data && data.found && Array.isArray(data.results)) {
        const op = data.results.find(r => r.skipType === 'op' || r.skipType === 'mixed-op');
        const ed = data.results.find(r => r.skipType === 'ed' || r.skipType === 'mixed-ed');
        return {
          op: op ? { start: op.interval.startTime, end: op.interval.endTime } : null,
          ed: ed ? { start: ed.interval.startTime, end: ed.interval.endTime } : null
        };
      }
      return null;
    } catch (err) {
      console.warn('AniSkip lookup failed (non-critical):', err.message);
      return null;
    }
  }

  /**
   * Fetch Anime Theme Songs (OP & ED) using Jikan (MyAnimeList) API
   */
  static async fetchThemeSongs(idMal) {
    if (!idMal) return null;
    try {
      const response = await fetch(`https://api.jikan.moe/v4/anime/${idMal}/themes`);
      if (!response.ok) return null;
      const json = await response.json();
      if (json && json.data) {
        return {
          openings: json.data.openings || [],
          endings: json.data.endings || []
        };
      }
      return null;
    } catch (err) {
      console.warn('Failed to fetch themes from Jikan:', err.message);
      return null;
    }
  }

  static formatMediaData(media) {
    const mainTitle = media.title?.english || media.title?.romaji || media.title?.native || 'Unknown Anime';
    const subTitle = media.title?.romaji !== mainTitle ? media.title?.romaji : media.title?.native;
    
    // Clean description html tags if any remain
    let cleanDesc = (media.description || 'No synopsis available.').replace(/<[^>]*>?/gm, '');

    // Format Characters & Seiyuu
    const characters = (media.characters?.edges || []).map(edge => ({
      name: edge.node?.name?.full || 'Unknown Character',
      image: edge.node?.image?.medium || '',
      role: edge.role || 'MAIN',
      voiceActor: edge.voiceActors?.[0] ? {
        name: edge.voiceActors[0].name?.full || 'Unknown Seiyuu',
        image: edge.voiceActors[0].image?.medium || ''
      } : null
    }));

    // Airing status
    let nextAiring = null;
    if (media.nextAiringEpisode) {
      nextAiring = {
        episode: media.nextAiringEpisode.episode,
        airingAt: media.nextAiringEpisode.airingAt,
        timeUntilAiring: media.nextAiringEpisode.timeUntilAiring
      };
    }

    return {
      anilistId: media.id,
      idMal: media.idMal || null,
      title: mainTitle,
      romajiTitle: subTitle || '',
      nativeTitle: media.title?.native || '',
      cover: media.coverImage?.extraLarge || media.coverImage?.large || '',
      banner: media.bannerImage || media.coverImage?.extraLarge || '',
      dominantColor: media.coverImage?.color || '#ff3366',
      description: cleanDesc,
      totalEpisodes: media.episodes,
      duration: media.duration ? `${media.duration}m` : null,
      score: media.averageScore ? (media.averageScore / 10).toFixed(1) : null,
      year: media.seasonYear,
      genres: media.genres || [],
      format: media.format || 'TV',
      status: media.status ? media.status.replace(/_/g, ' ') : 'FINISHED',
      studio: media.studios?.nodes?.[0]?.name || '',
      characters: characters,
      nextAiring: nextAiring
    };
  }

  /**
   * Generates a sleek CSS gradient fallback poster if offline
   */
  static getFallbackPoster(title) {
    const colors = [
      ['#ff416c', '#8a2387'],
      ['#4776e6', '#8e54e9'],
      ['#00b09b', '#96c93d'],
      ['#f12711', '#f5af19'],
      ['#833ab4', '#fd1d1d'],
      ['#11998e', '#38ef7d']
    ];
    let hash = 0;
    for (let i = 0; i < title.length; i++) {
      hash = title.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % colors.length;
    return {
      gradient: `linear-gradient(135deg, ${colors[idx][0]}, ${colors[idx][1]})`,
      initials: title.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'A'
    };
  }
}

window.AnimeMetadata = AnimeMetadata;
