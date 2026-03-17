import { morph } from '@theme/morph';

class CartCrossSell extends HTMLElement {
  #abortController = new AbortController();
  #scrollTimeout = null;
  #isInitialized = false;

  connectedCallback() {
    const { signal } = this.#abortController;

    this.carousel = this.querySelector('.cart-drawer-cross-sell__carousel');
    this.prevArrow = this.querySelector('.cart-drawer-cross-sell__arrow--prev');
    this.nextArrow = this.querySelector('.cart-drawer-cross-sell__arrow--next');
    this.details = this.querySelector('details');

    if (!this.carousel) return;

    const detailsElement = this.details;
    if (detailsElement) {
      if (detailsElement.open) {
        this.#setupInfiniteCarousel();
      } else {
        detailsElement.addEventListener('toggle', () => {
          if (detailsElement.open && !this.#isInitialized) {
            this.#setupInfiniteCarousel();
          }
        }, { signal });
      }
    } else {
      this.#setupInfiniteCarousel();
    }

    if (this.prevArrow) {
      this.prevArrow.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.#scrollStep(-1);
      }, { signal });
    }

    if (this.nextArrow) {
      this.nextArrow.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.#scrollStep(1);
      }, { signal });
    }

    this.carousel.addEventListener('scroll', this.#onScroll, { signal, passive: true });

    this.addEventListener('click', this.#handleQuickBuyClick, { signal });
  };

  disconnectedCallback() {
    this.#abortController.abort();
  };

  #originalSlides = [];
  #allSlides = [];
  #cloneCount = 2;
  #originalCount = 0;
  #slideWidth = 0;
  #gapWidth = 12;
  #currentIndex = 0;
  #isJumping = false;

  #setupInfiniteCarousel() {
    this.carousel.querySelectorAll('[data-clone]').forEach(clone => clone.remove());

    const originalSlides = Array.from(this.carousel.querySelectorAll('.cart-drawer-cross-sell__slide:not([data-clone])'));
    
    if (originalSlides.length <= 1) return;
    
    this.#originalSlides = originalSlides;
    this.#originalCount = originalSlides.length;
    this.#cloneCount = Math.min(2, originalSlides.length);

    const lastClones = originalSlides.slice(-this.#cloneCount).map(slide => {
      const clone = slide.cloneNode(true);
      clone.setAttribute('data-clone', 'last');
      clone.setAttribute('aria-hidden', 'true');
      return clone;
    });

    const firstClones = originalSlides.slice(0, this.#cloneCount).map(slide => {
      const clone = slide.cloneNode(true);
      clone.setAttribute('data-clone', 'first');
      clone.setAttribute('aria-hidden', 'true');
      return clone;
    });

    lastClones.reverse().forEach(clone => this.carousel.prepend(clone));
    firstClones.forEach(clone => this.carousel.appendChild(clone));

    this.#allSlides = Array.from(this.carousel.querySelectorAll('.cart-drawer-cross-sell__slide'));
    
    requestAnimationFrame(() => {
      const firstSlide = this.#allSlides[0];
      if (firstSlide) {
        this.#slideWidth = firstSlide.offsetWidth + this.#gapWidth;
      }
      this.#currentIndex = this.#cloneCount;
      this.#scrollToIndex(this.#currentIndex, false);
    });
  }

  #scrollStep(step) {
    let nextIndex = this.#currentIndex + step;
    this.#scrollToIndex(nextIndex, true);
  }

  #scrollToIndex(index, smooth = true) {
    if (this.#allSlides.length === 0) return;
    
    const slide = this.#allSlides[index];
    if (!slide) return;

    this.carousel.scrollTo({
      left: slide.offsetLeft,
      behavior: smooth ? 'smooth' : 'instant'
    });
  }

  #onScroll = () => {
    if (this.#isJumping) return;

    if (this.#scrollTimeout) clearTimeout(this.#scrollTimeout);

    this.#scrollTimeout = setTimeout(() => {
      this.#handleInfiniteJump();
      this.#updateCurrentIndex();
    }, 50);
  };

  #handleInfiniteJump() {
    if (this.#originalCount <= 1 || !this.carousel) return;

    const scrollLeft = this.carousel.scrollLeft;
    const totalWidth = this.carousel.scrollWidth;
    const containerWidth = this.carousel.clientWidth;

    if (scrollLeft < this.#slideWidth) {
      this.#isJumping = true;
      this.carousel.scrollTo({
        left: scrollLeft + (this.#originalCount * this.#slideWidth),
        behavior: 'instant'
      });
      setTimeout(() => { this.#isJumping = false; }, 50);
    } else if (scrollLeft > totalWidth - containerWidth - this.#slideWidth) {
      this.#isJumping = true;
      this.carousel.scrollTo({
        left: scrollLeft - (this.#originalCount * this.#slideWidth),
        behavior: 'instant'
      });
      setTimeout(() => { this.#isJumping = false; }, 50);
    }
  }

  #updateCurrentIndex() {
    if (this.#allSlides.length === 0 || !this.carousel) return;
    
    const scrollLeft = this.carousel.scrollLeft;
    const index = Math.round(scrollLeft / this.#slideWidth);

    if (index !== this.#currentIndex) {
      this.#currentIndex = index;
    }
  }

  #handleQuickBuyClick = async (event) => {
    const quickBuyBtn = event.target.closest('.cart-cross-sell-card__quick-buy');
    if (!quickBuyBtn) return;

    event.preventDefault();
    event.stopPropagation();

    const productUrl = quickBuyBtn.dataset.productUrl;
    if (!productUrl) return;

    const dialogComponent = document.getElementById('quick-add-dialog');
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
        if (typeof el.reinit === 'function') el.reinit();
      });
    });
  }
}

if (!customElements.get('cart-cross-sell')) {
  customElements.define('cart-cross-sell', CartCrossSell);
}
