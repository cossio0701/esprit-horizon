/**
 * Unified Carousel Web Component
 * 
 * Combines functionality from carousel-component and infinite-carousel
 * with improved accessibility, performance, and maintainability.
 * 
 * @extends HTMLElement
 * @fires carousel:slide-change - When slide changes with { index, slide }
 * @fires carousel:reach-start - When reaching first slide
 * @fires carousel:reach-end - When reaching last slide
 * 
 * @attr {string} loop - Enable infinite loop ("true" | "false")
 * @attr {number} columns-desktop - Slides visible on desktop (supports decimals)
 * @attr {number} columns-mobile - Slides visible on mobile (supports decimals)
 * @attr {number} gap - Gap between slides in pixels
 * @attr {boolean} show-arrows - Show navigation arrows
 * @attr {boolean} show-dots - Show pagination dots
 * @attr {boolean} show-thumbs-arrows - Show arrows for thumbnails
 * @attr {string} thumbs-mobile - Thumbnail position on mobile (top|bottom|left|right|none)
 * @attr {string} thumbs-desktop - Thumbnail position on desktop (top|bottom|left|right|none)
 * @attr {boolean} autoplay - Enable autoplay
 * @attr {number} autoplay-speed - Autoplay speed in milliseconds
 */
class Carousel extends HTMLElement {
  static get observedAttributes() {
    return [
      'columns-desktop',
      'columns-mobile',
      'show-arrows',
      'show-dots',
      'show-thumbs-arrows',
      'gap',
      'loop',
      'thumbs-mobile',
      'thumbs-desktop',
      'autoplay',
      'autoplay-speed'
    ];
  }

  constructor() {
    super();
    
    /** @type {AbortController} */
    this.#abortController = new AbortController();
    
    /** @type {HTMLElement | null} */
    this.scroller = null;
    
    /** @type {HTMLElement[]} */
    this.slides = [];
    
    /** @type {HTMLElement[]} */
    this.dots = [];
    
    /** @type {HTMLElement[]} */
    this.thumbs = [];
    
    /** @type {HTMLButtonElement | null} */
    this.prevBtn = null;
    
    /** @type {HTMLButtonElement | null} */
    this.nextBtn = null;
    
    /** @type {number} */
    this.currentIndex = 0;
    
    /** @type {number} */
    this.logicalIndex = 0;
    
    /** @type {number} */
    this.originalCount = 0;
    
    /** @type {number} */
    this.clonesCount = 2;
    
    /** @type {number | null} */
    this.scrollTimeout = null;
    
    /** @type {number | null} */
    this.autoplayInterval = null;
    
    /** @type {boolean} */
    this.isLoop = false;
    
    /** @type {boolean} */
    this.isJumping = false;
    
    /** @type {boolean} */
    this._scrollListenerAttached = false;
    
    /** @type {boolean} */
    this.#isInitialized = false;
    
    /** @type {number} */
    this.#gapWidth = 16;
    
    /** @type {boolean} */
    this.#isScrolling = false;
    
    /** @type {ResizeObserver | null} */
    this.#resizeObserver = null;
    
    // Bind methods
    this.onMouseEnter = this.stopAutoplay.bind(this);
    this.onMouseLeave = this.startAutoplay.bind(this);
    this.onScroll = this.#handleScroll.bind(this);
  }

  #abortController;
  #isInitialized;
  #resizeObserver;
  #gapWidth;
  #isScrolling;

  connectedCallback() {
    const { signal } = this.#abortController;
    
    this.init();
    
    this.addEventListener('mouseenter', this.onMouseEnter, { signal });
    this.addEventListener('mouseleave', this.onMouseLeave, { signal });
    this.addEventListener('keydown', this.#handleKeydown.bind(this), { signal });
    
    this.#setupResizeObserver();
  }

  disconnectedCallback() {
    this.#abortController.abort();
    this.stopAutoplay();
    
    if (this.#resizeObserver) {
      this.#resizeObserver.disconnect();
      this.#resizeObserver = null;
    }
    
    this.dispatchEvent(new CustomEvent('carousel:destroy', { bubbles: true }));
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;

    if (name === 'loop') {
      this.init();
      return;
    }

    if (name === 'autoplay' || name === 'autoplay-speed') {
      this.startAutoplay();
      return;
    }

    this.renderAttributes();
  }

  /**
   * Public method to force a full re-initialization
   * Call this after DOM mutations that preserve the element
   */
  reinit() {
    this._scrollListenerAttached = false;
    this.#isInitialized = false;
    this.init();
  }

  init() {
    this.scroller = this.querySelector('[role="list"]');
    if (!this.scroller) return;

    this.#cleanupClones();

    this.slides = Array.from(this.scroller.querySelectorAll('[role="listitem"]'));
    this.originalCount = this.slides.length;
    this.isLoop = this.getAttribute('loop') === 'true' && this.originalCount > 1;

    if (this.isLoop) {
      this.#setupLoop();
    }

    this.#initThumbs();
    this.#buildDots();
    this.#buildThumbsArrows();

    this.prevBtn = this.querySelector('[name="previous"]');
    this.nextBtn = this.querySelector('[name="next"]');

    if (!this._scrollListenerAttached) {
      this.scroller.addEventListener('scroll', this.onScroll, { passive: true });
      this._scrollListenerAttached = true;
    }

    if (this.prevBtn) {
      this.prevBtn.addEventListener('click', () => {
        this.stopAutoplay();
        this.scrollStep(-1);
      });
    }
    
    if (this.nextBtn) {
      this.nextBtn.addEventListener('click', () => {
        this.stopAutoplay();
        this.scrollStep(1);
      });
    }

    if (this.isLoop) {
      requestAnimationFrame(() => {
        this.scrollToLogicalIndex(0, false);
      });
    }

    this.updateControls();
    this.startAutoplay();
    this.renderAttributes();
    
    this.#isInitialized = true;
  }

  #cleanupClones() {
    this.scroller?.querySelectorAll('[data-clone]').forEach(clone => clone.remove());
  }

  #setupLoop() {
    const lastClones = this.slides.slice(-this.clonesCount).map(slide => {
      const clone = slide.cloneNode(true);
      clone.setAttribute('data-clone', 'last');
      clone.setAttribute('aria-hidden', 'true');
      clone.setAttribute('tabindex', '-1');
      return clone;
    });

    const firstClones = this.slides.slice(0, this.clonesCount).map(slide => {
      const clone = slide.cloneNode(true);
      clone.setAttribute('data-clone', 'first');
      clone.setAttribute('aria-hidden', 'true');
      clone.setAttribute('tabindex', '-1');
      return clone;
    });

    if (!this.scroller) return;
    
    lastClones.reverse().forEach(clone => this.scroller?.prepend(clone));
    firstClones.forEach(clone => this.scroller?.append(clone));

    this.slides = Array.from(this.scroller.querySelectorAll('[role="listitem"]'));
  }

  #initThumbs() {
    this.thumbs = Array.from(this.querySelectorAll('.carousel-thumb'));
    const { signal } = this.#abortController;
    
    this.thumbs.forEach((thumb, index) => {
      thumb.addEventListener('click', () => this.scrollToLogicalIndex(index), { signal });
    });
  }

  #buildDots() {
    const existing = this.querySelector('.carousel-dots');
    if (existing) existing.remove();

    if (this.originalCount <= 1) {
      this.dots = [];
      return;
    }

    const container = document.createElement('div');
    container.className = 'carousel-dots';

    for (let i = 0; i < this.originalCount; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('aria-selected', String(i === 0));
      btn.setAttribute('aria-label', `Go to slide ${i + 1}`);
      btn.addEventListener('click', () => this.scrollToLogicalIndex(i));
      container.appendChild(btn);
    }

    this.appendChild(container);
    this.dots = Array.from(container.querySelectorAll('button'));
  }

  #buildThumbsArrows() {
    const existingNav = this.querySelector('.carousel-thumbs-nav');
    if (existingNav) {
      const thumbsInside = existingNav.querySelector('.carousel-thumbs');
      if (thumbsInside) existingNav.before(thumbsInside);
      existingNav.remove();
    }

    const thumbsContainer = this.querySelector('.carousel-thumbs');
    if (!thumbsContainer || this.thumbs.length <= 1) return;

    const nav = document.createElement('div');
    nav.className = 'carousel-thumbs-nav';
    thumbsContainer.before(nav);
    nav.appendChild(thumbsContainer);

    const prevArrow = this.#createThumbArrow('prev', 'Previous');
    const nextArrow = this.#createThumbArrow('next', 'Next');

    nav.insertBefore(prevArrow, thumbsContainer);
    nav.appendChild(nextArrow);
  }

  #createThumbArrow(direction, label) {
    const arrow = document.createElement('button');
    arrow.type = 'button';
    arrow.className = `carousel-thumbs-arrow carousel-thumbs-arrow--${direction}`;
    arrow.setAttribute('aria-label', label);
    
    const svgContent = direction === 'prev'
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>';
    
    arrow.innerHTML = svgContent;
    arrow.addEventListener('click', () => this.scrollStep(direction === 'prev' ? -1 : 1));
    
    return arrow;
  }

  #setupResizeObserver() {
    this.#resizeObserver = new ResizeObserver(
      this.#debounce(() => {
        this.#updateSlideWidth();
      }, 150)
    );
    this.#resizeObserver.observe(this);
  }

  #debounce(func, wait) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  #updateSlideWidth() {
    const firstSlide = this.slides[0];
    if (firstSlide) {
      this.#gapWidth = parseFloat(this.getAttribute('gap') || '0') || 0;
    }
  }

  /**
   * @param {number} step
   */
  scrollStep(step) {
    let nextIndex = this.currentIndex + step;

    if (!this.isLoop) {
      nextIndex = Math.max(0, Math.min(this.slides.length - 1, nextIndex));
    }

    this.scrollToIndex(nextIndex);
  }

  /**
   * @param {number} logicalIndex
   * @param {boolean} [smooth=true]
   */
  scrollToLogicalIndex(logicalIndex, smooth = true) {
    const targetIndex = this.isLoop ? logicalIndex + this.clonesCount : logicalIndex;
    this.scrollToIndex(targetIndex, smooth);
  }

  /**
   * @param {number} index
   * @param {boolean} [smooth=true]
   */
  scrollToIndex(index, smooth = true) {
    if (!this.scroller) return;
    
    const slide = this.slides[index];
    if (!slide) return;

    this.#isScrolling = true;
    this.scroller.scrollTo({
      left: slide.offsetLeft,
      behavior: smooth ? 'smooth' : 'instant'
    });
    
    setTimeout(() => { this.#isScrolling = false; }, smooth ? 300 : 50);
  }

  #handleScroll() {
    if (this.isJumping) return;

    if (this.scrollTimeout) window.clearTimeout(this.scrollTimeout);

    this.scrollTimeout = window.setTimeout(() => {
      this.#handleInfiniteJump();
      this.#updateActiveIndex();
    }, 50);
  }

  #handleInfiniteJump() {
    if (!this.isLoop || !this.scroller || this.slides.length === 0 || !this.#isInitialized) return;

    const scrollLeft = this.scroller.scrollLeft;
    const firstSlide = this.slides[0];
    if (!firstSlide) return;

    const slideWidth = firstSlide.offsetWidth;
    const gap = parseFloat(getComputedStyle(this.scroller).gap) || this.#gapWidth || 0;
    const slideWidthWithGap = slideWidth + gap;
    const totalWidth = this.scroller.scrollWidth;
    const containerWidth = this.scroller.offsetWidth;

    if (scrollLeft < slideWidthWithGap) {
      this.isJumping = true;
      this.scroller.scrollTo({
        left: scrollLeft + (this.originalCount * slideWidthWithGap),
        behavior: 'instant'
      });
      setTimeout(() => { this.isJumping = false; }, 50);
      
      this.dispatchEvent(new CustomEvent('carousel:reach-end', { bubbles: true }));
    }
    else if (scrollLeft > totalWidth - containerWidth - slideWidthWithGap) {
      this.isJumping = true;
      this.scroller.scrollTo({
        left: scrollLeft - (this.originalCount * slideWidthWithGap),
        behavior: 'instant'
      });
      setTimeout(() => { this.isJumping = false; }, 50);
      
      this.dispatchEvent(new CustomEvent('carousel:reach-start', { bubbles: true }));
    }
  }

  #updateActiveIndex() {
    if (!this.scroller) return;
    
    const scrollLeft = this.scroller.scrollLeft;
    const slideWidth = this.slides[0]?.offsetWidth || this.scroller.offsetWidth;
    const gap = parseFloat(getComputedStyle(this.scroller).gap) || this.#gapWidth || 0;
    const slideWidthWithGap = slideWidth + gap;
    const index = Math.round(scrollLeft / slideWidthWithGap);

    if (index !== this.currentIndex) {
      this.currentIndex = index;

      if (this.isLoop) {
        this.logicalIndex = (index - this.clonesCount + this.originalCount) % this.originalCount;
      } else {
        this.logicalIndex = index;
      }

      this.updateControls();
      
      this.dispatchEvent(new CustomEvent('carousel:slide-change', {
        detail: { 
          index: this.logicalIndex,
          slide: this.slides[index]
        },
        bubbles: true
      }));
      
      this.#announceSlide();
    }
  }

  #announceSlide() {
    const statusElement = this.querySelector('[aria-live="polite"]');
    if (!statusElement) return;
    
    const slide = this.slides[this.currentIndex];
    if (!slide) return;
    
    const productTitle = slide.querySelector('.product-card-simple__title')?.textContent?.trim();
    const total = this.originalCount;
    
    statusElement.textContent = `Producto ${this.logicalIndex + 1} de ${total}${productTitle ? ': ' + productTitle : ''}`;
  }

  #handleKeydown(e) {
    if (e.target !== this.scroller) return;
    
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        this.scrollStep(-1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        this.scrollStep(1);
        break;
      case 'Home':
        e.preventDefault();
        this.scrollToLogicalIndex(0);
        break;
      case 'End':
        e.preventDefault();
        this.scrollToLogicalIndex(this.originalCount - 1);
        break;
    }
  }

  updateControls() {
    this.dots.forEach((dot, index) => {
      dot.setAttribute('aria-selected', String(index === this.logicalIndex));
    });

    if (this.thumbs.length > 0) {
      this.thumbs.forEach((thumb, index) => {
        thumb.setAttribute('aria-selected', String(index === this.logicalIndex));
      });

      const activeThumb = this.thumbs[this.logicalIndex];
      if (activeThumb) {
        activeThumb.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      }
    }

    if (this.prevBtn) {
      this.prevBtn.disabled = !this.isLoop && this.logicalIndex === 0;
    }
    
    if (this.nextBtn) {
      this.nextBtn.disabled = !this.isLoop && this.logicalIndex >= this.originalCount - 1;
    }
  }

  renderAttributes() {
    const desktopCols = parseFloat(this.getAttribute('columns-desktop') ?? '1') || 1;
    const mobileCols = parseFloat(this.getAttribute('columns-mobile') || '1') || 1;
    const gap = parseFloat(this.getAttribute('gap') || '0') || 0;
    const showArrows = this.getAttribute('show-arrows') !== 'false';
    const showDots = this.getAttribute('show-dots') === 'true';
    const showThumbsArrows = this.getAttribute('show-thumbs-arrows') === 'true';

    this.style.setProperty('--slides-per-view-desktop', String(desktopCols));
    this.style.setProperty('--slides-per-view-mobile', String(mobileCols));
    this.style.setProperty('--carousel-gap', `${gap}px`);

    this.toggleAttribute('has-arrows', showArrows);
    this.toggleAttribute('has-dots', showDots);

    const prevBtn = this.querySelector('[name="previous"]');
    const nextBtn = this.querySelector('[name="next"]');
    if (prevBtn) prevBtn.toggleAttribute('hidden', !showArrows);
    if (nextBtn) nextBtn.toggleAttribute('hidden', !showArrows);

    const dotsContainer = this.querySelector('.carousel-dots');
    if (dotsContainer) dotsContainer.toggleAttribute('hidden', !showDots);

    this.querySelectorAll('.carousel-thumbs-arrow').forEach(arrow => {
      arrow.toggleAttribute('hidden', !showThumbsArrows);
    });
  }

  startAutoplay() {
    this.stopAutoplay();
    
    if (this.getAttribute('autoplay') !== 'true' || this.originalCount <= 1) return;

    const speed = parseInt(this.getAttribute('autoplay-speed') || '5000', 10);
    
    this.autoplayInterval = window.setInterval(() => {
      if (this.isLoop) {
        this.scrollStep(1);
      } else {
        if (this.logicalIndex >= this.originalCount - 1) {
          this.scrollToLogicalIndex(0);
        } else {
          this.scrollStep(1);
        }
      }
    }, speed);
  }

  stopAutoplay() {
    if (this.autoplayInterval) {
      window.clearInterval(this.autoplayInterval);
      this.autoplayInterval = null;
    }
  }

  /**
   * Get current slide index (0-based)
   * @returns {number}
   */
  getCurrentIndex() {
    return this.logicalIndex;
  }

  /**
   * Get total number of original slides (excluding clones)
   * @returns {number}
   */
  getTotalSlides() {
    return this.originalCount;
  }

  /**
   * Check if carousel is in infinite loop mode
   * @returns {boolean}
   */
  isLooping() {
    return this.isLoop;
  }
}

if (!customElements.get('carousel-component')) {
  customElements.define('carousel-component', Carousel);
}

export { Carousel };
