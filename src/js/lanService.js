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

    this.playbackState = {
      playing: false,
      currentTime: 0,
      duration: 0,
      title: 'AnimeOpen',
      episodeTitle: 'Ready to stream',
      cover: '',
      volume: 1,
      muted: false,
      isCinema: false
    };
  }

  updatePlaybackState(state) {
    if (state && typeof state === 'object') {
      this.playbackState = { ...this.playbackState, ...state, lastUpdated: Date.now() };
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
    let fallback = '127.0.0.1';
    for (const ifaceName of Object.keys(interfaces)) {
      const lower = ifaceName.toLowerCase();
      // Skip virtual / container interfaces
      if (lower.includes('wsl') || lower.includes('virtual') || lower.includes('vethernet') || lower.includes('vmware') || lower.includes('hyper-v') || lower.includes('tap') || lower.includes('loopback')) {
        continue;
      }
      for (const iface of interfaces[ifaceName]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          if (lower.includes('wi-fi') || lower.includes('wifi') || lower.includes('wireless') || lower.includes('wlan')) {
            return iface.address;
          }
          if (lower.includes('ethernet') || lower.includes('eth')) {
            return iface.address;
          }
          if (fallback === '127.0.0.1') fallback = iface.address;
        }
      }
    }
    if (fallback !== '127.0.0.1') return fallback;
    for (const ifaceName of Object.keys(interfaces)) {
      for (const iface of interfaces[ifaceName]) {
        if (iface.family === 'IPv4' && !iface.internal) return iface.address;
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
    // Add CORS headers for all requests (supporting GET, POST, OPTIONS from mobile companion)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Authorization, Accept');

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

    // 5. Mobile Companion Web Remote UI: /remote
    if (pathname === '/remote' || pathname === '/remote/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(this.getRemoteWebHtml());
      return;
    }

    // 6. Remote Playback Status: /api/remote/status
    if (pathname === '/api/remote/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.playbackState || {
        playing: false,
        currentTime: 0,
        duration: 0,
        title: 'AnimeOpen',
        episodeTitle: 'Ready to play',
        cover: '',
        volume: 1,
        muted: false
      }));
      return;
    }

    // 7. Remote Command Endpoint: /api/remote/command
    if (pathname === '/api/remote/command' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const cmd = JSON.parse(body || '{}');
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('player:remote-command', cmd);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }

    // 8. Smart TV / Cast Stream: /api/stream/cast
    if (pathname === '/api/stream/cast') {
      // Allows smart TVs or external video players to directly stream current playing file
      if (this.playbackState && this.playbackState.filePath && fs.existsSync(this.playbackState.filePath)) {
        const filePath = this.playbackState.filePath;
        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'video/mp4';

        const range = req.headers.range;
        if (range) {
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
          const chunksize = (end - start) + 1;
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': contentType
          });
          fs.createReadStream(filePath, { start, end }).pipe(res);
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
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('No active video stream to cast');
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

      // Send to global broadcast 255.255.255.255
      this.udpSocket.send(payload, 0, payload.length, UDP_PORT, '255.255.255.255', () => {});

      // Always also send to local subnet broadcast (e.g. 192.168.0.255) for Wi-Fi routers that filter 255.255.255.255
      if (this.myIp && this.myIp !== '127.0.0.1') {
        const parts = this.myIp.split('.');
        if (parts.length === 4) {
          parts[3] = '255';
          const subnetBroadcast = parts.join('.');
          this.udpSocket.send(payload, 0, payload.length, UDP_PORT, subnetBroadcast, () => {});
        }
      }
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

  getRemoteWebHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>AnimeOpen • Mobile Remote</title>
  <meta name="theme-color" content="#0d0c14">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    body {
      background: #0d0c14;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: env(safe-area-inset-top, 16px) 16px env(safe-area-inset-bottom, 16px);
      user-select: none;
      overflow-x: hidden;
    }
    .remote-wrap {
      width: 100%;
      max-width: 420px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding-top: 10px;
    }
    .top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 16px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      backdrop-filter: blur(12px);
    }
    .brand {
      font-weight: 800;
      font-size: 1.05rem;
      background: linear-gradient(135deg, #ff3366, #da77f2);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .conn-pill {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.72rem;
      color: #00ff88;
      background: rgba(0, 255, 136, 0.12);
      padding: 4px 10px;
      border-radius: 20px;
      border: 1px solid rgba(0, 255, 136, 0.25);
    }
    .pulse {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #00ff88;
      box-shadow: 0 0 8px #00ff88;
      animation: pulseAnim 2s infinite;
    }
    @keyframes pulseAnim { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
    .now-playing {
      background: linear-gradient(145deg, rgba(28, 24, 42, 0.85), rgba(15, 13, 24, 0.95));
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 24px;
      padding: 20px 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      box-shadow: 0 12px 36px rgba(0,0,0,0.55);
      position: relative;
      overflow: hidden;
    }
    .media-cover {
      width: 130px;
      height: 180px;
      border-radius: 14px;
      object-fit: cover;
      margin-bottom: 14px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.6);
      border: 1px solid rgba(255,255,255,0.12);
      background: #1a1726;
    }
    .media-title {
      font-size: 1.15rem;
      font-weight: 700;
      color: #fff;
      margin-bottom: 4px;
      max-width: 100%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .media-ep {
      font-size: 0.85rem;
      color: #b0b0c8;
      max-width: 100%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 8px;
    }
    .scrubber-wrap {
      width: 100%;
      margin-top: 8px;
    }
    .slider {
      width: 100%;
      -webkit-appearance: none;
      height: 6px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.15);
      outline: none;
    }
    .slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #ff3366;
      box-shadow: 0 0 12px #ff3366;
      cursor: pointer;
    }
    .time-labels {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      color: #888;
      margin-top: 6px;
    }
    .primary-controls {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 18px;
      margin-top: 10px;
    }
    .btn-circle {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #fff;
      border-radius: 50%;
      width: 60px;
      height: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn-circle:active {
      transform: scale(0.92);
      background: rgba(255, 255, 255, 0.2);
    }
    .btn-main-play {
      width: 78px;
      height: 78px;
      background: linear-gradient(135deg, #ff3366, #e91e63);
      border: none;
      box-shadow: 0 8px 24px rgba(255, 51, 102, 0.45);
    }
    .btn-main-play:active {
      transform: scale(0.92);
    }
    .actions-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-top: 4px;
    }
    .action-card {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: 12px 6px;
      border-radius: 14px;
      font-size: 0.82rem;
      font-weight: 600;
      color: #e0e0f0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      text-align: center;
    }
    .action-card:active {
      background: rgba(255, 255, 255, 0.14);
      transform: scale(0.95);
    }
    .volume-box {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .btn-cast-tv {
      background: linear-gradient(135deg, rgba(112, 0, 255, 0.2), rgba(0, 229, 255, 0.2));
      border: 1px solid rgba(0, 229, 255, 0.4);
      color: #00e5ff;
      border-radius: 14px;
      padding: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-weight: 600;
      font-size: 0.85rem;
      text-decoration: none;
      cursor: pointer;
    }
    .btn-cast-tv:active {
      transform: scale(0.96);
    }
  </style>
</head>
<body>
  <div class="remote-wrap">
    <div class="top-bar">
      <div class="brand">
        <span>🌸</span>
        <span>AnimeOpen Remote</span>
      </div>
      <div class="conn-pill" id="connStatus">
        <div class="pulse"></div>
        <span id="connText">Connected</span>
      </div>
    </div>

    <div class="now-playing">
      <img id="mediaCover" class="media-cover" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='130' height='180' fill='%23222'%3E%3Crect width='130' height='180'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23666' font-size='14'%3ENo Media%3C/text%3E%3C/svg%3E" alt="Cover" />
      <div class="media-title" id="mediaTitle">Ready to Play</div>
      <div class="media-ep" id="mediaEp">Use AnimeOpen on your PC</div>

      <div class="scrubber-wrap">
        <input type="range" id="seekSlider" class="slider" min="0" max="100" value="0" step="0.1">
        <div class="time-labels">
          <span id="curTime">00:00</span>
          <span id="durTime">00:00</span>
        </div>
      </div>
    </div>

    <div class="primary-controls">
      <button class="btn-circle" id="btnSeekBack" title="Rewind 10s">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg>
      </button>
      <button class="btn-circle btn-main-play" id="btnPlay" title="Play / Pause">
        <svg id="playIcon" viewBox="0 0 24 24" width="36" height="36" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
      </button>
      <button class="btn-circle" id="btnSeekFwd" title="Fast Forward 10s">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6-8.5-6z"/></svg>
      </button>
    </div>

    <div class="actions-grid">
      <button class="action-card" id="btnPrev">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
        <span>Prev Ep</span>
      </button>
      <button class="action-card" id="btnSkipIntro" style="color: #ffb300; border-color: rgba(255, 179, 0, 0.3);">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
        <span>Skip Intro</span>
      </button>
      <button class="action-card" id="btnNext">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm10-12v12h2V6z"/></svg>
        <span>Next Ep</span>
      </button>
      <button class="action-card" id="btnFullscreen">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
        <span>Fullscreen</span>
      </button>
      <button class="action-card" id="btnMute">
        <svg id="muteIcon" viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
        <span id="muteLabel">Mute</span>
      </button>
      <button class="action-card" id="btnCast">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg>
        <span>Cast TV</span>
      </button>
    </div>

    <div class="volume-box">
      <span style="font-size: 1.1rem;">🔉</span>
      <input type="range" id="volSlider" class="slider" min="0" max="1" step="0.05" value="1">
      <span style="font-size: 1.1rem;">🔊</span>
    </div>

    <a id="castTvLink" href="/api/stream/cast" target="_blank" class="btn-cast-tv">
      <span>📺 Stream Directly in Smart TV / VLC</span>
    </a>
  </div>

  <script>
    let isDragging = false;
    let lastDuration = 0;

    const postCmd = (action, params = {}) => {
      try { if (navigator.vibrate) navigator.vibrate(25); } catch (_) {}
      fetch('/api/remote/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...params })
      }).then(() => {
        setTimeout(fetchStatus, 80);
      }).catch(err => {
        console.warn('Remote cmd error:', err);
      });
    };

    const formatTime = (secs) => {
      if (!secs || isNaN(secs)) return '00:00';
      const m = Math.floor(secs / 60);
      const s = Math.floor(secs % 60);
      return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    };

    // Button actions
    document.getElementById('btnPlay').onclick = () => {
      const playIcon = document.getElementById('playIcon');
      // Instant visual flip
      const isCurrentlyPlaying = playIcon.innerHTML.includes('19h4V5H6v14');
      if (isCurrentlyPlaying) {
        playIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
      } else {
        playIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
      }
      postCmd('togglePlay');
    };
    document.getElementById('btnSeekBack').onclick = () => postCmd('seekRel', { delta: -10 });
    document.getElementById('btnSeekFwd').onclick = () => postCmd('seekRel', { delta: 10 });
    document.getElementById('btnPrev').onclick = () => postCmd('prevEp');
    document.getElementById('btnNext').onclick = () => postCmd('nextEp');
    document.getElementById('btnSkipIntro').onclick = () => postCmd('skipIntro');
    document.getElementById('btnFullscreen').onclick = () => postCmd('toggleFullscreen');
    document.getElementById('btnMute').onclick = () => postCmd('toggleMute');
    document.getElementById('btnCast').onclick = () => {
      window.open('/api/stream/cast', '_blank');
    };

    const slider = document.getElementById('seekSlider');
    slider.addEventListener('input', () => {
      isDragging = true;
      document.getElementById('curTime').textContent = formatTime(slider.value);
    });
    slider.addEventListener('change', () => {
      isDragging = false;
      postCmd('seek', { time: parseFloat(slider.value) });
    });

    const volSlider = document.getElementById('volSlider');
    volSlider.addEventListener('input', () => {
      postCmd('setVolume', { volume: parseFloat(volSlider.value) });
    });

    // State Poller (heartbeat every 600ms)
    async function fetchStatus() {
      try {
        const res = await fetch('/api/remote/status');
        if (!res.ok) throw new Error('Offline');
        const st = await res.json();

        document.getElementById('connStatus').style.background = 'rgba(0, 255, 136, 0.12)';
        document.getElementById('connText').textContent = 'Connected';

        document.getElementById('mediaTitle').textContent = st.title || 'AnimeOpen';
        document.getElementById('mediaEp').textContent = st.episodeTitle || 'Ready to stream';

        if (st.cover) {
          document.getElementById('mediaCover').src = st.cover;
        }

        const playIcon = document.getElementById('playIcon');
        if (st.playing) {
          playIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
        } else {
          playIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
        }

        lastDuration = st.duration || 0;
        document.getElementById('durTime').textContent = formatTime(lastDuration);

        if (!isDragging) {
          slider.max = lastDuration || 100;
          slider.value = st.currentTime || 0;
          document.getElementById('curTime').textContent = formatTime(st.currentTime || 0);
        }

        if (st.muted) {
          document.getElementById('muteLabel').textContent = 'Unmute';
        } else {
          document.getElementById('muteLabel').textContent = 'Mute';
        }
      } catch (e) {
        document.getElementById('connStatus').style.background = 'rgba(255, 68, 68, 0.15)';
        document.getElementById('connStatus').style.color = '#ff4444';
        document.getElementById('connText').textContent = 'Reconnecting...';
      }
    }
    setInterval(fetchStatus, 600);
    fetchStatus();
  </script>
</body>
</html>`;
  }
}

module.exports = LanService;
