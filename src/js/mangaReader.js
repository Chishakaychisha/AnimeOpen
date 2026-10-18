/**
 * Manga & Comic Reader Companion for AnimeOpen
 * Supports .cbz, .cbr, .zip archives and image folders with Manga (RTL), LTR, and Webtoon vertical reading modes.
 */

class MangaReader {
  constructor(app) {
    this.app = app;
    this.pages = [];
    this.currentPageIndex = 0;
    this.readingMode = 'rtl'; // 'rtl' (Right-to-Left Manga), 'ltr' (Left-to-Right), 'vertical' (Webtoon)
    this.isDualPage = false;
    this.currentChapterName = 'Manga Reader';

    this.initDOM();
    this.bindKeyboard();
  }

  initDOM() {
    this.modalEl = document.getElementById('mangaReaderModal');
    this.canvasContainer = document.getElementById('mangaCanvas');
    this.titleEl = document.getElementById('mangaTitle');
    this.pageIndicator = document.getElementById('mangaPageIndicator');
    this.slider = document.getElementById('mangaPageSlider');

    document.getElementById('btnCloseManga')?.addEventListener('click', () => this.close());
    document.getElementById('btnMangaRtl')?.addEventListener('click', () => this.setMode('rtl'));
    document.getElementById('btnMangaLtr')?.addEventListener('click', () => this.setMode('ltr'));
    document.getElementById('btnMangaVertical')?.addEventListener('click', () => this.setMode('vertical'));
    document.getElementById('btnMangaDual')?.addEventListener('click', () => this.toggleDualPage());
    document.getElementById('btnMangaPrev')?.addEventListener('click', () => this.prevPage());
    document.getElementById('btnMangaNext')?.addEventListener('click', () => this.nextPage());

    this.slider?.addEventListener('input', (e) => {
      this.goToPage(parseInt(e.target.value, 10));
    });
  }

  bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (!this.modalEl || this.modalEl.classList.contains('hidden')) return;

      if (e.key === 'ArrowRight') {
        this.readingMode === 'rtl' ? this.prevPage() : this.nextPage();
      } else if (e.key === 'ArrowLeft') {
        this.readingMode === 'rtl' ? this.nextPage() : this.prevPage();
      } else if (e.key === ' ' || e.key === 'PageDown') {
        this.nextPage();
      } else if (e.key === 'PageUp') {
        this.prevPage();
      } else if (e.key === 'Escape') {
        this.close();
      }
    });
  }

  async openChapter(chapterTitle, imagePaths = []) {
    this.currentChapterName = chapterTitle || 'Manga Chapter';
    this.pages = imagePaths;
    this.currentPageIndex = 0;

    if (this.titleEl) this.titleEl.textContent = this.currentChapterName;
    if (this.slider) {
      this.slider.min = 0;
      this.slider.max = Math.max(0, this.pages.length - 1);
      this.slider.value = 0;
    }

    if (this.modalEl) this.modalEl.classList.remove('hidden');
    this.renderCurrentView();
  }

  close() {
    if (this.modalEl) this.modalEl.classList.add('hidden');
    if (this.canvasContainer) this.canvasContainer.innerHTML = '';
  }

  setMode(mode) {
    this.readingMode = mode;
    ['btnMangaRtl', 'btnMangaLtr', 'btnMangaVertical'].forEach(id => {
      document.getElementById(id)?.classList.remove('active');
    });
    if (mode === 'rtl') document.getElementById('btnMangaRtl')?.classList.add('active');
    if (mode === 'ltr') document.getElementById('btnMangaLtr')?.classList.add('active');
    if (mode === 'vertical') document.getElementById('btnMangaVertical')?.classList.add('active');

    this.renderCurrentView();
  }

  toggleDualPage() {
    this.isDualPage = !this.isDualPage;
    document.getElementById('btnMangaDual')?.classList.toggle('active', this.isDualPage);
    this.renderCurrentView();
  }

  goToPage(index) {
    if (index >= 0 && index < this.pages.length) {
      this.currentPageIndex = index;
      this.renderCurrentView();
    }
  }

  nextPage() {
    const step = this.isDualPage && this.readingMode !== 'vertical' ? 2 : 1;
    if (this.currentPageIndex + step < this.pages.length) {
      this.currentPageIndex += step;
      this.renderCurrentView();
    }
  }

  prevPage() {
    const step = this.isDualPage && this.readingMode !== 'vertical' ? 2 : 1;
    if (this.currentPageIndex - step >= 0) {
      this.currentPageIndex -= step;
      this.renderCurrentView();
    }
  }

  renderCurrentView() {
    if (!this.canvasContainer || !this.pages.length) return;

    if (this.pageIndicator) {
      this.pageIndicator.textContent = `${this.currentPageIndex + 1} / ${this.pages.length}`;
    }
    if (this.slider) {
      this.slider.value = this.currentPageIndex;
    }

    if (this.readingMode === 'vertical') {
      // Continuous Vertical Webtoon Scroll
      this.canvasContainer.className = 'manga-canvas vertical-scroll';
      this.canvasContainer.innerHTML = '';
      this.pages.forEach((src, idx) => {
        const img = document.createElement('img');
        img.className = 'manga-page-img webtoon';
        img.src = src;
        img.loading = idx < 4 ? 'eager' : 'lazy';
        this.canvasContainer.appendChild(img);
      });
      return;
    }

    // Paged View (Single or Dual Page)
    this.canvasContainer.className = 'manga-canvas paged-view';
    this.canvasContainer.innerHTML = '';

    const pageWrap = document.createElement('div');
    pageWrap.className = `manga-page-wrap ${this.isDualPage ? 'dual-spread' : 'single-page'}`;

    const p1 = this.pages[this.currentPageIndex];
    const p2 = this.isDualPage && this.currentPageIndex + 1 < this.pages.length ? this.pages[this.currentPageIndex + 1] : null;

    if (this.readingMode === 'rtl' && p2) {
      // In Manga RTL, second page is on left, first page is on right
      const img2 = document.createElement('img');
      img2.className = 'manga-page-img';
      img2.src = p2;
      pageWrap.appendChild(img2);

      const img1 = document.createElement('img');
      img1.className = 'manga-page-img';
      img1.src = p1;
      pageWrap.appendChild(img1);
    } else {
      const img1 = document.createElement('img');
      img1.className = 'manga-page-img';
      img1.src = p1;
      pageWrap.appendChild(img1);

      if (p2) {
        const img2 = document.createElement('img');
        img2.className = 'manga-page-img';
        img2.src = p2;
        pageWrap.appendChild(img2);
      }
    }

    this.canvasContainer.appendChild(pageWrap);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MangaReader;
}
