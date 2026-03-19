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
 * Custom element for cross-sell carousel with infinite scroll and Shopify recommendations API support.
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

  /** @type {boolean} */
  #recommendationsLoaded = false;

  connectedCallback() {
    const { signal } = this.#abortController;

    this.carousel = this.querySelector('[data-carousel]');
    this.prevArrow = this.querySelector('.cart-drawer-cross-sell__arrow--prev');
    this.nextArrow = this.querySelector('.cart-drawer-cross-sell__arrow--next');
    this.details = this.querySelector('details');

    if (!this.carousel) return;

    const source = this.dataset.source;

    if (source === 'recommendations' && !this.#recommendationsLoaded) {
      this.#loadRecommendations(signal);
    }

    this.#setupCarouselInit(signal);
    this.#setupArrowNavigation(signal);
    this.#setupQuickBuyHandler(signal);
    this.#setupCartUpdateListener(signal);
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

  #setupCartUpdateListener(signal) {
    document.addEventListener('cart:updated', () => {
      if (this.dataset.source === 'recommendations') {
        this.#recommendationsLoaded = false;
        this.#loadRecommendations(signal);
      }
    }, { signal });
  }

  async #loadRecommendations(signal) {
    const recommendationsUrl = this.dataset.recommendationsUrl;
    const cartProductIds = (this.dataset.cartProductIds || '').split(',').filter(Boolean);
    const maxProducts = parseInt(this.dataset.maxProducts || '8', 10);

    if (!recommendationsUrl) {
      this.#handleNoRecommendations();
      return;
    }

    try {
      const url = new URL(recommendationsUrl, window.location.origin);
      url.searchParams.set('section_id', 'cart-drawer-cross-sell-product');

      const response = await fetch(url.toString(), { signal });
      if (!response.ok) {
        throw new Error(`Failed to fetch recommendations: ${response.status}`);
      }

      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const slides = doc.querySelectorAll('.cart-drawer-cross-sell__slide');

      const filteredSlides = [];
      slides.forEach(slide => {
        const productId = slide.dataset.productId;
        if (productId && !cartProductIds.includes(productId) && filteredSlides.length < maxProducts) {
          filteredSlides.push(slide);
        }
      });

      if (filteredSlides.length === 0) {
        this.#handleNoRecommendations();
        return;
      }

      this.#updateCarouselWithRecommendations(filteredSlides);
      this.#recommendationsLoaded = true;

    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error('[CartCrossSell] Error loading recommendations:', error);
      this.#handleNoRecommendations();
    }
  }

  #updateCarouselWithRecommendations(slides) {
    if (!this.carousel) return;

    this.carousel.querySelectorAll('[data-skeleton]').forEach(el => el.remove());
    this.carousel.querySelectorAll('[data-clone]').forEach(el => el.remove());

    slides.forEach(slide => {
      this.carousel?.appendChild(slide);
    });

    this.#state.originalSlides = [];
    this.#isInitialized = false;

    requestAnimationFrame(() => {
      this.#setupInfiniteCarousel();
    });
  }

  #handleNoRecommendations() {
    if (!this.carousel) return;

    this.carousel.querySelectorAll('[data-skeleton]').forEach(el => {
      el.innerHTML = `
        <div class="cart-cross-sell-card cart-cross-sell-card--empty">
          <span class="cart-cross-sell-card__empty-text">${this.dataset.emptyText || 'No products available'}</span>
        </div>
      `;
    });
  }

  #setupInfiniteCarousel() {
    if (!this.carousel) return;

    this.carousel.querySelectorAll('[data-clone]').forEach(clone => clone.remove());

    const originalSlides = Array.from(
      this.carousel.querySelectorAll('.cart-drawer-cross-sell__slide:not([data-clone]):not([data-skeleton])')
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

  #getCurrentIndex() {
    if (!this.carousel || this.#state.slideWidth === 0) return 0;
    return Math.round(this.carousel.scrollLeft / this.#state.slideWidth);
  }

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