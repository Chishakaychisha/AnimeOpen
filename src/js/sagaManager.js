/**
 * Saga & Franchise Manager for AnimeOpen & CinemaOpen
 * Automatically groups movies, shows, and anime into interconnected cinematic universes & sagas.
 */

class SagaManager {
  static FRANCHISE_DEFINITIONS = [
    // ─── CINEMA FRANCHISES ───
    {
      id: 'saga_mcu',
      name: 'Marvel Cinematic Universe',
      type: 'cinema',
      backdropGradient: 'linear-gradient(135deg, #e62429 0%, #1a0005 100%)',
      badge: '🛡️ Marvel Studios',
      description: 'The complete epic multi-phase Marvel superhero universe.',
      patterns: [
        /iron\s*man/i, /captain\s*america/i, /thor/i, /avengers/i, /guardians\s*of\s*the\s*galaxy/i,
        /ant[\s-]man/i, /black\s*panther/i, /doctor\s*strange/i, /spider[\s-]man.*(?:homecoming|far\s*from\s*home|no\s*way\s*home)/i,
        /captain\s*marvel/i, /black\s*widow/i, /shang[\s-]chi/i, /eternals/i, /loki/i, /wandavision/i, /hawkeye/i, /moon\s*knight/i
      ]
    },
    {
      id: 'saga_batman',
      name: 'The Dark Knight & Batman Saga',
      type: 'cinema',
      backdropGradient: 'linear-gradient(135deg, #1f2937 0%, #000000 100%)',
      badge: '🦇 Gotham Universe',
      description: 'The legendary Gotham saga from Christopher Nolan to modern interpretations.',
      patterns: [/batman/i, /dark\s*knight/i, /joker/i]
    },
    {
      id: 'saga_potter',
      name: 'Harry Potter & Wizarding World',
      type: 'cinema',
      backdropGradient: 'linear-gradient(135deg, #740001 0%, #0d0c14 100%)',
      badge: '⚡ Wizarding World',
      description: 'The journey through Hogwarts and the magical universe.',
      patterns: [/harry\s*potter/i, /fantastic\s*beasts/i, /sorcerer'?s\s*stone/i, /chamber\s*of\s*secrets/i, /prisoner\s*of\s*azkaban/i, /goblet\s*of\s*fire/i, /order\s*of\s*the\s*phoenix/i, /half[\s-]blood\s*prince/i, /deathly\s*hallows/i]
    },
    {
      id: 'saga_lotr',
      name: 'Middle-earth: The Lord of the Rings',
      type: 'cinema',
      backdropGradient: 'linear-gradient(135deg, #1b3d2f 0%, #080f0c 100%)',
      badge: '💍 Tolkien Legendarium',
      description: 'The quest for the One Ring through Middle-earth.',
      patterns: [/lord\s*of\s*the\s*rings/i, /fellowship\s*of\s*the\s*ring/i, /two\s*towers/i, /return\s*of\s*the\s*king/i, /the\s*hobbit/i, /rings\s*of\s*power/i]
    },
    {
      id: 'saga_starwars',
      name: 'Star Wars: The Skywalker Saga',
      type: 'cinema',
      backdropGradient: 'linear-gradient(135deg, #004b91 0%, #050b14 100%)',
      badge: '⚔️ A Long Time Ago...',
      description: 'The legendary conflict between the Jedi and the Sith across the galaxy.',
      patterns: [/star\s*wars/i, /the\s*mandalorian/i, /obi[\s-]wan/i, /andor/i, /the\s*clone\s*wars/i, /bad\s*batch/i, /rogue\s*one/i]
    },
    {
      id: 'saga_wick',
      name: 'John Wick: High Table Universe',
      type: 'cinema',
      backdropGradient: 'linear-gradient(135deg, #a11f23 0%, #110304 100%)',
      badge: '🔫 Continental',
      description: 'The Continental, Baba Yaga, and the brutal High Table.',
      patterns: [/john\s*wick/i, /the\s*continental/i, /ballerina/i]
    },
    {
      id: 'saga_fast',
      name: 'Fast & Furious Saga',
      type: 'cinema',
      backdropGradient: 'linear-gradient(135deg, #e67e22 0%, #1a0f05 100%)',
      badge: '🏎️ Family & Speed',
      description: 'High-octane heists, speed, and family.',
      patterns: [/fast\s*(&|and|\+)?\s*(the\s*)?furious/i, /2\s*fast\s*2\s*furious/i, /tokyo\s*drift/i, /fast\s*five/i, /furious\s*7/i, /hobbs\s*(&|and)?\s*shaw/i, /fast\s*x/i]
    },

    // ─── ANIME FRANCHISES ───
    {
      id: 'saga_dragonball',
      name: 'Dragon Ball Saga',
      type: 'anime',
      backdropGradient: 'linear-gradient(135deg, #ff8c00 0%, #200d00 100%)',
      badge: '🐉 Saiyan Universe',
      description: 'From Goku’s childhood to Dragon Ball Z, GT, and Super Gods.',
      patterns: [/dragon\s*ball/i, /dragon\s*ball\s*z/i, /dragon\s*ball\s*gt/i, /dragon\s*ball\s*super/i, /broly/i, /super\s*hero/i]
    },
    {
      id: 'saga_naruto',
      name: 'Naruto & Boruto Shinobi World',
      type: 'anime',
      backdropGradient: 'linear-gradient(135deg, #ff5722 0%, #1e0902 100%)',
      badge: '🍃 Hidden Leaf',
      description: 'The shinobi journey of Naruto Uzumaki, Shippuden, and the Next Generations.',
      patterns: [/naruto/i, /shippuuden/i, /boruto/i]
    },
    {
      id: 'saga_fate',
      name: 'Fate / Type-Moon Universe',
      type: 'anime',
      backdropGradient: 'linear-gradient(135deg, #3f51b5 0%, #080b18 100%)',
      badge: '🗡️ Holy Grail War',
      description: 'The Masters, Servants, and the war for the omnipotent Holy Grail.',
      patterns: [/fate[\s\/]+(stay\s*night|zero|unlimited\s*blade\s*works|heaven'?s\s*feel|apocrypha|grand\s*order)/i]
    },
    {
      id: 'saga_aot',
      name: 'Attack on Titan Saga',
      type: 'anime',
      backdropGradient: 'linear-gradient(135deg, #4e342e 0%, #100a08 100%)',
      badge: '⚔️ Scout Regiment',
      description: 'Humanity’s desperate battle for survival against the Titans.',
      patterns: [/attack\s*on\s*titan/i, /shingeki\s*no\s*kyojin/i]
    },
    {
      id: 'saga_demonslayer',
      name: 'Demon Slayer: Kimetsu no Yaiba',
      type: 'anime',
      backdropGradient: 'linear-gradient(135deg, #009688 0%, #021210 100%)',
      badge: '🌊 Nichirin Blade',
      description: 'Tanjiro and the Demon Slayer Corps against Muzan Kibutsuji.',
      patterns: [/demon\s*slayer/i, /kimetsu\s*no\s*yaiba/i, /mugen\s*train/i, /swordsmith\s*village/i, /hashira\s*training/i]
    }
  ];

  /**
   * Scan items in library and group into sagas
   */
  static detectSagas(items = [], mode = 'anime') {
    if (!Array.isArray(items) || items.length === 0) return [];

    const sagas = [];

    for (const def of this.FRANCHISE_DEFINITIONS) {
      if (def.type !== mode && mode !== 'all') continue;

      const matchingItems = items.filter(item => {
        const title = (item.metadata?.title || item.title || '').toLowerCase();
        const raw = (item.rawTitle || '').toLowerCase();
        return def.patterns.some(p => p.test(title) || p.test(raw));
      });

      if (matchingItems.length > 0) {
        // Sort items by release year or title
        matchingItems.sort((a, b) => {
          const yearA = a.metadata?.year || a.year || 0;
          const yearB = b.metadata?.year || b.year || 0;
          if (yearA && yearB && yearA !== yearB) return yearA - yearB;
          return (a.title || '').localeCompare(b.title || '');
        });

        // Compute total episodes and total duration
        let totalEpisodes = 0;
        matchingItems.forEach(i => totalEpisodes += (i.episodes ? i.episodes.length : 1));

        sagas.push({
          ...def,
          items: matchingItems,
          itemCount: matchingItems.length,
          totalEpisodes: totalEpisodes,
          coverImage: matchingItems[0].metadata?.cover || null,
          bannerImage: matchingItems[0].metadata?.banner || matchingItems[0].metadata?.cover || null
        });
      }
    }

    return sagas;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SagaManager;
}
