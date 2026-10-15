# AnimeOpen 🌸

> **The Ultimate Local Anime Streaming & Library Experience for Desktop**  
> Built with Electron, HTML5, Vanilla CSS, and modern JavaScript.

AnimeOpen brings a premium Netflix / Crunchyroll-grade streaming experience directly to your local anime collection. Point it to any folder or hard drive, and it instantly transforms messy video files and `.zip` archives into a gorgeous, high-definition anime universe complete with AniList metadata, voice actor showcases, automated opening skips, and theme song playlists.

---

## ✨ Features Overview

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

| Shortcut | Action |
| :--- | :--- |
| <kbd>Space</kbd> or <kbd>K</kbd> | Play / Pause |
| <kbd>→</kbd> or <kbd>L</kbd> | Seek forward 10 seconds |
| <kbd>←</kbd> or <kbd>J</kbd> | Seek backward 10 seconds |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Volume up / down (10% increments) |
| <kbd>M</kbd> | Mute / Unmute audio |
| <kbd>S</kbd> | Capture Screenshot (Saved to Pictures + Copied to Clipboard) |
| <kbd>N</kbd> | Next Episode |
| <kbd>P</kbd> | Previous Episode |
| <kbd>F</kbd> | Toggle Fullscreen |
| <kbd>Esc</kbd> | Exit Fullscreen / Close Player |

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
*Zambian Web & Software Developer with a passion for anime.*  
Made to make watching and organizing anime collections effortless and beautiful. Enjoy!
