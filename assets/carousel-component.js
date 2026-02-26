/**
 * Custom Scroll Carousel
 * A lightweight, dependency-free carousel using CSS Scroll Snap.
 *
 * Attributes:
 * - columns-desktop: Number of slides visible on desktop (default: 1)
 * - columns-mobile: Number of slides visible on mobile (default: 1)
 * - show-arrows: Whether to show navigation arrows (default: true)
 * - show-dots: Whether to show pagination dots (default: false)
 * - loop: Whether to enable infinite loop (experimental)
 * - gap: Gap between slides in pixels (default: 0)
 */
class CarouselComponent extends HTMLElement {
    static get observedAttributes() {
        return ['columns-desktop', 'columns-mobile', 'show-arrows', 'show-dots', 'gap', 'loop', 'thumbs-mobile', 'thumbs-desktop'];
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
        this.isLoop = false;
        this.isJumping = false;
    }

    connectedCallback() {
        this.init();
        this.renderAttributes();
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
        }

        this.renderAttributes();
    }

    init() {
        this.scroller = this.querySelector('[role="list"]');
        if (!this.scroller) return;

        // Limpiar clones previos si existen
        this.scroller.querySelectorAll('[data-clone]').forEach(clone => clone.remove());

        this.slides = Array.from(this.scroller.querySelectorAll('[role="listitem"]'));
        this.originalCount = this.slides.length;
        this.isLoop = this.getAttribute('loop') === 'true' && this.originalCount > 1;

        if (this.isLoop) {
            this.setupLoop();
        }

        this.dots = Array.from(this.querySelectorAll('[role="tab"]'));
        this.prevBtn = this.querySelector('[name="previous"]');
        this.nextBtn = this.querySelector('[name="next"]');

        this.scroller.addEventListener('scroll', this.onScroll.bind(this), { passive: true });

        if (this.prevBtn) this.prevBtn.addEventListener('click', () => this.scrollStep(-1));
        if (this.nextBtn) this.nextBtn.addEventListener('click', () => this.scrollStep(1));

        this.dots.forEach((dot, index) => {
            dot.addEventListener('click', () => this.scrollToLogicalIndex(index));
        });

        if (this.isLoop) {
            // Posicionar en el primer elemento real después de un pequeño delay para asegurar renderizado
            requestAnimationFrame(() => {
                this.scrollToLogicalIndex(0, false);
            });
        }

        this.updateControls();
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
        lastClones.reverse().forEach(clone => this.scroller.prepend(clone));
        firstClones.forEach(clone => this.scroller.append(clone));

        // Actualizar lista de diapositivas incluyendo clones
        this.slides = Array.from(this.scroller.querySelectorAll('[role="listitem"]'));
    }

    renderAttributes() {
        const desktopCols = this.getAttribute('columns-desktop') ?? '1';
        const mobileCols = this.getAttribute('columns-mobile') || '1';
        const gap = this.getAttribute('gap') || '0';
        const showArrows = this.getAttribute('show-arrows') !== 'false';
        const showDots = this.getAttribute('show-dots') === 'true';

        this.style.setProperty('--slides-per-view-desktop', desktopCols);
        this.style.setProperty('--slides-per-view-mobile', mobileCols);
        this.style.setProperty('--carousel-gap', `${gap}px`);

        this.toggleAttribute('has-arrows', showArrows);
        this.toggleAttribute('has-dots', showDots);

        if (this.prevBtn) this.prevBtn.toggleAttribute('hidden', !showArrows);
        if (this.nextBtn) this.nextBtn.toggleAttribute('hidden', !showArrows);

        const dotsContainer = this.querySelector('.carousel-dots');
        if (dotsContainer) dotsContainer.toggleAttribute('hidden', !showDots);
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
        this.dots.forEach((dot, index) => {
            dot.setAttribute('aria-selected', String(index === this.logicalIndex));
        });

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
