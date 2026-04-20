/**
 * Unified Carousel Web Component — CSS Scroll Snap + Clone-based Infinite Loop
 * @extends HTMLElement
 * @fires carousel:slide-change { index, slide }
 * @fires carousel:slideChange { index, slide } (camelCase alias for PDP compat)
 * @fires carousel:reach-start
 * @fires carousel:reach-end
 * @fires carousel:destroy
 */
class Carousel extends HTMLElement {
  #scroller = null;
  #slides = [];
  #clones = { start: [], end: [] };
  #currentIndex = 0;
  #isScrolling = false;
  #isJumping = false;
  #isWrapping = false;
  #jumpGen = 0;
  #autoplayTimer = null;
  #abortController = new AbortController();
  #total = 0;
  #isLoop = false;
  #slidesPerView = 1;

  get logicalIndex() { return this.getCurrentIndex(); }
  set logicalIndex(v) { this.scrollToLogicalIndex(v, false); }

  static get observedAttributes() {
    return [
      'loop', 'columns-desktop', 'columns-mobile', 'gap',
      'show-arrows', 'show-dots', 'show-thumbs-arrows',
      'thumbs-mobile', 'thumbs-desktop', 'autoplay', 'autoplay-speed',
      'lazy-init',
    ];
  }

  #lazyObserver = null;
  #isInitialized = false;

  connectedCallback() {
    if (this.hasAttribute('lazy-init')) {
      this.classList.add('carousel--pending');
      this.#createLazyObserver();
    } else {
      this.#init();
    }
    const s = this.#abortController.signal;
    this.addEventListener('mouseenter', () => this.stopAutoplay(), { signal: s });
    this.addEventListener('mouseleave', () => this.startAutoplay(), { signal: s });
    this.addEventListener('focusin', () => this.stopAutoplay(), { signal: s });
    this.addEventListener('focusout', () => this.startAutoplay(), { signal: s });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stopAutoplay(); else this.startAutoplay();
    }, { signal: s });
    window.addEventListener('resize', () => {
      this.#slidesPerView = this.#calculateSlidesPerView();
      if (this.#isInitialized) {
        this.#init();
      }
    }, { signal: s });
  }

  #createLazyObserver() {
    this.#lazyObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          this.classList.remove('carousel--pending');
          this.#init();
          this.#lazyObserver?.disconnect();
          this.#lazyObserver = null;
        }
      },
      { rootMargin: '200px 0px' }
    );
    this.#lazyObserver.observe(this);
  }

  disconnectedCallback() {
    this.#abortController.abort();
    this.#lazyObserver?.disconnect();
    this.#lazyObserver = null;
    this.#isInitialized = false;
    this.stopAutoplay();
    this.dispatchEvent(new CustomEvent('carousel:destroy', { bubbles: true }));
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (['loop', 'autoplay', 'autoplay-speed'].includes(name) && this.isConnected) this.#init();
    this.#renderAttributes();
  }

  #init() {
    if (this.#isInitialized) return;
    this.#isInitialized = true;

    this.#scroller = this.querySelector('[role="list"]');
    if (!this.#scroller) return;

    this.#clones.start.forEach(c => c.remove());
    this.#clones.end.forEach(c => c.remove());
    this.#clones = { start: [], end: [] };

    this.#slides = this.#scroller.querySelectorAll('[role="listitem"]');
    this.#total = this.#slides.length;
    this.#isLoop = this.getAttribute('loop') === 'true' && this.#total > 1;
    this.#slidesPerView = this.#calculateSlidesPerView();

    this.#setupScrollSnap();
    if (this.#isLoop) this.#buildClones();
    this.#buildSentinels();
    this.#buildDots();
    this.#setupThumbs();
    this.#buildThumbsArrows();
    this.#setupArrows();
    this.#setupKeyboard();
    this.startAutoplay();
    this.#renderAttributes();
    this.#updateControls();

    if (this.#isLoop) {
      const slidesPerView = Math.ceil(this.#slidesPerView);
      const startClones = this.#scroller.querySelectorAll('[data-clone="start"]');
      this.#currentIndex = startClones.length;
      this.#scroller.scrollLeft = this.#slides[this.#currentIndex].offsetLeft;
    } else {
      this.#currentIndex = 0;
    }
  }

  #calculateSlidesPerView() {
    const isDesktop = window.innerWidth >= 768;
    const attr = isDesktop ? 'columns-desktop' : 'columns-mobile';
    return parseFloat(this.getAttribute(attr) ?? '1') || 1;
  }

  #buildClones() {
    const slidesPerView = Math.ceil(this.#slidesPerView);

    for (let i = 0; i < slidesPerView; i++) {
      const clone = this.#slides[i].cloneNode(true);
      clone.setAttribute('data-clone', 'end');
      clone.setAttribute('aria-hidden', 'true');
      this.#scroller.appendChild(clone);
      this.#clones.end.push(clone);
    }

    for (let i = this.#total - slidesPerView; i < this.#total; i++) {
      const clone = this.#slides[i].cloneNode(true);
      clone.setAttribute('data-clone', 'start');
      clone.setAttribute('aria-hidden', 'true');
      this.#scroller.insertBefore(clone, this.#scroller.firstChild);
      this.#clones.start.push(clone);
    }

    this.#slides = this.#scroller.querySelectorAll('[role="listitem"]');
  }

  #buildSentinels() {
    if (!this.#isLoop) return;
    const startClones = this.#scroller.querySelectorAll('[data-clone="start"]');
    const endClones = this.#scroller.querySelectorAll('[data-clone="end"]');
    startClones[0]?.setAttribute('data-sentinel', 'first');
    endClones[endClones.length - 1]?.setAttribute('data-sentinel', 'last');
  }

  #buildDots() {
    this.querySelector('.carousel-dots')?.remove();
    if (this.#total <= 1) return;
    const s = this.#abortController.signal;
    const container = Object.assign(document.createElement('div'), {
      className: 'carousel-dots',
      role: 'tablist'
    });
    for (let i = 0; i < this.#total; i++) {
      const btn = Object.assign(document.createElement('button'), { type: 'button', role: 'tab' });
      btn.setAttribute('aria-label', `Go to slide ${i + 1}`);
      btn.addEventListener('click', () => {
        this.stopAutoplay();
        this.scrollToLogicalIndex(i);
      }, { signal: s });
      container.appendChild(btn);
    }
    this.appendChild(container);
  }

  #setupThumbs() {
    const thumbs = Array.from(this.querySelectorAll('.carousel-thumb'));
    const s = this.#abortController.signal;

    thumbs.forEach((thumb, index) => {
      thumb.addEventListener('click', () => {
        this.stopAutoplay();
        this.scrollToLogicalIndex(index);
      }, { signal: s });
    });
  }

  #buildThumbsArrows() {
    if (this.getAttribute('show-thumbs-arrows') !== 'true') return;

    // Remove existing nav wrapper if present (re-init safety)
    const existingNav = this.querySelector('.carousel-thumbs-nav');
    if (existingNav) {
      const thumbsInside = existingNav.querySelector('.carousel-thumbs');
      if (thumbsInside) existingNav.before(thumbsInside);
      existingNav.remove();
    }

    const thumbsContainer = this.querySelector('.carousel-thumbs');
    if (!thumbsContainer) return;

    const thumbCount = thumbsContainer.querySelectorAll('.carousel-thumb').length;
    if (thumbCount <= 1) return;

    // Wrap thumbs in a nav container
    const nav = document.createElement('div');
    nav.className = 'carousel-thumbs-nav';
    thumbsContainer.before(nav);
    nav.appendChild(thumbsContainer);

    // Create arrows
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
    arrow.addEventListener('click', () => {
      this.stopAutoplay();
      this.scrollStep(direction === 'prev' ? -1 : 1);
    });

    return arrow;
  }

  #setupScrollSnap() {
    if (!this.#scroller) return;
    const gap = parseFloat(this.getAttribute('gap') ?? '16') ?? 16;
    const spv = this.#slidesPerView;

    Object.assign(this.#scroller.style, {
      scrollSnapType: 'x mandatory',
      overflowX: 'auto',
      overflowY: 'hidden',
      scrollbarWidth: 'none',
      WebkitOverflowScrolling: 'touch',
      gap: `${gap}px`,
    });

    const basis = `calc((100% - (${spv} - 1) * ${gap}px) / ${spv})`;
    this.#slides.forEach(s => Object.assign(s.style, {
      scrollSnapAlign: 'start',
      flex: `0 0 ${basis}`,
      marginRight: '0',
    }));

    if (this.#isLoop) {
      this.#scroller.addEventListener('scroll', () => this.#onScroll(), {
        signal: this.#abortController.signal
      });
    }
  }

  #setupArrows() {
    const s = this.#abortController.signal;
    const prevBtn = this.querySelector('[name="previous"]');
    const nextBtn = this.querySelector('[name="next"]');

    prevBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.stopAutoplay();
      this.scrollStep(-1);
    }, { signal: s });

    nextBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.stopAutoplay();
      this.scrollStep(1);
    }, { signal: s });
  }

  #setupKeyboard() {
    if (!this.#scroller) return;
    this.#scroller.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.scrollStep(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.scrollStep(1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        this.scrollToLogicalIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        this.scrollToLogicalIndex(this.#total - 1);
      }
    }, { signal: this.#abortController.signal });
  }

  #onScroll() {
    if (this.#isWrapping) return;

    const scrollLeft = this.#scroller.scrollLeft;
    const slidesPerView = Math.ceil(this.#slidesPerView);
    const currentIndex = this.#findClosestSlideIndex(scrollLeft);
    const firstEndClone = this.#total + slidesPerView;
    const inStartClones = currentIndex < slidesPerView;
    const inEndClones = currentIndex >= firstEndClone;

    if (inStartClones && this.#isLoop) {
      this.#isWrapping = true;
      this.#isJumping = true;
      this.#jumpGen++;
      const targetIndex = this.#total + slidesPerView - 1;
      const originalSnap = this.#scroller.style.scrollSnapType;
      this.#scroller.style.scrollSnapType = 'none';
      this.#scroller.scrollTo({
        left: this.#slides[targetIndex].offsetLeft,
        behavior: 'instant'
      });
      this.#currentIndex = targetIndex;
      this.#waitForScrollEnd(() => {
        requestAnimationFrame(() => {
          this.#scroller.style.scrollSnapType = originalSnap || 'x mandatory';
        });
        this.#isWrapping = false;
        this.#isJumping = false;
        this.#updateControls();
        this.#dispatch();
      });
      return;
    }

    if (inEndClones && this.#isLoop) {
      this.#isWrapping = true;
      this.#isJumping = true;
      this.#jumpGen++;
      const targetIndex = slidesPerView;
      const originalSnap = this.#scroller.style.scrollSnapType;
      this.#scroller.style.scrollSnapType = 'none';
      this.#scroller.scrollTo({
        left: this.#slides[targetIndex].offsetLeft,
        behavior: 'instant'
      });
      this.#currentIndex = targetIndex;
      this.#waitForScrollEnd(() => {
        requestAnimationFrame(() => {
          this.#scroller.style.scrollSnapType = originalSnap || 'x mandatory';
        });
        this.#isWrapping = false;
        this.#isJumping = false;
        this.#updateControls();
        this.#dispatch();
      });
      return;
    }

    if (this.#isJumping) return;

    if (currentIndex !== this.#currentIndex) {
      this.#currentIndex = currentIndex;
      this.#updateControls();
      this.#dispatch();
    }
  }

  scrollStep(direction) {
    if (this.#isJumping) return;
    const next = this.#currentIndex + direction;
    this.#jumpTo(next, true);
  }

  scrollToIndex(index, smooth = true) {
    const slidesPerView = Math.ceil(this.#slidesPerView);
    const targetIndex = index + slidesPerView;
    if (targetIndex < 0 || targetIndex >= this.#slides.length) return;
    this.#jumpTo(targetIndex, smooth);
  }

  scrollToLogicalIndex(index, smooth = true) {
    this.scrollToIndex(index, smooth);
  }

  #jumpTo(index, smooth) {
    if (!this.#scroller) return;
    const slide = this.#slides[index];
    if (!slide) return;

    this.#isJumping = true;
    const gen = ++this.#jumpGen;

    const originalSnap = this.#scroller.style.scrollSnapType;
    this.#scroller.style.scrollSnapType = 'none';

    this.#scroller.scrollTo({
      left: slide.offsetLeft,
      behavior: smooth ? 'smooth' : 'instant'
    });

    const fallbackMs = smooth ? 300 : 50;
    this.#waitForScrollEnd(() => {
      if (gen !== this.#jumpGen) return;
      requestAnimationFrame(() => {
        this.#scroller.style.scrollSnapType = originalSnap || 'x mandatory';
      });
      this.#currentIndex = index;
      this.#updateControls();
      this.#dispatch();
      this.#isJumping = false;
    }, fallbackMs);
  }

  #updateControls() {
    const slidesPerView = Math.ceil(this.#slidesPerView);
    const realIndex = this.#currentIndex - slidesPerView;

    // Sync dots
    this.querySelectorAll('.carousel-dots button').forEach((d, i) => {
      d.setAttribute('aria-selected', String(i === realIndex));
    });

    // Sync thumbs & auto-scroll active into view
    const thumbs = this.querySelectorAll('.carousel-thumb');
    if (thumbs.length > 0) {
      thumbs.forEach((thumb, index) => {
        thumb.setAttribute('aria-selected', String(index === realIndex));
      });

      const activeThumb = thumbs[realIndex];
      if (activeThumb) {
        activeThumb.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      }
    }

    const prev = this.querySelector('[name="previous"]');
    const next = this.querySelector('[name="next"]');
    if (prev && !this.#isLoop) prev.disabled = realIndex === 0;
    if (next && !this.#isLoop) next.disabled = realIndex >= this.#total - slidesPerView;
  }

  #announce() {
    let live = this.querySelector('[aria-live]');
    if (!live) {
      live = document.createElement('div');
      live.className = 'sr-only';
      live.setAttribute('aria-live', 'polite');
      live.setAttribute('aria-atomic', 'true');
      Object.assign(live.style, {
        position: 'absolute',
        width: '1px',
        height: '1px',
        overflow: 'hidden',
        clip: 'rect(0,0,0,0)'
      });
      this.appendChild(live);
    }
    const slidesPerView = Math.ceil(this.#slidesPerView);
    const realIndex = this.#currentIndex - slidesPerView;
    const slide = this.#slides[this.#currentIndex];
    const title = slide?.querySelector('.product-card-simple__title, .product-title')?.textContent?.trim();
    live.textContent = title
      ? `Producto ${realIndex + 1} de ${this.#total}: ${title}`
      : `Producto ${realIndex + 1} de ${this.#total}`;
  }

  #dispatch() {
    const slidesPerView = Math.ceil(this.#slidesPerView);
    const realIndex = this.#currentIndex - slidesPerView;
    const slide = this.#slides[this.#currentIndex];
    const detail = { index: realIndex, slide };
    this.dispatchEvent(new CustomEvent('carousel:slide-change', { detail, bubbles: true }));
    this.dispatchEvent(new CustomEvent('carousel:slideChange', { detail, bubbles: true }));
  }

  startAutoplay() {
    this.stopAutoplay();
    if (this.getAttribute('autoplay') !== 'true' || this.#total <= 1) return;
    const speed = parseInt(this.getAttribute('autoplay-speed') || '5000', 10);
    this.#autoplayTimer = setInterval(() => {
      this.scrollStep(1);
    }, speed);
  }

  stopAutoplay() {
    if (this.#autoplayTimer) {
      clearInterval(this.#autoplayTimer);
      this.#autoplayTimer = null;
    }
  }

  getCurrentIndex() {
    const slidesPerView = Math.ceil(this.#slidesPerView);
    return this.#currentIndex - slidesPerView;
  }

  getTotalSlides() {
    return this.#total;
  }

  isLooping() {
    return this.#isLoop;
  }

  updateActiveIndex() {
    if (!this.#scroller) return;
    const slidesPerView = Math.ceil(this.#slidesPerView);
    const closestIndex = this.#findClosestSlideIndex(this.#scroller.scrollLeft);
    const c = Math.max(0, Math.min(this.#total - 1, closestIndex - slidesPerView));
    if (c !== this.#currentIndex - slidesPerView) {
      this.#currentIndex = c + slidesPerView;
      this.#updateControls();
    }
  }

  reinit() {
    this.#abortController.abort();
    this.#abortController = new AbortController();
    this.#isInitialized = false;
    this.#slidesPerView = this.#calculateSlidesPerView();
    this.#init();
  }

  destroy() {
    this.disconnectedCallback();
  }

  #findClosestSlideIndex(scrollLeft) {
    let closest = 0;
    let minDist = Infinity;
    for (let i = 0; i < this.#slides.length; i++) {
      const dist = Math.abs(this.#slides[i].offsetLeft - scrollLeft);
      if (dist < minDist) {
        minDist = dist;
        closest = i;
      }
    }
    return closest;
  }

  #waitForScrollEnd(callback, fallbackMs = 300) {
    let called = false;
    const run = () => {
      if (called) return;
      called = true;
      callback();
    };
    if ('onscrollend' in window) {
      const controller = new AbortController();
      this.#scroller.addEventListener('scrollend', () => {
        controller.abort();
        run();
      }, { signal: controller.signal });
      setTimeout(() => {
        controller.abort();
        run();
      }, fallbackMs);
    } else {
      setTimeout(run, fallbackMs);
    }
  }

  #renderAttributes() {
    const d = parseFloat(this.getAttribute('columns-desktop') ?? '4') || 4;
    const m = parseFloat(this.getAttribute('columns-mobile') ?? '1') || 1;
    const g = parseFloat(this.getAttribute('gap') ?? '16') ?? 16;
    const showA = this.getAttribute('show-arrows') !== 'false';
    const showD = this.getAttribute('show-dots') === 'true';
    const showThumbsArrows = this.getAttribute('show-thumbs-arrows') === 'true';

    Object.assign(this.style, {
      '--slides-per-view-desktop': String(d),
      '--slides-per-view-mobile': String(m),
      '--carousel-gap': `${g}px`,
    });

    const prev = this.querySelector('[name="previous"]');
    const next = this.querySelector('[name="next"]');
    const dots = this.querySelector('.carousel-dots');

    if (prev) prev.toggleAttribute('hidden', !showA);
    if (next) next.toggleAttribute('hidden', !showA);
    if (dots) dots.toggleAttribute('hidden', !showD);

    // Thumbs arrows visibility
    this.querySelectorAll('.carousel-thumbs-arrow').forEach(arrow => {
      arrow.toggleAttribute('hidden', !showThumbsArrows);
    });
  }
}

if (!customElements.get('carousel-component')) {
  customElements.define('carousel-component', Carousel);
}

export { Carousel };
