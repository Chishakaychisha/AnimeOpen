# AnimeOpen 🌸

> **The Ultimate Local Anime Streaming & Library Experience for Desktop**  
> Built with Electron, HTML5, Vanilla CSS, and modern JavaScript.

AnimeOpen brings a premium Netflix / Crunchyroll-grade streaming experience directly to your local anime collection. Point it to any folder or hard drive, and it instantly transforms messy video files and `.zip` archives into a gorgeous, high-definition anime universe complete with AniList metadata, voice actor showcases, automated opening skips, offline LAN peer sharing, and theme song playlists.

---

## ✨ Features Overview

### 🌸 ⟷ 🎬 Dual-Mode Switcher: Anime & Cinema / Series
- **One-Click Instant Mode Switcher**: A header toggle pill allowing instant switching between your **Anime universe** and your live-action **Movies & TV Series collection**.
- **Smart Movie & TV Show Parser**: Automatically detects whether video files are standalone movies or episodic TV series with season and episode numbers (`S01E02`, `1x05`, etc.).
- **Rich Western Cinema Metadata**: Integrates TVMaze API for complete TV show episode guides, summaries, air dates, and iTunes Movie API for high-resolution 4K posters and runtimes—completely free with zero API keys required.
- **Independent Directory Settings**: Configure separate library folders for Anime and Movies/TV Shows in Settings, or point them to the same root drive.

---

### 🚀 LAN Sharing, Remote Companion & Superpowers

- **🌐 Mobile Companion Web Remote & QR Code Controller**:
  - Scan the high-resolution QR code on your phone or tablet to open a responsive web remote on your home Wi-Fi.
  - Full wireless control: Play/Pause, ±10s seek, volume scrubbing, episode navigation, and fullscreen toggle from the couch.
- **🎬 Smart Auto-Skip Intros, Recaps & Outros (Anime & Cinema)**:
  - Integrated AniSkip API with smart fallback that detects theme song chapters and offers interactive "Skip Intro" and "Skip Outro" buttons.
  - Automatically advances to the next episode seamlessly, Netflix-style.
- **🍿 Official Movie & Anime Trailer Player**:
  - Click the **"Trailer"** button on any movie, TV series, or anime card to stream the official 4K/1080p theatrical trailer directly in an overlay modal.
- **🌟 Franchise & Cinematic Universe Sagas**:
  - Automatically clusters related movies and anime into chronological sagas (Marvel Cinematic Universe, Batman Anthology, Harry Potter, Star Wars, Lord of the Rings, John Wick, Dragon Ball, Naruto, Demon Slayer, etc.).
  - Includes a 1-click **"Binge Saga"** button to queue the entire universe in chronological order.
- **📺 Binge Marathon Queue**:
  - Continuous autoplay queue across anime episodes, movies, and TV shows.
  - Add individual episodes via the `➕ Queue` button or queue an entire series with `Queue All`.
- **🌸 Anime Opening & Ending (OP/ED) Jukebox & Music Vault**:
  - Dedicated music vault tab featuring official opening and ending themes from your collection, playable as standalone music or video previews.
- **📖 Manga Reader Companion**:
  - Built-in reader supporting `.cbz`, `.cbr`, `.zip`, and image folders.
  - Supports Japanese Right-to-Left (RTL), Western Left-to-Right (LTR), dual-page spread, and continuous Webtoon vertical scroll with dark paper background.
- **📺 Chromecast & DLNA "Cast to TV" Support**:
  - Cast endpoints (`/api/stream/cast`) allowing you to stream local videos directly to Smart TVs, Apple TV, or Chromecast devices on your network.

---

### 🍿 Netflix-Style Hero Banner & Continue Watching Shelf

- **Recently Added / Featured Hero Banner**: A cinematic backdrop banner at the top of your library displaying high-resolution artwork, bold title typography, release year, episode count, community ratings, AniList synopses, and a bottom-right "Recently Added" badge.
- **1-Click Hero Resume**: Prominent white pill `▶ Play` button to jump straight into your in-progress episode or launch Episode 1 instantly, plus a glass pill `ℹ More Info` button.
- **Dedicated Continue Watching Carousel**: A Netflix-style horizontal scroll shelf (`overflow-x: auto`) positioned directly beneath the hero banner with real-time percentage progress bars, episode badges, and 1-click resume cards.

---

### 📡 Offline Local LAN Peer Sharing (No Internet Needed)

- **Local Network Sharing**: Stream and share anime with friends on the same Wi-Fi or Ethernet network completely offline without internet data usage.
- **Auto Peer Discovery (UDP Multicast)**: Automatically discovers nearby AnimeOpen instances on your local subnet using zero-configuration UDP beacons (`239.255.255.250`).
- **Direct LAN HTTP Streaming**: High-speed, random-access HTTP range streaming directly from your friend's laptop or desktop storage.
- **Peer Library Drawer**: View available LAN peers, explore their shared anime libraries, and start watching with a single click.

---

### ⚡ Live Automation & RSS Downloader

- **Real-Time Folder Watcher**: Automatically detects newly added, moved, or deleted video files on your disk in real time with instant library indexing—no need to manually click "Rescan Library".
- **Automated RSS Episode Downloader**: Subscribe to your favorite currently airing anime via RSS feeds (SubsPlease, Nyaa.si). AnimeOpen checks for new episode releases in the background and auto-downloads them directly into the appropriate series folder as soon as they air.

---

### 🎨 6 Handcrafted Aesthetic Themes

Switch themes instantly from **Settings** (⚙️) with real-time preview and persistence:

- **Midnight OLED (Abyss)** — Pitch black (`#000000`), cold slate surfaces, and neon pink/violet accents.
- **Cyberpunk Neo-Tokyo** — High-contrast neon cyan (`#00f0ff`) and electric magenta (`#ff0055`) glow.
- **Sakura Bloom** — Cherry blossom dark palette with soft rose petal (`#ff6fa9`) and royal lavender (`#b537f2`).
- **Studio Ghibli Emerald** — Dark forest aesthetic with emerald mint (`#00e676`) and sky cyan (`#00b0ff`).
- **Blood Moon / Akaza** — Obsidian dark with striking crimson red (`#ff2a4b`) and fiery ember orange (`#ff7700`).
- **Vaporwave Sunset** — Twilight violet backdrop with sunset amber (`#ff7b00`) and retro magenta (`#e01a88`).

---

### 🎬 Cinematic Streaming Player

- **HTTP 206 Partial Content Streaming (`anime-media://`)**: True random-access streaming allowing instantaneous seeking and skipping across multi-gigabyte video files.
- **Dual-Audio & Subtitle Track Selectors**: Dynamic menus for switching Japanese/English language audio tracks and subtitle streams.
- **Subtitle Sync & Timing Offset**: Fine-tune external subtitle timing (`-0.5s` / `+0.5s` increments) directly within the player controls for out-of-sync subtitle files.
- **Subtitle Styling Controls**: Custom font sizes, font families, text colors, and background/outline opacity for `.srt` and `.vtt` subtitles.
- **Online Subtitle Downloader**: In-player subtitle search and one-click download for missing subtitle files.
- **AniSkip Integration (Skip OP & ED)**: Automatically detects opening and ending timestamps via the AniSkip API. Features an interactive **"Skip Opening"** button and an optional **"Auto-Skip"** toggle in Settings.
- **1-Click External Player Fallback (VLC / MPV)**: One-click button in player controls to instantly launch heavy 10-bit HEVC/x265 videos in VLC or MPV at your exact current timestamp.
- **Instant Screenshot Grabber (<kbd>S</kbd> Key)**: Captures clean, unscaled video frames with zero UI overlays, copies directly to your clipboard for Discord/Twitter, and saves a PNG to `Pictures\AnimeOpen_Screenshots\`.
- **Cinematic Netflix-Style Intro Bumper**: Iconic AnimeOpen torii portal animation with swirling sakura petals, radiant neon rays, and Web Audio API synthesized sub-bass "Ta-dum" anime impact chord before every episode (can be skipped instantly or toggled in Settings).
- **First-Time User Onboarding Guide**: Comprehensive 6-step visual guide automatically displayed to first-time users, complete with shortcuts and the official developer signature: **Developed by Chisha K Chisha** (re-openable anytime from Settings).
- **Auto-Binge Countdown**: Automatically prompts up-next countdown overlay near the end of an episode to jump to the next one.
- **Speed & Control**: `0.5x` to `2.0x` variable speed playback, Picture-in-Picture (`PiP`), and volume boost.

---

### 📚 Smart Library & Metadata

- **Dynamic Folder Selection**: Remembers your preferred anime library folder across launches without any hardcoded paths.
- **AniList HD Metadata**: Automatically pulls HD cover art, banner backdrops, genre tags, synopses, studio information, and community ratings.
- **Manual Metadata & Artwork Editor**: If an obscure anime isn't matched or you want custom art, use the **"✏️ Edit Details"** tool to set custom titles, covers, descriptions, year, and scores.
- **AniList Rematch Tool**: Built-in interactive search modal to re-link titles to alternative AniList entries.
- **Watch Status Shelf & Tabs**: Filter your library into `All Anime`, `👀 Watching`, `✅ Completed`, and `📋 Plan to Watch`.
- **Missing Episode & Airing Tracker**:
  - Highlights missing episodes in a season (e.g., `⚠️ Missing 2 Episode(s) (Ep 4, 7)`).
  - Displays complete season verification badges (`✓ Complete Season (12/12 Episodes)`).
  - Shows real-time airing countdowns for ongoing anime (`📡 Airing: Ep 8 in 3 days`).
- **🌐 "Add to My Library" In-App Anime Browser & Torrent Downloader**:
  - **Embedded In-App Browser**: Custom address bar, instant site chips (**Nyaa.si**, **SubsPlease**, **AnimePahe**, **HiAnime**, **Erai-raws**, and **Archive.org**), and custom URL navigation.
  - **Custom Bookmarks & Sites**: Add your favorite custom streaming or release websites with custom titles and URLs, complete with bookmark management and 1-click access.
  - **Built-in WebTorrent Engine**: Directly downloads anime from `.torrent` files and `magnet:` links without requiring external third-party software.
  - **Automatic Series Subfolder Routing**: Automatically parses the clean anime title and saves episodes inside dedicated folders (e.g. `D:\Anime\Frieren Beyond Journey's End\`) so your collection stays organized.
  - **In-App Downloads Manager Drawer**: Track all active and finished downloads with speed indicators (`MB/s`), progress bars, peer counts, and quick "Open in Folder" actions.
  - **Seamless Background Multitasking**: Switch freely between the browser and your library/video player without reloading pages or interrupting downloads. A floating dock pill lets you jump back anytime with one click.
  - **Auto-Indexer**: Automatically re-scans the library when a download completes so newly acquired anime appears with full AniList metadata immediately.
- **Local Cover & Backdrop Caching**: Cover artwork and backdrops are downloaded and cached locally on disk. Even after batch cleaning filenames, re-scanning, or going offline, your posters and visual assets persist permanently.
- **In-App OST Mini-Player**: Bottom audio docking bar with interactive play/pause controls to preview anime opening and ending theme songs with YouTube links.
- **Release Tag Cleaner & Batch Renamer**: Scans and strips messy release tags like `[AnimeKaizoku]`, `[1080p Dual Audio x265]`, and standardizes names into clean Plex/Kodi format (`Series - S01E01 - Episode 1.ext`) with a dry-run preview table without losing your metadata.
- **Streamable ZIP Archives**: Plays anime stored directly inside `.zip` files on demand without manual decompression.

---

## ⌨️ Keyboard Shortcuts

| Shortcut                         | Action                                                       |
| :------------------------------- | :----------------------------------------------------------- |
| <kbd>Space</kbd> or <kbd>K</kbd> | Play / Pause                                                 |
| <kbd>→</kbd> or <kbd>L</kbd>     | Seek forward 10 seconds                                      |
| <kbd>←</kbd> or <kbd>J</kbd>     | Seek backward 10 seconds                                     |
| <kbd>↑</kbd> / <kbd>↓</kbd>      | Volume up / down (10% increments)                            |
| <kbd>M</kbd>                     | Mute / Unmute audio                                          |
| <kbd>S</kbd>                     | Capture Screenshot (Saved to Pictures + Copied to Clipboard) |
| <kbd>N</kbd>                     | Next Episode                                                 |
| <kbd>P</kbd>                     | Previous Episode                                             |
| <kbd>[</kbd> / <kbd>]</kbd>      | Adjust Subtitle Timing (-0.5s / +0.5s offset)                |
| <kbd>F</kbd>                     | Toggle Fullscreen                                            |
| <kbd>Esc</kbd>                   | Exit Fullscreen / Close Player                               |

---

## 🛠️ Development & Building

### Running Locally

```bash
npm install
npm start
```

### Creating Windows Installer (.exe)

```bash
npm run build:win
```

The output installer (`AnimeOpen Setup 1.0.0.exe`) will be generated inside the `dist/` directory.

---

## 👨‍💻 Author

**Chisha K. Chisha**  
_Zambian Web & Software Developer with a passion for anime._  
Made to make watching and organizing anime collections effortless and beautiful. Enjoy!
