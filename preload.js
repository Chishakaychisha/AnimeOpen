const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
  getStore: (key) => ipcRenderer.invoke('store:get', key),
  setStore: (keyOrData, value) => ipcRenderer.invoke('store:set-item', keyOrData, value),
  saveStore: (data) => ipcRenderer.invoke('store:set', data),
  scanLibrary: (folderPath) => ipcRenderer.invoke('library:scan', folderPath),
  extractZipEntry: (params) => ipcRenderer.invoke('zip:extract-entry', params),
  extractZipAll: (zipPath) => ipcRenderer.invoke('zip:extract-all', zipPath),
  showInFolder: (filePath) => ipcRenderer.invoke('file:show-in-folder', filePath),
  openExternalPlayer: (params) => ipcRenderer.invoke('external:play', params),
  saveScreenshot: (params) => ipcRenderer.invoke('screenshot:save', params),
  batchRename: (renames) => ipcRenderer.invoke('file:batch-rename', renames),
  selectSubtitle: () => ipcRenderer.invoke('dialog:select-subtitle'),
  selectWallpaper: () => ipcRenderer.invoke('dialog:select-wallpaper'),
  findSubtitles: (filePath) => ipcRenderer.invoke('file:find-subtitles', filePath),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  splashReady: () => ipcRenderer.invoke('splash:ready'),
  
  // Download and cache a remote image locally (returns local file path)
  downloadImageCache: (params) => ipcRenderer.invoke('image:download-cache', params),

  // Convert local system filepath to custom stream URL
  getMediaUrl: (filePath) => {
    return `anime-media://video?path=${encodeURIComponent(filePath)}`;
  },

  // Convert local image path to media URL for display
  getLocalImageUrl: (localPath) => {
    if (!localPath) return null;
    return `anime-media://video?path=${encodeURIComponent(localPath)}`;
  },

  // In-App Browser Download Events & Controls
  pauseDownload: (id) => ipcRenderer.invoke('download:pause', id),
  resumeDownload: (id) => ipcRenderer.invoke('download:resume', id),
  cancelDownload: (id) => ipcRenderer.invoke('download:cancel', id),
  refreshDownloadLink: (params) => ipcRenderer.invoke('download:refresh-link', params),

  onDownloadStarted: (callback) => {
    ipcRenderer.on('download:started', (event, data) => callback(data));
  },
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download:progress', (event, data) => callback(data));
  },
  onDownloadCompleted: (callback) => {
    ipcRenderer.on('download:completed', (event, data) => callback(data));
  },
  onDownloadFailed: (callback) => {
    ipcRenderer.on('download:failed', (event, data) => callback(data));
  },
  onDownloadInterrupted: (callback) => {
    ipcRenderer.on('download:interrupted', (event, data) => callback(data));
  },
  onDownloadPaused: (callback) => {
    ipcRenderer.on('download:paused', (event, data) => callback(data));
  },
  onDownloadResumed: (callback) => {
    ipcRenderer.on('download:resumed', (event, data) => callback(data));
  },
  onDownloadCancelled: (callback) => {
    ipcRenderer.on('download:cancelled', (event, data) => callback(data));
  },

  // Download Queue Concurrency & Priority
  setDownloadConcurrency: (max) => ipcRenderer.invoke('download:set-concurrency', max),
  reorderDownloadQueue: (params) => ipcRenderer.invoke('download:reorder-queue', params),

  // RSS Auto-Downloader
  checkRss: () => ipcRenderer.invoke('rss:check'),
  getRssSubscriptions: () => ipcRenderer.invoke('rss:get-subscriptions'),
  saveRssSubscriptions: (subs) => ipcRenderer.invoke('rss:save-subscriptions', subs),
  onRssNewEpisode: (callback) => {
    ipcRenderer.on('rss:new-episode', (event, data) => callback(data));
  },

  // Online Subtitles Search & Download
  searchOnlineSubtitles: (params) => ipcRenderer.invoke('subtitle:search-online', params),
  downloadOnlineSubtitle: (params) => ipcRenderer.invoke('subtitle:download-online', params),

  // Live Folder Watcher Events
  onLibraryFolderChanged: (callback) => {
    ipcRenderer.on('library:folder-changed', (event, data) => callback(data));
  },

  // Global Keyboard Media Keys
  onPlayerGlobalKey: (callback) => {
    ipcRenderer.on('player:global-key', (event, keyAction) => callback(keyAction));
  },

  // Windows Startup & Wake Monitoring
  getAutoStart: () => ipcRenderer.invoke('app:get-autostart'),
  setAutoStart: (enable) => ipcRenderer.invoke('app:set-autostart', enable),
  onSystemResumed: (callback) => {
    ipcRenderer.on('system:resumed', (event, data) => callback(data));
  },

  // External Links & Clipboard
  openExternalUrl: (url) => ipcRenderer.invoke('shell:open-external', url),
  copyToClipboard: (text) => ipcRenderer.invoke('clipboard:write-text', text),
  startTorrent: (torrentInput) => ipcRenderer.invoke('torrent:start', torrentInput),

  // Local Area Network (LAN) Peer Sharing
  lanGetStatus: () => ipcRenderer.invoke('lan:get-status'),
  lanSetEnabled: (enable) => ipcRenderer.invoke('lan:set-enabled', enable),
  lanSetDeviceName: (name) => ipcRenderer.invoke('lan:set-device-name', name),
  lanUpdateLibrary: (animeList) => ipcRenderer.invoke('lan:update-library', animeList),
  lanFetchPeerLibrary: (params) => ipcRenderer.invoke('lan:fetch-peer-library', params),
  lanDownloadEpisode: (options) => ipcRenderer.invoke('lan:download-episode', options),
  lanCancelDownload: (id) => ipcRenderer.invoke('lan:cancel-download', id),
  lanConnectManual: (params) => ipcRenderer.invoke('lan:connect-manual', params),
  onLanPeersChanged: (callback) => {
    ipcRenderer.on('lan:peers-changed', (event, data) => callback(data));
  },
  onLanDownloadProgress: (callback) => {
    ipcRenderer.on('lan:download-progress', (event, data) => callback(data));
  },
  onLanDownloadCompleted: (callback) => {
    ipcRenderer.on('lan:download-completed', (event, data) => callback(data));
  },

  // Mobile Web Remote Controller
  getLanRemoteUrl: () => ipcRenderer.invoke('lan:get-remote-url'),
  sendPlaybackState: (state) => ipcRenderer.send('player:state-update', state),
  onRemoteCommand: (callback) => {
    ipcRenderer.on('player:remote-command', (event, cmd) => callback(cmd));
  },

  // YouTube / Trailer Video Search
  searchYoutubeVideo: (query) => ipcRenderer.invoke('youtube:search-video', query)
});


