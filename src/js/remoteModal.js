/**
 * Mobile Remote & Watch Together QR Code Modal Controller
 */

class RemoteModal {
  constructor(app) {
    this.app = app;
    this.modalEl = null;
    this.qrImg = null;
    this.urlDisplay = null;
    this.currentUrl = '';
    this.initDOM();
  }

  initDOM() {
    this.modalEl = document.getElementById('mobileRemoteModal');
    this.qrImg = document.getElementById('remoteQrCodeImg');
    this.urlDisplay = document.getElementById('remoteUrlText');

    document.getElementById('btnCloseRemoteModal')?.addEventListener('click', () => this.close());
    document.getElementById('btnCopyRemoteUrl')?.addEventListener('click', () => this.copyUrl());
    document.getElementById('btnOpenRemoteExternal')?.addEventListener('click', () => this.openInBrowser());

    this.modalEl?.addEventListener('click', (e) => {
      if (e.target === this.modalEl) this.close();
    });
  }

  async open() {
    if (!this.modalEl) return;

    // Immediately sync current player state so mobile remote gets it on connect
    if (this.app.player?.sendPlaybackState) {
      this.app.player.sendPlaybackState();
    }

    if (window.api?.getLanRemoteUrl) {
      const info = await window.api.getLanRemoteUrl();
      if (info && info.url) {
        this.currentUrl = info.url;
        if (this.urlDisplay) this.urlDisplay.textContent = info.url;
        if (this.qrImg) {
          this.qrImg.onerror = () => {
            this.qrImg.style.display = 'none';
          };
          this.qrImg.onload = () => {
            this.qrImg.style.display = 'block';
          };
          // High-res QR code
          this.qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&color=ffffff&bgcolor=161424&data=${encodeURIComponent(info.url)}`;
        }
      }
    }

    this.modalEl.classList.remove('hidden');
  }

  close() {
    if (this.modalEl) this.modalEl.classList.add('hidden');
  }

  copyUrl() {
    if (this.currentUrl && window.api?.copyToClipboard) {
      window.api.copyToClipboard(this.currentUrl);
      this.app.ui.showToast('📋 Remote URL copied to clipboard!');
    }
  }

  openInBrowser() {
    if (this.currentUrl && window.api?.openExternalUrl) {
      window.api.openExternalUrl(this.currentUrl);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RemoteModal;
}
