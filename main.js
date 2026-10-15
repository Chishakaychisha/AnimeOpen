const { app, BrowserWindow, ipcMain, dialog, protocol, shell, net, session, clipboard, powerMonitor, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');


// Register custom scheme for high-performance video streaming with range-requests
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'anime-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true
    }
  }
]);

let mainWindow = null;
let splashWindow = null;
const LanService = require('./src/js/lanService');
let lanService = null;
const DATA_FILE = path.join(app.getPath('userData'), 'animeopen_store.json');

// Helper to get stored user data
function loadStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Error loading store:', err);
  }
  return {
    libraryFolder: '',
    cinemaFolder: '',
    activeLibraryMode: 'anime',
    watchHistory: {}, // { [episodePath]: { progress: 0, duration: 0, lastWatched: timestamp, completed: boolean } }
    cachedMetadata: {}, // { [cleanedTitle]: { animeData } }
    cachedCinemaMetadata: {}, // { [cleanTitle]: { movie/tv Data } }
    customMatches: {}, // { [folderName]: animeId }
    autoStart: false,
    rssSubscriptions: [], // [ { title, quality, lastDownloadedEp, enabled, folder } ]
    maxConcurrentDownloads: 2,
    subStyleSettings: {
      fontSize: '22px',
      color: '#ffffff',
      background: 'shadow'
    }
  };
}

function saveStore(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error saving store:', err);
    return false;
  }
}

// MIME types for video formats
const MIME_TYPES = {
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4',
  '.ts': 'video/mp2t'
};

function setupMediaProtocol() {
  protocol.handle('anime-media', async (request) => {
    try {
      const parsedUrl = new URL(request.url);
      let decodedPath = '';

      if (parsedUrl.searchParams.has('path')) {
        decodedPath = parsedUrl.searchParams.get('path');
      } else if (parsedUrl.host && parsedUrl.host.length === 1 && /^[a-zA-Z]$/.test(parsedUrl.host)) {
        decodedPath = `${parsedUrl.host}:${decodeURIComponent(parsedUrl.pathname)}`;
      } else {
        decodedPath = decodeURIComponent(parsedUrl.pathname);
        if (process.platform === 'win32' && decodedPath.startsWith('/')) {
          decodedPath = decodedPath.slice(1);
        }
      }

      if (!fs.existsSync(decodedPath)) {
        console.error('Media file not found:', decodedPath);
        return new Response('File not found', { status: 404 });
      }

      const stat = fs.statSync(decodedPath);
      const fileSize = stat.size;
      const ext = path.extname(decodedPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'video/mp4';
      const rangeHeader = request.headers.get('range');

      if (rangeHeader) {
        // Parse Range: bytes=start-end  (supports multi-range but serve first range)
        const rangeMatch = rangeHeader.match(/bytes=(\d*)-(\d*)/);
        if (!rangeMatch) {
          return new Response('Bad Range header', { status: 400 });
        }
        const start = rangeMatch[1] ? parseInt(rangeMatch[1], 10) : 0;
        const end   = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : fileSize - 1;

        if (start >= fileSize || end >= fileSize || start > end) {
          return new Response('Requested range not satisfiable', {
            status: 416,
            headers: { 'Content-Range': `bytes */${fileSize}` }
          });
        }

        const chunksize = (end - start) + 1;
        const fileStream = fs.createReadStream(decodedPath, { start, end });

        const stream = new ReadableStream({
          start(controller) {
            fileStream.on('data', (chunk) => controller.enqueue(chunk));
            fileStream.on('end',  () => controller.close());
            fileStream.on('error', (err) => controller.error(err));
          },
          cancel() { fileStream.destroy(); }
        });

        return new Response(stream, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize.toString(),
            'Content-Type': contentType
          }
        });
      } else {
        // No range header — serve full file, still advertise Accept-Ranges
        const fileStream = fs.createReadStream(decodedPath);
        const stream = new ReadableStream({
          start(controller) {
            fileStream.on('data', (chunk) => controller.enqueue(chunk));
            fileStream.on('end',  () => controller.close());
            fileStream.on('error', (err) => controller.error(err));
          },
          cancel() { fileStream.destroy(); }
        });

        return new Response(stream, {
          status: 200,
          headers: {
            'Content-Length': fileSize.toString(),
            'Accept-Ranges': 'bytes',
            'Content-Type': contentType
          }
        });
      }
    } catch (error) {
      console.error('Error handling media protocol:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  });
}


const yauzl = require('yauzl');
const crypto = require('crypto');

// Video extensions
const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.webm', '.avi', '.mov', '.m4v']);

// Directory for extracted anime files
const EXTRACT_CACHE_DIR = path.join(app.getPath('userData'), 'extracted_anime');
if (!fs.existsSync(EXTRACT_CACHE_DIR)) {
  fs.mkdirSync(EXTRACT_CACHE_DIR, { recursive: true });
}

// Directory for locally cached cover images
const COVERS_CACHE_DIR = path.join(app.getPath('userData'), 'AnimeOpen_Covers');
if (!fs.existsSync(COVERS_CACHE_DIR)) {
  fs.mkdirSync(COVERS_CACHE_DIR, { recursive: true });
}

function getZipId(zipPath) {
  return crypto.createHash('md5').update(zipPath).digest('hex').slice(0, 16);
}

function readZipVideoEntries(zipPath) {
  return new Promise((resolve) => {
    const results = [];
    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
      if (err) {
        console.warn(`Could not open zip ${zipPath}:`, err.message);
        return resolve([]);
      }
      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        if (!/\/$/.test(entry.fileName)) {
          const ext = path.extname(entry.fileName).toLowerCase();
          if (VIDEO_EXTS.has(ext)) {
            results.push({
              entryName: entry.fileName,
              size: entry.uncompressedSize
            });
          }
        }
        zipfile.readEntry();
      });
      zipfile.on('end', () => resolve(results));
      zipfile.on('error', (e) => {
        console.warn(`Error reading zip entries in ${zipPath}:`, e.message);
        resolve(results);
      });
    });
  });
}

function extractZipEntryStream(zipPath, entryName, targetFilePath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
      if (err) return reject(err);
      let entryFound = false;
      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        if (entry.fileName === entryName) {
          entryFound = true;
          zipfile.openReadStream(entry, (streamErr, readStream) => {
            if (streamErr) return reject(streamErr);
            const tempPath = `${targetFilePath}.tmp.${Date.now()}`;
            const writeStream = fs.createWriteStream(tempPath);
            readStream.pipe(writeStream);
            writeStream.on('finish', () => {
              fs.rename(tempPath, targetFilePath, (renameErr) => {
                if (renameErr) {
                  try { fs.unlinkSync(tempPath); } catch (_) {}
                  reject(renameErr);
                } else {
                  resolve(targetFilePath);
                }
              });
            });
            writeStream.on('error', (wErr) => {
              try { fs.unlinkSync(tempPath); } catch (_) {}
              reject(wErr);
            });
            readStream.on('error', (rErr) => {
              try { fs.unlinkSync(tempPath); } catch (_) {}
              reject(rErr);
            });
          });
        } else {
          zipfile.readEntry();
        }
      });
      zipfile.on('end', () => {
        if (!entryFound) reject(new Error(`Entry "${entryName}" not found in zip archive`));
      });
      zipfile.on('error', reject);
    });
  });
}

async function scanDirectory(dirPath, maxDepth = 4, currentDepth = 0) {
  let results = [];
  if (currentDepth > maxDepth) return results;

  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const subResults = await scanDirectory(fullPath, maxDepth, currentDepth + 1);
        results = results.concat(subResults);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (VIDEO_EXTS.has(ext)) {
          try {
            const stat = await fs.promises.stat(fullPath);
            results.push({
              name: entry.name,
              fullPath: fullPath,
              size: stat.size,
              mtime: stat.mtimeMs,
              relativeDir: path.relative(dirPath, fullPath),
              isZip: false
            });
          } catch (e) {
            console.warn(`Could not stat file ${fullPath}:`, e.message);
          }
        } else if (ext === '.zip') {
          // Inspect zip archive entries without loading file into memory
          try {
            const stat = await fs.promises.stat(fullPath);
            const zipId = getZipId(fullPath);
            const zipEntries = await readZipVideoEntries(fullPath);

            for (const zEntry of zipEntries) {
              const fileNameOnly = path.basename(zEntry.entryName);
              const expectedExtractedPath = path.join(EXTRACT_CACHE_DIR, zipId, fileNameOnly);
              const isExtracted = fs.existsSync(expectedExtractedPath);

              results.push({
                name: fileNameOnly,
                fullPath: isExtracted ? expectedExtractedPath : fullPath,
                size: zEntry.size,
                mtime: stat.mtimeMs,
                relativeDir: path.relative(dirPath, fullPath),
                isZip: true,
                zipPath: fullPath,
                entryName: zEntry.entryName,
                isExtracted: isExtracted,
                extractedPath: isExtracted ? expectedExtractedPath : null
              });
            }
          } catch (zipErr) {
            console.warn(`Could not inspect zip file ${fullPath}:`, zipErr.message);
          }
        }
      }
    }
  } catch (err) {
    console.error(`Cannot read directory ${dirPath}:`, err.message);
  }

  return results;
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 820,
    height: 520,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    icon: path.join(__dirname, 'src/assets/icon.png')
  });

  splashWindow.loadFile(path.join(__dirname, 'src/splash.html'));

  splashWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.show();
    }
  });

  splashWindow.on('closed', () => {
    splashWindow = null;
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    center: true,
    show: false,
    backgroundColor: '#090b10',
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      webviewTag: true
    },
    icon: path.join(__dirname, 'src/assets/icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, 'src/index.html'));

  mainWindow.webContents.on('did-finish-load', () => {
    // If splash is already finished or doesn't exist, show main window
    if (!splashWindow && mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

let torrentClient = null;

async function getTorrentClient() {
  if (!torrentClient) {
    try {
      const WebTorrentModule = await import('webtorrent');
      const WebTorrent = WebTorrentModule.default || WebTorrentModule;
      torrentClient = new WebTorrent();
      torrentClient.on('error', (err) => {
        console.warn('WebTorrent client warning:', err.message);
      });
    } catch (err) {
      console.error('Failed to initialize WebTorrent:', err);
    }
  }
  return torrentClient;
}

function deriveAnimeFolderName(rawName) {
  if (!rawName) return 'Anime Downloads';
  let clean = rawName.replace(/\.(mp4|mkv|webm|avi|mov|m4v|ts|zip|torrent)$/i, '');
  clean = clean.replace(/^\[[^\]]+\]\s*/g, '');
  clean = clean.replace(/^(AnimePahe|AnimeKaizoku|SubsPlease|HorribleSubs|Erai-raws)[_ ]+/i, '');
  clean = clean.replace(/[_.]/g, ' ');
  const epMatch = clean.search(/(\s*-\s*\d+|\s+S\d+E\d+|\s+E\d+|\s+Episode\s+\d+)/i);
  if (epMatch > 0) {
    clean = clean.substring(0, epMatch);
  }
  clean = clean.replace(/\[[^\]]+\]/g, ' ')
               .replace(/\([^\)]+\)/g, ' ')
               .replace(/\b(1080p|720p|480p|2160p|4k|uhd|x264|x265|hevc|h264|h265|avc|10bit|8bit|aac|flac|dual-audio|multi-audio|subbed|dubbed)\b/gi, ' ')
               .replace(/\s+/g, ' ')
               .trim();
  clean = clean.replace(/[\\/:*?"<>|]/g, '').trim();
  return clean || 'Anime Downloads';
}

// Active downloads map: id -> { id, type: 'electron'|'torrent', item/torrent, filename, seriesFolder, savePath, state, url, totalBytes }
const activeDownloads = new Map();
// Pending folder mapping for refreshed links: url -> seriesFolder
const pendingRefreshFolders = new Map();

// Helper to count actively downloading items (not queued/paused)
function getActiveDownloadingCount() {
  let count = 0;
  for (const dl of activeDownloads.values()) {
    if (dl.state === 'downloading') count++;
  }
  return count;
}

// Process queued downloads when concurrency slots open up
function processDownloadQueue() {
  const store = loadStore();
  const maxActive = (store.maxConcurrentDownloads !== undefined && store.maxConcurrentDownloads > 0)
    ? store.maxConcurrentDownloads
    : 2;
  const currentActive = getActiveDownloadingCount();

  if (currentActive < maxActive) {
    const slotsAvailable = maxActive - currentActive;
    let resumedCount = 0;
    for (const dl of activeDownloads.values()) {
      if (dl.state === 'queued') {
        if (dl.type === 'electron' && dl.item) {
          if (dl.item.canResume()) {
            dl.item.resume();
            dl.state = 'downloading';
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('download:resumed', { id: dl.id, filename: dl.filename });
            }
            resumedCount++;
            if (resumedCount >= slotsAvailable) break;
          }
        } else if (dl.type === 'torrent' && dl.torrent) {
          dl.torrent.resume();
          dl.state = 'downloading';
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('download:resumed', { id: dl.id, filename: dl.filename });
          }
          resumedCount++;
          if (resumedCount >= slotsAvailable) break;
        }
      }
    }
  }
}

// Live Folder Watcher (fs.watch with debounce)
let folderWatcher = null;
let watcherDebounceTimer = null;

function startFolderWatcher(folderPath) {
  if (folderWatcher) {
    try { folderWatcher.close(); } catch (_) {}
    folderWatcher = null;
  }
  if (!folderPath || !fs.existsSync(folderPath)) return;

  try {
    folderWatcher = fs.watch(folderPath, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      const ext = path.extname(filename).toLowerCase();
      // Only react to video files and zip archives
      if (VIDEO_EXTS.has(ext) || ext === '.zip') {
        clearTimeout(watcherDebounceTimer);
        watcherDebounceTimer = setTimeout(async () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('library:folder-changed', {
              eventType,
              filename,
              folderPath
            });
          }
        }, 1800); // 1.8s debounce to allow large file writes to complete
      }
    });
    console.log(`Live folder watcher active on: ${folderPath}`);
  } catch (err) {
    console.warn(`Could not start folder watcher on ${folderPath}:`, err.message);
  }
}

// RSS Feed Auto-Downloader
let rssCheckInterval = null;

async function checkRssSubscriptions() {
  const store = loadStore();
  const subs = store.rssSubscriptions || [];
  if (!subs || subs.length === 0) return { checked: 0, newDownloads: 0 };

  const activeSubs = subs.filter(s => s.enabled);
  if (activeSubs.length === 0) return { checked: 0, newDownloads: 0 };

  let newDownloadsCount = 0;

  try {
    // Fetch SubsPlease 1080p RSS feed
    const subsPleaseUrl = 'https://subsplease.org/rss/?r=1080';
    const resp = await net.fetch(subsPleaseUrl, { headers: { 'User-Agent': 'AnimeOpen/1.0' } });
    if (resp.ok) {
      const xml = await resp.text();
      const items = [];
      const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
      let match;
      while ((match = itemRegex.exec(xml)) !== null) {
        const itemContent = match[1];
        const titleMatch = itemContent.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/i);
        const linkMatch = itemContent.match(/<link>(.*?)<\/link>|<guid[^>]*>(.*?)<\/guid>/i);
        const title = (titleMatch ? (titleMatch[1] || titleMatch[2]) : '').trim();
        const link = (linkMatch ? (linkMatch[1] || linkMatch[2]) : '').trim();
        if (title && link) {
          items.push({ title, link });
        }
      }

      for (const sub of activeSubs) {
        const searchPattern = sub.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (const item of items) {
          const itemTitleClean = item.title.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (itemTitleClean.includes(searchPattern)) {
            const quality = sub.quality || '1080p';
            if (quality && !item.title.toLowerCase().includes(quality.toLowerCase())) {
              continue;
            }

            // Extract episode number
            const epMatch = item.title.match(/(\s*-\s*|\s+)(\d{1,4})(\s+\[|\s*\()/);
            const epNum = epMatch ? parseInt(epMatch[2], 10) : 0;

            if (epNum > (sub.lastDownloadedEp || 0)) {
              console.log(`[RSS Auto-Downloader] New episode found for "${sub.title}": ${item.title}`);
              sub.lastDownloadedEp = epNum;
              saveStore(store);

              await addTorrentToDownload(item.link);
              newDownloadsCount++;

              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('rss:new-episode', {
                  title: sub.title,
                  episode: epNum,
                  filename: item.title
                });
              }
            }
          }
        }
      }
    }
  } catch (rssErr) {
    console.warn('[RSS Auto-Downloader] Error checking RSS feeds:', rssErr.message);
  }

  return { checked: activeSubs.length, newDownloads: newDownloadsCount };
}

async function addTorrentToDownload(torrentInput) {
  try {
    const client = await getTorrentClient();
    if (!client) throw new Error('Torrent engine could not be loaded');

    const store = loadStore();
    const baseDir = store.libraryFolder || app.getPath('downloads');
    const downloadId = 'torrent_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

    const maxActive = (store.maxConcurrentDownloads !== undefined && store.maxConcurrentDownloads > 0)
      ? store.maxConcurrentDownloads
      : 2;
    const currentActive = getActiveDownloadingCount();
    const shouldQueue = currentActive >= maxActive;

    // Initial notification that metadata is resolving
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download:started', {
        id: downloadId,
        filename: 'Resolving anime torrent & peers...',
        seriesFolder: 'Detecting...',
        totalBytes: 0,
        isTorrent: true,
        state: shouldQueue ? 'queued' : 'downloading'
      });
    }

    client.add(torrentInput, { path: baseDir }, (torrent) => {
      const seriesFolder = deriveAnimeFolderName(torrent.name);
      const targetDir = path.join(baseDir, seriesFolder);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const filename = torrent.name;
      const totalBytes = torrent.length;
      const savePath = path.join(targetDir, filename);

      const isInitiallyQueued = getActiveDownloadingCount() >= maxActive;
      if (isInitiallyQueued) {
        torrent.pause();
      }

      // Register in active downloads
      activeDownloads.set(downloadId, {
        id: downloadId,
        type: 'torrent',
        torrent: torrent,
        filename: filename,
        seriesFolder: seriesFolder,
        savePath: savePath,
        state: isInitiallyQueued ? 'queued' : 'downloading',
        url: torrentInput,
        totalBytes: totalBytes
      });

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download:started', {
          id: downloadId,
          filename: filename,
          seriesFolder: seriesFolder,
          totalBytes: totalBytes,
          savePath: savePath,
          isTorrent: true,
          state: isInitiallyQueued ? 'queued' : 'downloading'
        });
      }

      const progressInterval = setInterval(() => {
        if (!torrent || torrent.destroyed) {
          clearInterval(progressInterval);
          activeDownloads.delete(downloadId);
          processDownloadQueue();
          return;
        }

        const dlInfo = activeDownloads.get(downloadId);
        if (dlInfo && dlInfo.state === 'queued') return;

        if (mainWindow && !mainWindow.isDestroyed()) {
          if (torrent.paused) {
            mainWindow.webContents.send('download:paused', {
              id: downloadId,
              filename: filename
            });
          } else {
            const percent = Math.round(torrent.progress * 100);
            mainWindow.webContents.send('download:progress', {
              id: downloadId,
              filename: filename,
              seriesFolder: seriesFolder,
              receivedBytes: torrent.downloaded,
              totalBytes: totalBytes,
              downloadSpeed: torrent.downloadSpeed,
              numPeers: torrent.numPeers,
              percent: percent,
              isTorrent: true
            });
          }
        }
      }, 1000);

      torrent.on('done', () => {
        clearInterval(progressInterval);
        activeDownloads.delete(downloadId);
        processDownloadQueue();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download:completed', {
            id: downloadId,
            filename: filename,
            seriesFolder: seriesFolder,
            savePath: savePath,
            isTorrent: true
          });
        }
      });

      torrent.on('error', (err) => {
        clearInterval(progressInterval);
        activeDownloads.delete(downloadId);
        processDownloadQueue();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download:failed', {
            id: downloadId,
            filename: filename,
            state: err.message,
            isTorrent: true
          });
        }
      });
    });

    return { success: true, downloadId };
  } catch (err) {
    console.error('Failed to add torrent:', err);
    return { success: false, error: err.message };
  }
}

function setupDownloadInterception() {
  function attachSession(sess) {
    if (!sess) return;
    sess.on('will-download', (event, item, webContents) => {
      const store = loadStore();
      const baseDir = store.libraryFolder || app.getPath('downloads');
      const filename = item.getFilename();
      const itemUrl = item.getURL();

      // Intercept .torrent files and download content via built-in WebTorrent!
      if (filename.toLowerCase().endsWith('.torrent')) {
        const tempTorrentPath = path.join(app.getPath('temp'), `anime_${Date.now()}_${filename}`);
        item.setSavePath(tempTorrentPath);
        item.once('done', (e, state) => {
          if (state === 'completed') {
            addTorrentToDownload(tempTorrentPath);
          }
        });
        return;
      }

      // Check if this download came from a refreshed link that preserved a series folder
      const preservedFolder = pendingRefreshFolders.get(itemUrl);
      if (preservedFolder) {
        pendingRefreshFolders.delete(itemUrl);
      }

      // Normal video / archive download -> place in series folder
      const seriesFolder = preservedFolder || deriveAnimeFolderName(filename);
      const targetDir = store.libraryFolder ? path.join(baseDir, seriesFolder) : baseDir;

      try {
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
      } catch (_) {}

      const savePath = path.join(targetDir, filename);
      item.setSavePath(savePath);

      const downloadId = 'dl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      const totalBytes = item.getTotalBytes();

      const maxActive = (store.maxConcurrentDownloads !== undefined && store.maxConcurrentDownloads > 0)
        ? store.maxConcurrentDownloads
        : 2;
      const shouldQueue = getActiveDownloadingCount() >= maxActive;

      if (shouldQueue) {
        item.pause();
      }

      // Register in active downloads
      activeDownloads.set(downloadId, {
        id: downloadId,
        type: 'electron',
        item: item,
        filename: filename,
        seriesFolder: seriesFolder,
        savePath: savePath,
        state: shouldQueue ? 'queued' : 'downloading',
        url: itemUrl,
        totalBytes: totalBytes
      });

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download:started', {
          id: downloadId,
          filename: filename,
          seriesFolder: seriesFolder,
          totalBytes: totalBytes,
          savePath: savePath,
          isTorrent: false,
          state: shouldQueue ? 'queued' : 'downloading'
        });
      }

      item.on('updated', (event, state) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          const dlInfo = activeDownloads.get(downloadId);
          if (dlInfo && dlInfo.state === 'queued') return;

          if (state === 'interrupted') {
            if (dlInfo) dlInfo.state = 'interrupted';
            mainWindow.webContents.send('download:interrupted', { id: downloadId, filename });
          } else if (state === 'progressing') {
            if (item.isPaused()) {
              if (dlInfo) dlInfo.state = 'paused';
              mainWindow.webContents.send('download:paused', { id: downloadId, filename });
            } else {
              if (dlInfo) dlInfo.state = 'downloading';
              const received = item.getReceivedBytes();
              const total = item.getTotalBytes();
              const percent = total > 0 ? Math.round((received / total) * 100) : 0;
              mainWindow.webContents.send('download:progress', {
                id: downloadId,
                filename: filename,
                seriesFolder: seriesFolder,
                receivedBytes: received,
                totalBytes: total,
                percent: percent,
                isTorrent: false
              });
            }
          }
        }
      });

      item.once('done', (event, state) => {
        activeDownloads.delete(downloadId);
        processDownloadQueue();
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (state === 'completed') {
            mainWindow.webContents.send('download:completed', {
              id: downloadId,
              filename: filename,
              seriesFolder: seriesFolder,
              savePath: savePath,
              isTorrent: false
            });
          } else if (state === 'cancelled') {
            mainWindow.webContents.send('download:cancelled', {
              id: downloadId,
              filename: filename,
              isTorrent: false
            });
          } else {
            mainWindow.webContents.send('download:failed', {
              id: downloadId,
              filename: filename,
              state: state,
              isTorrent: false
            });
          }
        }
      });
    });
  }

  attachSession(session.defaultSession);
  const browserSess = session.fromPartition('persist:animeopen_browser');
  attachSession(browserSess);
}

app.whenReady().then(() => {
  setupMediaProtocol();
  setupDownloadInterception();

  const store = loadStore();

  // Apply stored autostart preference to Windows login items
  try {
    if (store && store.autoStart) {
      app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: false,
        path: process.execPath,
        args: ['--autostart']
      });
    }
  } catch (autoErr) {
    console.warn('Could not initialize auto-start settings:', autoErr.message);
  }

  // Start live folder watcher on library folder
  if (store.libraryFolder) {
    startFolderWatcher(store.libraryFolder);
  }

  // Start RSS Feed Auto-Downloader (checks every 20 minutes)
  checkRssSubscriptions();
  rssCheckInterval = setInterval(checkRssSubscriptions, 20 * 60 * 1000);

  // Register Global Keyboard Media Keys (Play/Pause, Next, Prev)
  try {
    globalShortcut.register('MediaPlayPause', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('player:global-key', 'play-pause');
      }
    });
    globalShortcut.register('MediaNextTrack', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('player:global-key', 'next');
      }
    });
    globalShortcut.register('MediaPreviousTrack', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('player:global-key', 'prev');
      }
    });
  } catch (shortcutErr) {
    console.warn('Could not register global media keys:', shortcutErr.message);
  }

  // Windows Sleep/Wake & Screen Unlock detection
  if (powerMonitor) {
    powerMonitor.on('resume', () => {
      console.log('System resumed from sleep');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('system:resumed', { source: 'resume' });
      }
      checkRssSubscriptions();
    });

    powerMonitor.on('unlock-screen', () => {
      console.log('System screen unlocked');
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('system:resumed', { source: 'unlock-screen' });
      }
    });
  }

  createSplashWindow();
  createWindow();

  try {
    lanService = new LanService({
      mainWindow,
      storeGetter: loadStore,
      storeSetter: saveStore
    });
    lanService.start().catch(err => console.warn('Could not start LAN service:', err.message));
  } catch (lanErr) {
    console.warn('Could not initialize LAN service:', lanErr.message);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      if (mainWindow) mainWindow.show();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (rssCheckInterval) clearInterval(rssCheckInterval);
  if (folderWatcher) {
    try { folderWatcher.close(); } catch (_) {}
  }
  if (lanService) {
    try { lanService.stop(); } catch (_) {}
  }
});


ipcMain.handle('splash:ready', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
  return true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Communications
ipcMain.handle('dialog:select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Anime Library Folder'
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }
  const folder = result.filePaths[0];
  startFolderWatcher(folder);
  return folder;
});

ipcMain.handle('dialog:select-subtitle', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: 'Select Subtitle File (.srt, .vtt, .ass)',
    filters: [
      { name: 'Subtitles', extensions: ['srt', 'vtt', 'ass', 'ssa'] }
    ]
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }
  const filePath = result.filePaths[0];
  const content = await fs.promises.readFile(filePath, 'utf8');
  return { filePath, content, fileName: path.basename(filePath) };
});

ipcMain.handle('dialog:select-wallpaper', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: 'Select Custom Wallpaper Image',
    filters: [
      { name: 'Images & Wallpapers', extensions: ['jpg', 'jpeg', 'png', 'webp', 'svg', 'bmp'] }
    ]
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('file:find-subtitles', async (event, videoFilePath) => {
  try {
    const dir = path.dirname(videoFilePath);
    const base = path.basename(videoFilePath, path.extname(videoFilePath));
    const files = await fs.promises.readdir(dir);
    const subExts = ['.srt', '.vtt', '.ass', '.ssa'];
    const matches = [];
    for (const f of files) {
      const ext = path.extname(f).toLowerCase();
      if (subExts.includes(ext) && (f.toLowerCase().includes(base.toLowerCase()) || f.toLowerCase().includes('sub'))) {
        const fullPath = path.join(dir, f);
        const content = await fs.promises.readFile(fullPath, 'utf8');
        matches.push({ fileName: f, filePath: fullPath, content });
      }
    }
    return matches;
  } catch (err) {
    return [];
  }
});

ipcMain.handle('store:get', (event, key) => {
  const store = loadStore();
  if (key && typeof key === 'string') {
    return store[key];
  }
  return store;
});

ipcMain.handle('store:set', (event, newStoreData) => {
  const oldStore = loadStore();
  const res = saveStore(newStoreData);
  if (newStoreData && newStoreData.libraryFolder && newStoreData.libraryFolder !== oldStore.libraryFolder) {
    startFolderWatcher(newStoreData.libraryFolder);
  }
  return res;
});

ipcMain.handle('store:set-item', (event, keyOrData, value) => {
  const store = loadStore();
  if (typeof keyOrData === 'string') {
    store[keyOrData] = value;
    return saveStore(store);
  } else if (keyOrData && typeof keyOrData === 'object') {
    Object.assign(store, keyOrData);
    return saveStore(store);
  }
  return false;
});

ipcMain.handle('library:scan', async (event, folderPath) => {
  if (!folderPath || !fs.existsSync(folderPath)) {
    return { success: false, error: 'Folder does not exist' };
  }
  try {
    const files = await scanDirectory(folderPath);
    return { success: true, files };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Extract single entry or batch from zip
ipcMain.handle('zip:extract-entry', async (event, { zipPath, entryName }) => {
  try {
    if (!fs.existsSync(zipPath)) {
      return { success: false, error: 'Zip file does not exist' };
    }

    const zipId = getZipId(zipPath);
    const targetDir = path.join(EXTRACT_CACHE_DIR, zipId);
    const targetFilePath = path.join(targetDir, path.basename(entryName));

    if (fs.existsSync(targetFilePath)) {
      return { success: true, filePath: targetFilePath };
    }

    if (!fs.existsSync(targetDir)) {
      await fs.promises.mkdir(targetDir, { recursive: true });
    }

    await extractZipEntryStream(zipPath, entryName, targetFilePath);

    if (fs.existsSync(targetFilePath)) {
      return { success: true, filePath: targetFilePath };
    } else {
      return { success: false, error: 'Extraction completed but target file not found' };
    }
  } catch (err) {
    console.error('Extraction error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('zip:extract-all', async (event, zipPath) => {
  try {
    if (!fs.existsSync(zipPath)) {
      return { success: false, error: 'Zip file does not exist' };
    }

    const zipId = getZipId(zipPath);
    const targetDir = path.join(EXTRACT_CACHE_DIR, zipId);

    if (!fs.existsSync(targetDir)) {
      await fs.promises.mkdir(targetDir, { recursive: true });
    }

    await new Promise((resolve, reject) => {
      yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
        if (err) return reject(err);
        zipfile.readEntry();
        zipfile.on('entry', (entry) => {
          if (/\/$/.test(entry.fileName)) {
            zipfile.readEntry();
          } else {
            const fileNameOnly = path.basename(entry.fileName);
            const targetFilePath = path.join(targetDir, fileNameOnly);
            if (fs.existsSync(targetFilePath)) {
              zipfile.readEntry();
            } else {
              zipfile.openReadStream(entry, (streamErr, readStream) => {
                if (streamErr) return reject(streamErr);
                const writeStream = fs.createWriteStream(targetFilePath);
                readStream.pipe(writeStream);
                writeStream.on('finish', () => zipfile.readEntry());
                writeStream.on('error', reject);
                readStream.on('error', reject);
              });
            }
          }
        });
        zipfile.on('end', resolve);
        zipfile.on('error', reject);
      });
    });

    return { success: true, targetDir };
  } catch (err) {
    console.error('Extract all error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('file:show-in-folder', (event, filePath) => {
  if (fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
    return true;
  }
  return false;
});

// Launch in external player (VLC, MPV, or system default) with resume timestamp
ipcMain.handle('external:play', async (event, { filePath, startTime = 0 }) => {
  if (!fs.existsSync(filePath)) return { success: false, error: 'File does not exist' };
  
  const vlcPaths = [
    'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
    'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe'
  ];
  const mpvPaths = [
    'C:\\Program Files\\mpv\\mpv.exe',
    'C:\\Program Files (x86)\\mpv\\mpv.exe',
    'C:\\mpv\\mpv.exe'
  ];

  let playerExe = vlcPaths.find(p => fs.existsSync(p));
  let isVlc = !!playerExe;
  if (!playerExe) {
    playerExe = mpvPaths.find(p => fs.existsSync(p));
  }

  const { spawn } = require('child_process');

  if (playerExe) {
    const args = isVlc
      ? [`--start-time=${Math.floor(startTime)}`, filePath]
      : [`--start=${Math.floor(startTime)}`, filePath];
    spawn(playerExe, args, { detached: true, stdio: 'ignore' }).unref();
    return { success: true, player: isVlc ? 'VLC' : 'MPV' };
  } else {
    shell.openPath(filePath);
    return { success: true, player: 'Default Media Player' };
  }
});

// Download and cache a remote image locally
ipcMain.handle('image:download-cache', async (event, { url, key, type }) => {
  if (!url || !key) return { success: false, error: 'Missing url or key' };

  // Sanitize key to safe filename
  const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  const ext = url.includes('.jpg') || url.includes('jpg') ? 'jpg' : 'png';
  const filename = `${safeKey}_${type || 'cover'}.${ext}`;
  const localPath = path.join(COVERS_CACHE_DIR, filename);

  // Return cached if already exists
  if (fs.existsSync(localPath)) {
    return { success: true, localPath, cached: true };
  }

  try {
    const response = await net.fetch(url);
    if (!response.ok) return { success: false, error: `HTTP ${response.status}` };
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.promises.writeFile(localPath, buffer);
    return { success: true, localPath, cached: false };
  } catch (err) {
    console.warn('Image cache download failed:', err.message);
    return { success: false, error: err.message };
  }
});

// Save video screenshot to disk
ipcMain.handle('screenshot:save', async (event, { dataUrl, animeTitle, epNumber }) => {
  try {
    const picturesDir = app.getPath('pictures') || app.getPath('documents');
    const animeCapturesDir = path.join(picturesDir, 'AnimeOpen_Screenshots');
    if (!fs.existsSync(animeCapturesDir)) {
      await fs.promises.mkdir(animeCapturesDir, { recursive: true });
    }
    const safeTitle = (animeTitle || 'Anime').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeEp = (epNumber || '1').toString().padStart(2, '0');
    const filename = `${safeTitle}_EP${safeEp}_${Date.now()}.png`;
    const targetPath = path.join(animeCapturesDir, filename);

    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
    await fs.promises.writeFile(targetPath, base64Data, 'base64');
    return { success: true, filePath: targetPath, filename };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Batch rename files safely
ipcMain.handle('file:batch-rename', async (event, renames) => {
  const results = [];
  for (const item of renames) {
    try {
      if (!fs.existsSync(item.oldPath)) {
        results.push({ oldPath: item.oldPath, success: false, error: 'File not found' });
        continue;
      }
      const dir = path.dirname(item.oldPath);
      const newPath = path.join(dir, item.newName);
      if (fs.existsSync(newPath) && newPath.toLowerCase() !== item.oldPath.toLowerCase()) {
        results.push({ oldPath: item.oldPath, success: false, error: 'Target file already exists' });
        continue;
      }
      await fs.promises.rename(item.oldPath, newPath);
      results.push({ oldPath: item.oldPath, newPath, success: true });
    } catch (err) {
      results.push({ oldPath: item.oldPath, success: false, error: err.message });
    }
  }
  return { success: true, results };
});

ipcMain.handle('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('window:close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('shell:open-external', async (event, externalUrl) => {
  try {
    await shell.openExternal(externalUrl);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('clipboard:write-text', async (event, text) => {
  try {
    clipboard.writeText(text);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('torrent:start', async (event, torrentInput) => {
  return await addTorrentToDownload(torrentInput);
});

// Download Controls IPC
ipcMain.handle('download:pause', (event, downloadId) => {
  const dl = activeDownloads.get(downloadId);
  if (!dl) return { success: false, error: 'Download not found or already finished' };
  try {
    if (dl.type === 'electron' && dl.item) {
      if (!dl.item.isPaused()) {
        dl.item.pause();
        dl.state = 'paused';
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download:paused', { id: downloadId, filename: dl.filename });
        }
      }
    } else if (dl.type === 'torrent' && dl.torrent) {
      dl.torrent.pause();
      dl.state = 'paused';
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download:paused', { id: downloadId, filename: dl.filename });
      }
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('download:resume', (event, downloadId) => {
  const dl = activeDownloads.get(downloadId);
  if (!dl) return { success: false, error: 'Download not found' };
  try {
    if (dl.type === 'electron' && dl.item) {
      if (dl.item.canResume()) {
        dl.item.resume();
        dl.state = 'downloading';
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download:resumed', { id: downloadId, filename: dl.filename });
        }
      } else {
        return { success: false, error: 'Download cannot be resumed directly. Please refresh the download link.' };
      }
    } else if (dl.type === 'torrent' && dl.torrent) {
      dl.torrent.resume();
      dl.state = 'downloading';
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download:resumed', { id: downloadId, filename: dl.filename });
      }
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('download:cancel', (event, downloadId) => {
  const dl = activeDownloads.get(downloadId);
  if (!dl) return { success: false, error: 'Download not found' };
  try {
    if (dl.type === 'electron' && dl.item) {
      dl.item.cancel();
      activeDownloads.delete(downloadId);
    } else if (dl.type === 'torrent' && dl.torrent) {
      dl.torrent.destroy();
      activeDownloads.delete(downloadId);
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download:cancelled', { id: downloadId, filename: dl.filename });
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('download:refresh-link', async (event, { id, newUrl }) => {
  if (!newUrl) return { success: false, error: 'No URL provided' };
  newUrl = newUrl.trim();

  // If old download exists, cancel it first and remember preferred folder
  const dl = activeDownloads.get(id);
  let preferredFolder = null;
  if (dl) {
    preferredFolder = dl.seriesFolder;
    try {
      if (dl.type === 'electron' && dl.item) dl.item.cancel();
      else if (dl.type === 'torrent' && dl.torrent) dl.torrent.destroy();
    } catch (_) {}
    activeDownloads.delete(id);
  }

  // If torrent or magnet
  if (newUrl.startsWith('magnet:') || newUrl.toLowerCase().endsWith('.torrent')) {
    return await addTorrentToDownload(newUrl);
  } else {
    // If we have a series folder from previous link, map it to the new URL
    if (preferredFolder) {
      pendingRefreshFolders.set(newUrl, preferredFolder);
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.downloadURL(newUrl);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
    return { success: false, error: 'Window not available for download' };
  }
});

// Windows Startup IPC Handlers
ipcMain.handle('app:get-autostart', () => {
  try {
    const settings = app.getLoginItemSettings();
    return settings.openAtLogin;
  } catch (e) {
    return false;
  }
});

ipcMain.handle('app:set-autostart', (event, enable) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enable,
      openAsHidden: false,
      path: process.execPath,
      args: ['--autostart']
    });
    const store = loadStore();
    store.autoStart = !!enable;
    saveStore(store);
    return { success: true, openAtLogin: !!enable };
  } catch (err) {
    console.error('Failed to set login item settings:', err);
    return { success: false, error: err.message };
  }
});

// Download Queue Concurrency & Re-ordering IPC
ipcMain.handle('download:set-concurrency', (event, maxConcurrent) => {
  const store = loadStore();
  store.maxConcurrentDownloads = parseInt(maxConcurrent, 10) || 2;
  saveStore(store);
  processDownloadQueue();
  return { success: true, maxConcurrent: store.maxConcurrentDownloads };
});

ipcMain.handle('download:reorder-queue', (event, { id, direction }) => {
  const items = Array.from(activeDownloads.entries());
  const index = items.findIndex(([k, v]) => k === id);
  if (index === -1) return { success: false, error: 'Item not in active list' };

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= items.length) {
    return { success: false, error: 'Cannot move further' };
  }

  // Swap
  const temp = items[index];
  items[index] = items[targetIndex];
  items[targetIndex] = temp;

  activeDownloads.clear();
  for (const [k, v] of items) {
    activeDownloads.set(k, v);
  }

  processDownloadQueue();
  return { success: true };
});

// RSS Subscriptions IPC
ipcMain.handle('rss:check', async () => {
  return await checkRssSubscriptions();
});

ipcMain.handle('rss:get-subscriptions', () => {
  const store = loadStore();
  return store.rssSubscriptions || [];
});

ipcMain.handle('rss:save-subscriptions', async (event, subscriptions) => {
  const store = loadStore();
  store.rssSubscriptions = subscriptions;
  saveStore(store);
  // Run immediate check
  checkRssSubscriptions();
  return { success: true, subscriptions };
});

// Online Subtitles Search & Download IPC
ipcMain.handle('subtitle:search-online', async (event, { query, episodeNumber }) => {
  try {
    const results = [];
    const cleanQuery = (query || '').replace(/[^\w\s]/gi, ' ').trim();
    const epStr = episodeNumber ? episodeNumber.toString().padStart(2, '0') : '';

    // Search AnimeTosho Open Subtitles Archive (extremely high coverage for anime)
    try {
      const searchUrl = `https://feed.animetosho.org/json?q=${encodeURIComponent(cleanQuery + (epStr ? ' ' + epStr : ''))}&only_tor=0`;
      const resp = await net.fetch(searchUrl, { headers: { 'User-Agent': 'AnimeOpen/1.0' } });
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data)) {
          data.slice(0, 15).forEach((item, idx) => {
            const subLinks = (item.attachments || []).filter(a => /\.(srt|ass|vtt)$/i.test(a));
            if (subLinks.length > 0) {
              subLinks.forEach(subFile => {
                results.push({
                  id: `at_${idx}_${path.basename(subFile)}`,
                  title: item.title,
                  filename: path.basename(subFile),
                  downloadUrl: `https://animetosho.org/storage/attach/${encodeURIComponent(subFile)}`,
                  source: 'AnimeTosho Subtitle',
                  lang: 'English'
                });
              });
            } else {
              results.push({
                id: `at_${idx}`,
                title: item.title,
                filename: `${item.title}.ass`,
                downloadUrl: item.link || '',
                source: 'AnimeTosho Stream / Sub',
                lang: 'Embedded / Multi'
              });
            }
          });
        }
      }
    } catch (e) {
      console.warn('Online sub search warning:', e.message);
    }

    return { success: true, results };
  } catch (err) {
    return { success: false, error: err.message, results: [] };
  }
});

ipcMain.handle('subtitle:download-online', async (event, { url, filename, videoPath }) => {
  try {
    if (!url) return { success: false, error: 'No download URL' };
    const resp = await net.fetch(url, { headers: { 'User-Agent': 'AnimeOpen/1.0' } });
    if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
    const content = await resp.text();

    // If videoPath is known, save subtitle alongside video so it is permanently loaded!
    let savedPath = null;
    if (videoPath && fs.existsSync(videoPath)) {
      const dir = path.dirname(videoPath);
      const ext = path.extname(filename) || '.srt';
      const baseVideo = path.basename(videoPath, path.extname(videoPath));
      savedPath = path.join(dir, `${baseVideo}${ext}`);
      try {
        await fs.promises.writeFile(savedPath, content, 'utf-8');
      } catch (_) {}
    }

    return { success: true, content, fileName: filename, savedPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Local Area Network (LAN) Peer Sharing IPC Handlers ──────────────────────

ipcMain.handle('lan:get-status', () => {
  return lanService ? lanService.getStatus() : { enabled: false, peers: [] };
});

ipcMain.handle('lan:set-enabled', async (event, enable) => {
  return lanService ? await lanService.setEnabled(enable) : false;
});

ipcMain.handle('lan:set-device-name', (event, name) => {
  return lanService ? lanService.setDeviceName(name) : false;
});

ipcMain.handle('lan:update-library', (event, animeList) => {
  if (lanService) lanService.updateSharedLibrary(animeList);
  return true;
});

ipcMain.handle('lan:fetch-peer-library', async (event, { ip, port }) => {
  return lanService ? await lanService.fetchPeerLibrary(ip, port) : { success: false, error: 'LAN service inactive' };
});

ipcMain.handle('lan:download-episode', async (event, options) => {
  return lanService ? await lanService.downloadEpisode(options) : { success: false, error: 'LAN service inactive' };
});

ipcMain.handle('lan:cancel-download', (event, id) => {
  return lanService ? lanService.cancelDownload(id) : false;
});

ipcMain.handle('lan:connect-manual', async (event, { ip, port }) => {
  return lanService ? await lanService.connectManual(ip, port) : { success: false, error: 'LAN service inactive' };
});



