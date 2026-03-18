import { morph } from '@theme/morph';

/**
 * @typedef {Object} CarouselState
 * @property {HTMLElement[]} originalSlides - Original slide elements
 * @property {HTMLElement[]} allSlides - All slides including clones
 * @property {number} cloneCount - Number of clones at each end
 * @property {number} originalCount - Number of original slides
 * @property {number} slideWidth - Width of each slide including gap
 */

/**
 * Custom element for cross-sell carousel with infinite scroll.
 */
class CartCrossSell extends HTMLElement {
  /** @type {AbortController} */
  #abortController = new AbortController();

  /** @type {boolean} */
  #isInitialized = false;

  /** @type {CarouselState} */
  #state = {
    originalSlides: [],
    allSlides: [],
    cloneCount: 2,
    originalCount: 0,
    slideWidth: 0
  };

  /** @type {number} */
  #gapWidth = 12;

  /** @type {HTMLElement|null} */
  carousel = null;

  /** @type {HTMLButtonElement|null} */
  prevArrow = null;

  /** @type {HTMLButtonElement|null} */
  nextArrow = null;

  /** @type {HTMLDetailsElement|null} */
  details = null;

  connectedCallback() {
    const { signal } = this.#abortController;

    this.carousel = this.querySelector('.cart-drawer-cross-sell__carousel');
    this.prevArrow = this.querySelector('.cart-drawer-cross-sell__arrow--prev');
    this.nextArrow = this.querySelector('.cart-drawer-cross-sell__arrow--next');
    this.details = this.querySelector('details');

    if (!this.carousel) return;

    this.#setupCarouselInit(signal);
    this.#setupArrowNavigation(signal);
    this.#setupQuickBuyHandler(signal);
  }

  disconnectedCallback() {
    this.#abortController.abort();
  }

  #setupCarouselInit(signal) {
    if (this.details) {
      if (this.details.open) {
        this.#setupInfiniteCarousel();
      } else {
        this.details.addEventListener('toggle', () => {
          if (this.details?.open && !this.#isInitialized) {
            this.#setupInfiniteCarousel();
          }
        }, { signal });
      }
    } else {
      this.#setupInfiniteCarousel();
    }
  }

  #setupArrowNavigation(signal) {
    if (this.prevArrow) {
      this.prevArrow.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.#scrollPrev();
      }, { signal });
    }

    if (this.nextArrow) {
      this.nextArrow.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.#scrollNext();
      }, { signal });
    }
  }

  #setupQuickBuyHandler(signal) {
    this.addEventListener('click', this.#handleQuickBuyClick, { signal });
  }

  #setupInfiniteCarousel() {
    if (!this.carousel) return;

    this.carousel.querySelectorAll('[data-clone]').forEach(clone => clone.remove());

    const originalSlides = Array.from(
      this.carousel.querySelectorAll('.cart-drawer-cross-sell__slide:not([data-clone])')
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

    lastClones.reverse().forEach(clone => this.carousel?.prepend(clone));
    firstClones.forEach(clone => this.carousel?.appendChild(clone));

    this.#state.allSlides = Array.from(
      this.carousel.querySelectorAll('.cart-drawer-cross-sell__slide')
    );

    requestAnimationFrame(() => {
      const firstSlide = this.#state.allSlides[0];
      if (firstSlide) {
        this.#state.slideWidth = firstSlide.offsetWidth + this.#gapWidth;
      }
      this.#scrollToIndex(cloneCount, false);
      this.#isInitialized = true;
    });
  }

  /**
   * Gets current index based on scroll position.
   * @returns {number}
   */
  #getCurrentIndex() {
    if (!this.carousel || this.#state.slideWidth === 0) return 0;
    return Math.round(this.carousel.scrollLeft / this.#state.slideWidth);
  }

  /**
   * Scrolls to previous slide. Repositions first if at boundary.
   */
  #scrollPrev() {
    if (!this.carousel) return;

    const { slideWidth, cloneCount, originalCount } = this.#state;
    const currentIndex = this.#getCurrentIndex();
    const firstOriginalIndex = cloneCount;

    if (currentIndex <= firstOriginalIndex) {
      this.carousel.scrollTo({
        left: this.carousel.scrollLeft + (originalCount * slideWidth),
        behavior: 'instant'
      });
    }

    requestAnimationFrame(() => {
      const newIndex = this.#getCurrentIndex();
      this.#scrollToIndex(newIndex - 1, true);
    });
  }

  /**
   * Scrolls to next slide. Repositions first if at boundary.
   */
  #scrollNext() {
    if (!this.carousel) return;

    const { slideWidth, cloneCount, originalCount } = this.#state;
    const currentIndex = this.#getCurrentIndex();
    const lastOriginalIndex = cloneCount + originalCount - 1;

    if (currentIndex >= lastOriginalIndex) {
      this.carousel.scrollTo({
        left: this.carousel.scrollLeft - (originalCount * slideWidth),
        behavior: 'instant'
      });
    }

    requestAnimationFrame(() => {
      const newIndex = this.#getCurrentIndex();
      this.#scrollToIndex(newIndex + 1, true);
    });
  }

  /**
   * Scrolls to a specific slide index.
   * @param {number} index - Target slide index
   * @param {boolean} [smooth=true] - Whether to use smooth scrolling
   */
  #scrollToIndex(index, smooth = true) {
    if (!this.carousel || this.#state.allSlides.length === 0) return;

    const slide = this.#state.allSlides[index];
    if (!slide) return;

    this.carousel.scrollTo({
      left: slide.offsetLeft,
      behavior: smooth ? 'smooth' : 'instant'
    });
  }

  #handleQuickBuyClick = async (event) => {
    const quickBuyBtn = /** @type {HTMLElement} */ (event.target)?.closest('.cart-cross-sell-card__quick-buy');
    if (!quickBuyBtn) return;

    event.preventDefault();
    event.stopPropagation();

    const productUrl = /** @type {string} */ (quickBuyBtn.dataset.productUrl);
    if (!productUrl) return;

    const dialogComponent = /** @type {HTMLElement & { showDialog: () => void }} */ (
      document.getElementById('quick-add-dialog')
    );
    if (!dialogComponent || typeof dialogComponent.showDialog !== 'function') return;

    const productHtml = await this.#fetchQuickAddSection(productUrl);
    if (productHtml) {
      await this.#updateQuickAddModal(productHtml);
    }

    dialogComponent.showDialog();
  };

  async #fetchQuickAddSection(productPageUrl) {
    if (!productPageUrl) return null;

    const url = new URL(productPageUrl, window.location.origin);
    url.searchParams.set('section_id', 'quick-add-content');

    try {
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`Failed to fetch quick add section: HTTP error ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      console.error('[CartCrossSell] Error fetching quick add section:', error);
      return null;
    }
  }

  async #updateQuickAddModal(html) {
    const modalContent = document.getElementById('quick-add-modal-content');
    if (!html || !modalContent) return;

    morph(modalContent, html);

    requestAnimationFrame(() => {
      modalContent.querySelectorAll('carousel-component').forEach(el => {
        if (typeof /** @type {any} */ (el).reinit === 'function') {
          /** @type {any} */ (el).reinit();
        }
      });
    });
  }
}

if (!customElements.get('cart-cross-sell')) {
  customElements.define('cart-cross-sell', CartCrossSell);
}
