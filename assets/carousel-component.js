/**
 * Custom Scroll Carousel
 * A lightweight, dependency-free carousel using CSS Scroll Snap.
 *
 * Attributes:
 * - columns-desktop: Number of slides visible on desktop (default: 1). Supports decimals (e.g. 2.25)
 * - columns-mobile: Number of slides visible on mobile (default: 1). Supports decimals (e.g. 2.25)
 * - show-arrows: Whether to show navigation arrows (default: true)
 * - show-dots: Whether to show pagination dots (default: false)
 * - show-thumbs-arrows: Whether to show navigation arrows on thumbnails (default: false)
 * - thumbs-mobile: Thumbnail position on mobile (top|bottom|left|right|none)
 * - thumbs-desktop: Thumbnail position on desktop (top|bottom|left|right|none)
 * - loop: Whether to enable infinite loop (experimental)
 * - gap: Gap between slides in pixels (default: 0). Supports decimals.
 */
class CarouselComponent extends HTMLElement {
    static get observedAttributes() {
        return ['columns-desktop', 'columns-mobile', 'show-arrows', 'show-dots', 'show-thumbs-arrows', 'gap', 'loop', 'thumbs-mobile', 'thumbs-desktop', 'autoplay', 'autoplay-speed'];
    }

    constructor() {
        super();
        /** @type {HTMLElement | null} */
        this.scroller = null;
        /** @type {HTMLElement[]} */
        this.slides = [];
        /** @type {HTMLElement[]} */
        this.dots = [];
        /** @type {HTMLButtonElement | null} */
        this.prevBtn = null;
        /** @type {HTMLButtonElement | null} */
        this.nextBtn = null;
        this.currentIndex = 0;
        this.logicalIndex = 0;
        this.originalCount = 0;
        this.clonesCount = 2; // Number of clones at each end
        /** @type {number | null} */
        this.scrollTimeout = null;
        /** @type {number | null} */
        this.autoplayInterval = null;
        this.isLoop = false;
        this.isJumping = false;
        this._scrollListenerAttached = false;
        /** @type {HTMLElement[]} */
        this.thumbs = [];

        // Bind for event listeners
        this.onMouseEnter = this.stopAutoplay.bind(this);
        this.onMouseLeave = this.startAutoplay.bind(this);
    }

    connectedCallback() {
        this.init();
        this.addEventListener('mouseenter', this.onMouseEnter);
        this.addEventListener('mouseleave', this.onMouseLeave);
    }

    disconnectedCallback() {
        this.stopAutoplay();
        this.removeEventListener('mouseenter', this.onMouseEnter);
        this.removeEventListener('mouseleave', this.onMouseLeave);
    }

    /**
     * Public method to force a full re-initialization.
     * Call this after DOM mutations (e.g. morph) that preserve the element
     * without triggering connectedCallback.
     */
    reinit() {
        this._scrollListenerAttached = false; // Allow re-attaching scroll listener on new scroller
        this.init();
    }

    /**
     * @param {string} name
     * @param {string | null} oldValue
     * @param {string | null} newValue
     */
    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return;

        if (name === 'loop') {
            this.init(); // Re-init to handle cloning
            return;
        }

        if (name === 'autoplay' || name === 'autoplay-speed') {
            this.startAutoplay();
            return;
        }

        // Always re-render based on current DOM state
        this.renderAttributes();
    }

    init() {
        this.scroller = this.querySelector('[role="list"]');
        if (!this.scroller) return;

        // Clean up previous clones
        this.scroller.querySelectorAll('[data-clone]').forEach(clone => clone.remove());

        this.slides = Array.from(this.scroller.querySelectorAll('[role="listitem"]'));
        this.originalCount = this.slides.length;
        this.isLoop = this.getAttribute('loop') === 'true' && this.originalCount > 1;

        if (this.isLoop) {
            this.setupLoop();
        }

        // --- Thumbs (from HTML) ---
        this.thumbs = Array.from(this.querySelectorAll('.carousel-thumb'));
        this.thumbs.forEach((thumb, index) => {
            thumb.addEventListener('click', () => this.scrollToLogicalIndex(index));
        });

        // --- Dots (auto-generated) ---
        this.buildDots();

        // --- Thumbs Arrows (auto-generated) ---
        this.buildThumbsArrows();

        // Always re-query buttons after rebuilding DOM
        this.prevBtn = this.querySelector('[name="previous"]');
        this.nextBtn = this.querySelector('[name="next"]');

        // Attach scroll listener only once (the scroller element persists)
        if (!this._scrollListenerAttached) {
            this.scroller.addEventListener('scroll', this.onScroll.bind(this), { passive: true });
            this._scrollListenerAttached = true;
        }

        // Always re-attach click listeners since buttons may be new DOM nodes after a morph
        if (this.prevBtn) this.prevBtn.addEventListener('click', () => {
            this.stopAutoplay();
            this.scrollStep(-1);
        });
        if (this.nextBtn) this.nextBtn.addEventListener('click', () => {
            this.stopAutoplay();
            this.scrollStep(1);
        });

        if (this.isLoop) {
            requestAnimationFrame(() => {
                this.scrollToLogicalIndex(0, false);
            });
        }

        this.updateControls();

        // Autoplay init
        this.startAutoplay();

        // Always call renderAttributes last, after all DOM is built
        this.renderAttributes();
    }

    startAutoplay() {
        this.stopAutoplay();
        if (this.getAttribute('autoplay') !== 'true' || this.originalCount <= 1) return;

        const speed = parseInt(this.getAttribute('autoplay-speed') || '5000', 10);
        this.autoplayInterval = window.setInterval(() => {
            if (this.isLoop) {
                this.scrollStep(1);
            } else {
                // If not loop, go back to start at the end
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

    buildDots() {
        // Remove existing dots container if present
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
            btn.addEventListener('click', () => this.scrollToLogicalIndex(i));
            container.appendChild(btn);
        }

        this.appendChild(container);
        this.dots = Array.from(container.querySelectorAll('button'));
    }

    buildThumbsArrows() {
        // Remove existing wrapper if present (re-init safety)
        const existingNav = this.querySelector('.carousel-thumbs-nav');
        if (existingNav) {
            const thumbsInside = existingNav.querySelector('.carousel-thumbs');
            if (thumbsInside) existingNav.before(thumbsInside);
            existingNav.remove();
        }

        const thumbsContainer = this.querySelector('.carousel-thumbs');
        if (!thumbsContainer || this.thumbs.length <= 1) return;

        // Wrap thumbs in a nav container
        const nav = document.createElement('div');
        nav.className = 'carousel-thumbs-nav';
        thumbsContainer.before(nav);
        nav.appendChild(thumbsContainer);

        // Create arrows
        const prevArrow = document.createElement('button');
        prevArrow.type = 'button';
        prevArrow.className = 'carousel-thumbs-arrow carousel-thumbs-arrow--prev';
        prevArrow.setAttribute('aria-label', 'Previous');
        prevArrow.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';

        const nextArrow = document.createElement('button');
        nextArrow.type = 'button';
        nextArrow.className = 'carousel-thumbs-arrow carousel-thumbs-arrow--next';
        nextArrow.setAttribute('aria-label', 'Next');
        nextArrow.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>';

        // Navigate slides on click
        prevArrow.addEventListener('click', () => this.scrollStep(-1));
        nextArrow.addEventListener('click', () => this.scrollStep(1));

        nav.insertBefore(prevArrow, thumbsContainer);
        nav.appendChild(nextArrow);
    }

    setupLoop() {
        // Clonar los últimos para el principio
        const lastClones = this.slides.slice(-this.clonesCount).map(slide => {
            const clone = /** @type {HTMLElement} */ (slide.cloneNode(true));
            clone.setAttribute('data-clone', 'last');
            clone.setAttribute('aria-hidden', 'true');
            return clone;
        });

        // Clonar los primeros para el final
        const firstClones = this.slides.slice(0, this.clonesCount).map(slide => {
            const clone = /** @type {HTMLElement} */ (slide.cloneNode(true));
            clone.setAttribute('data-clone', 'first');
            clone.setAttribute('aria-hidden', 'true');
            return clone;
        });

        if (!this.scroller) return;
        lastClones.reverse().forEach(clone => this.scroller?.prepend(clone));
        firstClones.forEach(clone => this.scroller?.append(clone));

        // Actualizar lista de diapositivas incluyendo clones
        this.slides = Array.from(this.scroller.querySelectorAll('[role="listitem"]'));
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

        // Always re-query from DOM to avoid stale references after morph/re-render
        const prevBtn = this.querySelector('[name="previous"]');
        const nextBtn = this.querySelector('[name="next"]');
        if (prevBtn) prevBtn.toggleAttribute('hidden', !showArrows);
        if (nextBtn) nextBtn.toggleAttribute('hidden', !showArrows);

        const dotsContainer = this.querySelector('.carousel-dots');
        if (dotsContainer) dotsContainer.toggleAttribute('hidden', !showDots);

        // Thumbs arrows visibility
        this.querySelectorAll('.carousel-thumbs-arrow').forEach(arrow => {
            arrow.toggleAttribute('hidden', !showThumbsArrows);
        });
    }

    onScroll() {
        if (this.isJumping) return;

        if (this.scrollTimeout) window.clearTimeout(this.scrollTimeout);

        this.scrollTimeout = window.setTimeout(() => {
            this.handleInfiniteJump();
            this.updateActiveIndex();
        }, 50);
    }

    handleInfiniteJump() {
        if (!this.isLoop || !this.scroller || this.slides.length === 0) return;

        const scrollLeft = this.scroller.scrollLeft;
        const firstSlide = this.slides[0];
        if (!firstSlide) return;

        const slideWidth = firstSlide.offsetWidth;
        const totalWidth = this.scroller.scrollWidth;
        const containerWidth = this.scroller.offsetWidth;

        // Jump de principio a fin real
        if (scrollLeft < slideWidth) {
            this.isJumping = true;
            this.scroller.scrollTo({
                left: scrollLeft + (this.originalCount * slideWidth),
                behavior: 'instant'
            });
            setTimeout(() => { this.isJumping = false; }, 50);
        }
        // Jump de fin a principio real
        else if (scrollLeft > totalWidth - containerWidth - slideWidth) {
            this.isJumping = true;
            this.scroller.scrollTo({
                left: scrollLeft - (this.originalCount * slideWidth),
                behavior: 'instant'
            });
            setTimeout(() => { this.isJumping = false; }, 50);
        }
    }

    updateActiveIndex() {
        if (!this.scroller) return;
        const scrollLeft = this.scroller.scrollLeft;
        const slideWidth = this.slides[0]?.offsetWidth || this.scroller.offsetWidth;
        const index = Math.round(scrollLeft / slideWidth);

        if (index !== this.currentIndex) {
            this.currentIndex = index;

            // Calcular el índice lógico (0 a originalCount - 1)
            if (this.isLoop) {
                this.logicalIndex = (index - this.clonesCount + this.originalCount) % this.originalCount;
            } else {
                this.logicalIndex = index;
            }

            this.updateControls();
            this.dispatchEvent(new CustomEvent('carousel:slideChange', { detail: { index: this.logicalIndex } }));
        }
    }

    updateControls() {
        // Sync dots
        this.dots.forEach((dot, index) => {
            dot.setAttribute('aria-selected', String(index === this.logicalIndex));
        });

        // Sync thumbs & auto-scroll active into view
        if (this.thumbs) {
            this.thumbs.forEach((thumb, index) => {
                thumb.setAttribute('aria-selected', String(index === this.logicalIndex));
            });

            const activeThumb = this.thumbs[this.logicalIndex];
            if (activeThumb) {
                activeThumb.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
            }
        }

        if (this.prevBtn) this.prevBtn.disabled = !this.isLoop && this.logicalIndex === 0;
        if (this.nextBtn) this.nextBtn.disabled = !this.isLoop && this.logicalIndex >= this.originalCount - 1;
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
     * @param {boolean} smooth
     */
    scrollToLogicalIndex(logicalIndex, smooth = true) {
        const targetIndex = this.isLoop ? logicalIndex + this.clonesCount : logicalIndex;
        this.scrollToIndex(targetIndex, smooth);
    }

    /**
     * @param {number} index
     * @param {boolean} smooth
     */
    scrollToIndex(index, smooth = true) {
        if (!this.scroller) return;
        const slide = this.slides[index];
        if (!slide || !this.scroller) return;

        this.scroller.scrollTo({
            left: slide.offsetLeft,
            behavior: smooth ? 'smooth' : 'instant'
        });
    }
}

if (!customElements.get('carousel-component')) {
    customElements.define('carousel-component', CarouselComponent);
}
