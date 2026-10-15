/**
 * AnimeOpen - Local Area Network (LAN) Peer Sharing Service
 * Enables zero-internet direct P2P discovery, streaming, and episode downloads
 * between computers on the same Wi-Fi / Ethernet local network.
 */

const http = require('http');
const dgram = require('dgram');
const os = require('os');
const fs = require('fs');
const path = require('path');

const UDP_PORT = 58914;
const DEFAULT_HTTP_PORT = 58912;

const MIME_TYPES = {
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4',
  '.ts': 'video/mp2t',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
};

class LanService {
  constructor(options = {}) {
    this.mainWindow = options.mainWindow || null;
    this.storeGetter = options.storeGetter || (() => ({}));
    this.storeSetter = options.storeSetter || (() => {});
    
    this.enabled = false;
    this.deviceId = 'ao_' + Math.random().toString(36).substring(2, 10);
    this.deviceName = os.hostname() || 'AnimeOpen User';
    this.httpPort = DEFAULT_HTTP_PORT;
    this.myIp = this.getLocalIp();

    this.httpServer = null;
    this.udpSocket = null;
    this.broadcastTimer = null;
    this.cleanupTimer = null;

    this.activePeers = new Map(); // peerId -> { id, name, ip, port, animeCount, epCount, lastSeen }
    this.sharedLibrary = []; // cached anime list synced from renderer
    this.activeLanDownloads = new Map(); // id -> req

    // Load persisted settings
    const store = this.storeGetter();
    if (store) {
      if (store.lanDeviceName) this.deviceName = store.lanDeviceName;
      if (store.lanDeviceId) this.deviceId = store.lanDeviceId;
      if (store.lanEnabled !== undefined) this.enabled = !!store.lanEnabled;
      else this.enabled = true; // Enabled by default for convenient LAN sharing
    }
  }

  setMainWindow(win) {
    this.mainWindow = win;
  }

  updateSharedLibrary(animeList) {
    if (Array.isArray(animeList)) {
      this.sharedLibrary = animeList;
    }
  }

  getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const ifaceName of Object.keys(interfaces)) {
      for (const iface of interfaces[ifaceName]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return '127.0.0.1';
  }

  async start() {
    if (!this.enabled) return;
    this.myIp = this.getLocalIp();
    await this.startHttpServer();
    this.startUdpDiscovery();
  }

  stop() {
    if (this.broadcastTimer) {
      clearInterval(this.broadcastTimer);
      this.broadcastTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.udpSocket) {
      try { this.udpSocket.close(); } catch (_) {}
      this.udpSocket = null;
    }
    if (this.httpServer) {
      try { this.httpServer.close(); } catch (_) {}
      this.httpServer = null;
    }
    this.activePeers.clear();
    this.notifyPeersChanged();
  }

  // ─── Local HTTP File & Stream Server ───────────────────────────────────────

  startHttpServer() {
    return new Promise((resolve) => {
      if (this.httpServer) {
        try { this.httpServer.close(); } catch (_) {}
      }

      this.httpServer = http.createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      this.httpServer.on('error', (err) => {
        console.warn('[LAN Server] Error on port', this.httpPort, err.message);
        if (err.code === 'EADDRINUSE') {
          this.httpPort++;
          if (this.httpPort < DEFAULT_HTTP_PORT + 20) {
            this.httpServer.listen(this.httpPort, '0.0.0.0');
          }
        }
      });

      this.httpServer.listen(this.httpPort, '0.0.0.0', () => {
        console.log(`[LAN Server] HTTP streaming server running on http://${this.myIp}:${this.httpPort}`);
        resolve();
      });
    });
  }

  handleHttpRequest(req, res) {
    // Add CORS headers for all requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = reqUrl.pathname;

    // 1. Info endpoint
    if (pathname === '/api/info') {
      let totalEps = 0;
      this.sharedLibrary.forEach(a => totalEps += (a.episodes ? a.episodes.length : 0));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        app: 'AnimeOpen',
        version: '1.0.0',
        deviceId: this.deviceId,
        deviceName: this.deviceName,
        animeCount: this.sharedLibrary.length,
        epCount: totalEps
      }));
      return;
    }

    // 2. Library list endpoint
    if (pathname === '/api/library') {
      const sanitized = this.sharedLibrary.map((anime, aIdx) => {
        return {
          id: anime.id || String(aIdx),
          title: anime.title || 'Unknown Anime',
          romajiTitle: anime.metadata?.romajiTitle || '',
          cover: anime.metadata?.cover || (anime.metadata?.localCover ? `http://${this.myIp}:${this.httpPort}/api/cover/${anime.id || aIdx}` : ''),
          year: anime.metadata?.year || null,
          score: anime.metadata?.score || null,
          genres: anime.metadata?.genres || [],
          description: anime.metadata?.description || '',
          episodeCount: anime.episodes ? anime.episodes.length : 0,
          episodes: (anime.episodes || []).map((ep, eIdx) => ({
            index: eIdx,
            displayTitle: ep.displayTitle || `Episode ${eIdx + 1}`,
            fileName: ep.fileName,
            size: ep.size || 0,
            streamUrl: `http://${this.myIp}:${this.httpPort}/api/stream/${anime.id || aIdx}/${eIdx}`
          }))
        };
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, anime: sanitized }));
      return;
    }

    // 3. Cover art endpoint: /api/cover/:animeId
    if (pathname.startsWith('/api/cover/')) {
      const animeId = pathname.replace('/api/cover/', '');
      const anime = this.sharedLibrary.find((a, idx) => (a.id === animeId || String(idx) === animeId));
      if (anime && anime.metadata && anime.metadata.localCover && fs.existsSync(anime.metadata.localCover)) {
        const coverPath = anime.metadata.localCover;
        const ext = path.extname(coverPath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'image/jpeg', 'Cache-Control': 'public, max-age=86400' });
        fs.createReadStream(coverPath).pipe(res);
        return;
      }
      res.writeHead(404);
      res.end('Cover not found');
      return;
    }

    // 4. Stream & Download endpoint: /api/stream/:animeId/:epIndex
    const streamMatch = pathname.match(/^\/api\/(stream|download)\/([^/]+)\/(\d+)$/);
    if (streamMatch) {
      const isDownload = streamMatch[1] === 'download';
      const animeId = streamMatch[2];
      const epIndex = parseInt(streamMatch[3], 10);

      const anime = this.sharedLibrary.find((a, idx) => (a.id === animeId || String(idx) === animeId));
      if (!anime || !anime.episodes || !anime.episodes[epIndex]) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Episode not found');
        return;
      }

      const ep = anime.episodes[epIndex];
      const filePath = ep.filePath;

      if (!filePath || !fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Episode file missing on host');
        return;
      }

      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'video/mp4';

      if (isDownload) {
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': fileSize,
          'Content-Disposition': `attachment; filename="${encodeURIComponent(path.basename(filePath))}"`,
          'Accept-Ranges': 'bytes'
        });
        fs.createReadStream(filePath).pipe(res);
        return;
      }

      // Stream with HTTP 206 Range requests support
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (start >= fileSize || end >= fileSize || start > end) {
          res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
          res.end();
          return;
        }

        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(filePath, { start, end });

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': contentType
        });

        file.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes'
        });
        fs.createReadStream(filePath).pipe(res);
      }
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  }

  // ─── UDP Peer Discovery (LAN ZeroConf) ────────────────────────────────────

  startUdpDiscovery() {
    try {
      this.udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      this.udpSocket.on('error', (err) => {
        console.warn('[LAN Discovery] UDP error:', err.message);
      });

      this.udpSocket.on('message', (msg, rinfo) => {
        try {
          const data = JSON.parse(msg.toString());
          if (data && data.app === 'AnimeOpen' && data.id !== this.deviceId) {
            const peerId = data.id;
            const isNew = !this.activePeers.has(peerId);

            this.activePeers.set(peerId, {
              id: peerId,
              name: data.name || 'AnimeOpen Peer',
              ip: rinfo.address,
              port: data.port || DEFAULT_HTTP_PORT,
              animeCount: data.animeCount || 0,
              epCount: data.epCount || 0,
              lastSeen: Date.now()
            });

            if (isNew) {
              console.log(`[LAN Discovery] Discovered nearby peer: "${data.name}" at ${rinfo.address}:${data.port}`);
              this.notifyPeersChanged();
              // Direct unicast hello back so the peer also discovers us instantly
              this.sendDirectHello(rinfo.address, data.port);
            }
          }
        } catch (_) {}
      });

      this.udpSocket.bind(UDP_PORT, '0.0.0.0', () => {
        try {
          this.udpSocket.setBroadcast(true);
        } catch (e) {
          console.warn('[LAN Discovery] Could not set broadcast flag:', e.message);
        }
        // Send initial announcement
        this.broadcastHello();
      });

      // Periodic broadcast every 3.5 seconds
      this.broadcastTimer = setInterval(() => {
        this.broadcastHello();
      }, 3500);

      // Clean up stale peers every 4 seconds
      this.cleanupTimer = setInterval(() => {
        const now = Date.now();
        let changed = false;
        for (const [id, peer] of this.activePeers.entries()) {
          if (now - peer.lastSeen > 10000) {
            this.activePeers.delete(id);
            changed = true;
          }
        }
        if (changed) {
          this.notifyPeersChanged();
        }
      }, 4000);

    } catch (err) {
      console.warn('[LAN Discovery] Could not initialize UDP socket:', err.message);
    }
  }

  broadcastHello() {
    if (!this.udpSocket || !this.enabled) return;
    try {
      let totalEps = 0;
      this.sharedLibrary.forEach(a => totalEps += (a.episodes ? a.episodes.length : 0));

      const payload = Buffer.from(JSON.stringify({
        app: 'AnimeOpen',
        id: this.deviceId,
        name: this.deviceName,
        port: this.httpPort,
        animeCount: this.sharedLibrary.length,
        epCount: totalEps
      }));

      this.udpSocket.send(payload, 0, payload.length, UDP_PORT, '255.255.255.255', (err) => {
        if (err) {
          // Fallback to local subnet broadcast if global broadcast is blocked
          try {
            const parts = this.myIp.split('.');
            parts[3] = '255';
            const subnetBroadcast = parts.join('.');
            this.udpSocket.send(payload, 0, payload.length, UDP_PORT, subnetBroadcast);
          } catch (_) {}
        }
      });
    } catch (_) {}
  }

  sendDirectHello(targetIp, targetPort) {
    if (!this.udpSocket || !this.enabled) return;
    try {
      const payload = Buffer.from(JSON.stringify({
        app: 'AnimeOpen',
        id: this.deviceId,
        name: this.deviceName,
        port: this.httpPort,
        animeCount: this.sharedLibrary.length
      }));
      this.udpSocket.send(payload, 0, payload.length, UDP_PORT, targetIp);
    } catch (_) {}
  }

  notifyPeersChanged() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      const peers = Array.from(this.activePeers.values());
      this.mainWindow.webContents.send('lan:peers-changed', peers);
    }
  }

  // ─── Manual IP Connect & Fetch ───────────────────────────────────────────

  async connectManual(ip, port = DEFAULT_HTTP_PORT) {
    try {
      const fetchUrl = `http://${ip}:${port}/api/info`;
      const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const info = await res.json();
        const peerId = info.deviceId || `manual_${ip}`;
        this.activePeers.set(peerId, {
          id: peerId,
          name: info.deviceName || `Peer (${ip})`,
          ip: ip,
          port: port,
          animeCount: info.animeCount || 0,
          epCount: info.epCount || 0,
          lastSeen: Date.now()
        });
        this.notifyPeersChanged();
        return { success: true, peer: this.activePeers.get(peerId) };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
    return { success: false, error: 'Could not connect to peer' };
  }

  async fetchPeerLibrary(ip, port) {
    try {
      const url = `http://${ip}:${port}/api/library`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return { success: true, anime: data.anime || [] };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ─── 1-Click LAN Episode Download ──────────────────────────────────────────

  async downloadEpisode(options = {}) {
    const { ip, port, animeTitle, fileName, animeId, epIndex, totalBytes = 0 } = options;
    const downloadId = 'lan_dl_' + Date.now();

    const store = this.storeGetter();
    const baseLibrary = store.libraryFolder || os.homedir();
    const safeTitle = (animeTitle || 'Anime').replace(/[\\/:*?"<>|]/g, '').trim();
    const targetDir = path.join(baseLibrary, safeTitle);
    const targetFilePath = path.join(targetDir, fileName);

    try {
      if (!fs.existsSync(targetDir)) {
        await fs.promises.mkdir(targetDir, { recursive: true });
      }

      const streamUrl = `http://${ip}:${port}/api/stream/${animeId}/${epIndex}`;
      console.log(`[LAN Download] Starting transfer from ${streamUrl} -> ${targetFilePath}`);

      return new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(targetFilePath);
        let receivedBytes = 0;
        let lastTime = Date.now();
        let lastReceived = 0;
        let speedMBs = '0.0';

        const clientReq = http.get(streamUrl, (response) => {
          if (response.statusCode !== 200 && response.statusCode !== 206) {
            fileStream.close();
            fs.unlink(targetFilePath, () => {});
            return resolve({ success: false, error: `Peer returned status ${response.statusCode}` });
          }

          const reportedTotal = parseInt(response.headers['content-length'] || totalBytes || 0, 10);

          response.on('data', (chunk) => {
            receivedBytes += chunk.length;
            fileStream.write(chunk);

            const now = Date.now();
            if (now - lastTime >= 500) {
              const deltaSeconds = (now - lastTime) / 1000;
              const deltaBytes = receivedBytes - lastReceived;
              speedMBs = ((deltaBytes / (1024 * 1024)) / deltaSeconds).toFixed(1);
              lastTime = now;
              lastReceived = receivedBytes;

              const percent = reportedTotal > 0 ? Math.round((receivedBytes / reportedTotal) * 100) : 0;

              if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('lan:download-progress', {
                  id: downloadId,
                  fileName,
                  animeTitle,
                  receivedBytes,
                  totalBytes: reportedTotal,
                  percent,
                  speedMBs: `${speedMBs} MB/s`
                });
              }
            }
          });

          response.on('end', () => {
            fileStream.end();
            this.activeLanDownloads.delete(downloadId);

            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send('lan:download-completed', {
                id: downloadId,
                fileName,
                animeTitle,
                filePath: targetFilePath
              });
            }
            resolve({ success: true, filePath: targetFilePath });
          });

          response.on('error', (err) => {
            fileStream.close();
            fs.unlink(targetFilePath, () => {});
            this.activeLanDownloads.delete(downloadId);
            resolve({ success: false, error: err.message });
          });
        });

        clientReq.on('error', (err) => {
          fileStream.close();
          fs.unlink(targetFilePath, () => {});
          this.activeLanDownloads.delete(downloadId);
          resolve({ success: false, error: err.message });
        });

        this.activeLanDownloads.set(downloadId, clientReq);
      });

    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  cancelDownload(id) {
    const req = this.activeLanDownloads.get(id);
    if (req) {
      try { req.destroy(); } catch (_) {}
      this.activeLanDownloads.delete(id);
      return true;
    }
    return false;
  }

  // ─── Status & Settings ────────────────────────────────────────────────────

  getStatus() {
    return {
      enabled: this.enabled,
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      myIp: this.myIp,
      httpPort: this.httpPort,
      sharedAnimeCount: this.sharedLibrary.length,
      peers: Array.from(this.activePeers.values())
    };
  }

  async setEnabled(enable) {
    this.enabled = !!enable;
    const store = this.storeGetter();
    store.lanEnabled = this.enabled;
    this.storeSetter(store);

    if (this.enabled) {
      await this.start();
    } else {
      this.stop();
    }
    return this.getStatus();
  }

  setDeviceName(name) {
    const clean = (name || '').trim().slice(0, 32);
    if (!clean) return this.getStatus();
    this.deviceName = clean;
    const store = this.storeGetter();
    store.lanDeviceName = clean;
    this.storeSetter(store);
    this.broadcastHello();
    return this.getStatus();
  }
}

module.exports = LanService;
