/**
 * Infinite Carousel Web Component
 * A carousel with true infinite loop using slide cloning technique.
 *
 * Usage:
 * <infinite-carousel>
 *   <div class="infinite-carousel__scroller">
 *     <div class="infinite-carousel__slide">Slide 1</div>
 *     <div class="infinite-carousel__slide">Slide 2</div>
 *   </div>
 *   <button class="infinite-carousel__arrow--prev">Prev</button>
 *   <button class="infinite-carousel__arrow--next">Next</button>
 * </infinite-carousel>
 */
class InfiniteCarousel extends HTMLElement {
  /** @type {AbortController} */
  #abortController = new AbortController();

  /** @type {boolean} */
  #isInitialized = false;

  /** @type {{ originalSlides: HTMLElement[], allSlides: HTMLElement[], cloneCount: number, originalCount: number, slideWidth: number }} */
  #state = {
    originalSlides: [],
    allSlides: [],
    cloneCount: 2,
    originalCount: 0,
    slideWidth: 0
  };

  /** @type {HTMLElement|null} */
  #scroller = null;

  /** @type {HTMLButtonElement|null} */
  #prevArrow = null;

  /** @type {HTMLButtonElement|null} */
  #nextArrow = null;

  /** @type {number} */
  #gapWidth = 16;

  /** @type {boolean} */
  #isScrolling = false;

  connectedCallback() {
    const { signal } = this.#abortController;

    this.#scroller = this.querySelector('.infinite-carousel__scroller');
    this.#prevArrow = this.querySelector('.infinite-carousel__arrow--prev');
    this.#nextArrow = this.querySelector('.infinite-carousel__arrow--next');

    if (!this.#scroller) return;

    this.#setupInfiniteCarousel();
    this.#setupArrowNavigation(signal);
    this.#setupScrollListener(signal);
    this.#setupResizeObserver();
  }

  disconnectedCallback() {
    this.#abortController.abort();
  }

  #setupArrowNavigation(signal) {
    if (this.#prevArrow) {
      this.#prevArrow.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.#scrollPrev();
      }, { signal });
    }

    if (this.#nextArrow) {
      this.#nextArrow.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.#scrollNext();
      }, { signal });
    }
  }

  #setupScrollListener(signal) {
    let scrollTimeout;
    this.#scroller?.addEventListener('scroll', () => {
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        this.#handleInfiniteJump();
      }, 100);
    }, { signal, passive: true });
  }

  #setupResizeObserver() {
    const resizeObserver = new ResizeObserver(() => {
      this.#updateSlideWidth();
    });
    resizeObserver.observe(this);
  }

  #setupInfiniteCarousel() {
    if (!this.#scroller) return;

    this.#scroller.querySelectorAll('[data-clone]').forEach(clone => clone.remove());

    const originalSlides = Array.from(
      this.#scroller.querySelectorAll('.infinite-carousel__slide:not([data-clone])')
    );

    if (originalSlides.length <= 1) return;

    this.#state.originalSlides = originalSlides;
    this.#state.originalCount = originalSlides.length;
    this.#state.cloneCount = Math.min(2, originalSlides.length);

    const { cloneCount } = this.#state;

    const lastClones = originalSlides.slice(-cloneCount).map(slide => {
      const clone = slide.cloneNode(true);
      clone.setAttribute('data-clone', 'last');
      clone.setAttribute('aria-hidden', 'true');
      return /** @type {HTMLElement} */ (clone);
    });

    const firstClones = originalSlides.slice(0, cloneCount).map(slide => {
      const clone = slide.cloneNode(true);
      clone.setAttribute('data-clone', 'first');
      clone.setAttribute('aria-hidden', 'true');
      return /** @type {HTMLElement} */ (clone);
    });

    lastClones.reverse().forEach(clone => this.#scroller?.prepend(clone));
    firstClones.forEach(clone => this.#scroller?.appendChild(clone));

    this.#state.allSlides = Array.from(
      this.#scroller.querySelectorAll('.infinite-carousel__slide')
    );

    requestAnimationFrame(() => {
      this.#updateSlideWidth();
      this.#scrollToIndex(cloneCount, false);
      this.#isInitialized = true;
    });
  }

  #updateSlideWidth() {
    const firstSlide = this.#state.allSlides[0];
    if (firstSlide) {
      this.#state.slideWidth = firstSlide.offsetWidth + this.#gapWidth;
    }
  }

  #getCurrentIndex() {
    if (!this.#scroller || this.#state.slideWidth === 0) return 0;
    return Math.round(this.#scroller.scrollLeft / this.#state.slideWidth);
  }

  #scrollPrev() {
    if (!this.#scroller || this.#isScrolling) return;

    const { slideWidth, cloneCount, originalCount } = this.#state;
    const currentIndex = this.#getCurrentIndex();
    const firstOriginalIndex = cloneCount;

    if (currentIndex <= firstOriginalIndex) {
      this.#scroller.scrollTo({
        left: this.#scroller.scrollLeft + (originalCount * slideWidth),
        behavior: 'instant'
      });
    }

    requestAnimationFrame(() => {
      const newIndex = this.#getCurrentIndex();
      this.#scrollToIndex(newIndex - 1, true);
    });
  }

  #scrollNext() {
    if (!this.#scroller || this.#isScrolling) return;

    const { slideWidth, cloneCount, originalCount } = this.#state;
    const currentIndex = this.#getCurrentIndex();
    const lastOriginalIndex = cloneCount + originalCount - 1;

    if (currentIndex >= lastOriginalIndex) {
      this.#scroller.scrollTo({
        left: this.#scroller.scrollLeft - (originalCount * slideWidth),
        behavior: 'instant'
      });
    }

    requestAnimationFrame(() => {
      const newIndex = this.#getCurrentIndex();
      this.#scrollToIndex(newIndex + 1, true);
    });
  }

  #handleInfiniteJump() {
    if (!this.#scroller || !this.#isInitialized || this.#isScrolling) return;

    const { slideWidth, cloneCount, originalCount, allSlides } = this.#state;
    if (allSlides.length === 0) return;

    const currentIndex = this.#getCurrentIndex();
    const firstOriginalIndex = cloneCount;
    const lastOriginalIndex = cloneCount + originalCount - 1;

    if (currentIndex < firstOriginalIndex) {
      this.#isScrolling = true;
      this.#scroller.scrollTo({
        left: this.#scroller.scrollLeft + (originalCount * slideWidth),
        behavior: 'instant'
      });
      setTimeout(() => { this.#isScrolling = false; }, 50);
    } else if (currentIndex > lastOriginalIndex) {
      this.#isScrolling = true;
      this.#scroller.scrollTo({
        left: this.#scroller.scrollLeft - (originalCount * slideWidth),
        behavior: 'instant'
      });
      setTimeout(() => { this.#isScrolling = false; }, 50);
    }
  }

  #scrollToIndex(index, smooth = true) {
    if (!this.#scroller || this.#state.allSlides.length === 0) return;

    const slide = this.#state.allSlides[index];
    if (!slide) return;

    this.#isScrolling = true;
    this.#scroller.scrollTo({
      left: slide.offsetLeft,
      behavior: smooth ? 'smooth' : 'instant'
    });
    setTimeout(() => { this.#isScrolling = false; }, smooth ? 300 : 50);
  }

  reinit() {
    this.#isInitialized = false;
    this.#setupInfiniteCarousel();
  }
}

if (!customElements.get('infinite-carousel')) {
  customElements.define('infinite-carousel', InfiniteCarousel);
}
