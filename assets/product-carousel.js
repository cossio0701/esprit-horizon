/**
 * Product Carousel Web Component
 * Handles dynamic content fetching via Shopify APIs with retry logic and proper cleanup.
 * 
 * @extends HTMLElement
 */
class ProductCarousel extends HTMLElement {
  constructor() {
    super();
    
    /** @type {AbortController} */
    this.#abortController = new AbortController();
    
    this.source = this.dataset.source;
    this.sectionId = this.dataset.sectionId;
    this.blockId = this.dataset.blockId;
    this.productId = this.dataset.productId;
    this.maxProducts = parseInt(this.dataset.maxProducts || '8', 10);
    this.sortBy = this.dataset.sortBy;
    this.collectionHandle = this.dataset.collectionHandle;

    this.observer = new IntersectionObserver(
      this.#handleIntersection.bind(this),
      { rootMargin: '0px 0px 400px 0px' }
    );
  }

  #abortController;
  #retryCount = 0;
  #maxRetries = 3;

  connectedCallback() {
    this.observer.observe(this);
  }

  disconnectedCallback() {
    this.#abortController.abort();
    this.observer.disconnect();
  }

  /**
   * @param {IntersectionObserverEntry[]} entries
   */
  #handleIntersection(entries) {
    if (!entries[0]?.isIntersecting) return;
    
    this.observer.unobserve(this);

    const dynamicSources = ['best_sellers', 'related', 'recently_viewed'];
    const shouldLoadDynamic = dynamicSources.includes(String(this.source)) ||
      (this.source === 'collection' && this.sortBy === 'best_selling');

    if (shouldLoadDynamic) {
      this.#loadDynamicContent();
    }
  }

  async #loadDynamicContent() {
    let url;
    const routes = window.Theme?.routes || window.routes || {};

    try {
      if (this.source === 'related') {
        url = this.#buildRecommendationsUrl(routes);
      } else if (this.source === 'best_sellers' || 
                 (this.source === 'collection' && this.sortBy === 'best_selling')) {
        url = this.#buildBestSellersUrl(routes);
      } else if (this.source === 'recently_viewed') {
        await this.#loadRecentlyViewed();
        return;
      }

      if (url) {
        const html = await this.#fetchWithRetry(url);
        this.#updateContent(html);
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Failed to load product carousel:', error.message);
      }
    }
  }

  /**
   * @param {object} routes
   * @returns {string}
   */
  #buildRecommendationsUrl(routes) {
    const recommendationsUrl = routes.product_recommendations_url || '/recommendations/products';
    return `${recommendationsUrl}?section_id=${this.sectionId}&product_id=${this.productId}&limit=${this.maxProducts}&intent=related`;
  }

  /**
   * @param {object} routes
   * @returns {string}
   */
  #buildBestSellersUrl(routes) {
    const handle = this.collectionHandle || 'all';
    const rootUrl = routes.root_url || '/';
    return `${rootUrl}collections/${handle}?section_id=${this.sectionId}&sort_by=best-selling`;
  }

  /**
   * Fetch with retry logic and timeout
   * @param {string} url
   * @param {number} maxRetries
   * @returns {Promise<string>}
   */
  async #fetchWithRetry(url, maxRetries = 3) {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(url, {
          signal: controller.signal
        });
        
        clearTimeout(timeout);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        return await response.text();
      } catch (error) {
        lastError = error;
        
        if (error.name === 'AbortError') {
          throw error;
        }
        
        if (i < maxRetries - 1) {
          await this.#delay(1000 * (i + 1));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * @param {number} ms
   * @returns {Promise<void>}
   */
  #delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * @param {string} html
   */
  #updateContent(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const dynamicContent = doc.querySelector(`#ProductCarousel-${this.blockId}`);
    
    if (dynamicContent) {
      this.innerHTML = dynamicContent.innerHTML;
      this.#reinitializeCarousel();
    } else {
      const firstCarousel = doc.querySelector('product-carousel');
      if (firstCarousel) {
        this.innerHTML = firstCarousel.innerHTML;
        this.#reinitializeCarousel();
      }
    }
  }

  #reinitializeCarousel() {
    if (window.H?.slideshow?.init) {
      window.H.slideshow.init(this);
    }
    
    const carousel = this.querySelector('carousel-component');
    if (carousel && carousel.reinit) {
      carousel.reinit();
    }
  }

  /**
   * Load recently viewed products with cache
   */
  async #loadRecentlyViewed() {
    const viewedIds = this.#getRecentlyViewedIds();
    
    if (viewedIds.length === 0) {
      return;
    }

    const routes = window.Theme?.routes || window.routes || {};
    const searchUrl = routes.search_url || '/search';
    
    const query = viewedIds.map(id => `id:${id}`).join(' OR ');
    const url = `${searchUrl}?q=${encodeURIComponent(query)}&type=product&section_id=${this.sectionId}`;

    try {
      const html = await this.#fetchWithRetry(url);
      this.#updateContent(html);
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Failed to load recently viewed products:', error.message);
      }
    }
  }

  /**
   * @returns {string[]}
   */
  #getRecentlyViewedIds() {
    try {
      const data = localStorage.getItem('viewedProducts');
      if (!data) return [];
      
      const parsed = JSON.parse(data);
      
      if (Array.isArray(parsed)) {
        return parsed;
      }
      
      if (parsed.ids && Array.isArray(parsed.ids)) {
        return parsed.ids;
      }
      
      return [];
    } catch {
      return [];
    }
  }
}

if (!customElements.get('product-carousel')) {
  customElements.define('product-carousel', ProductCarousel);
}

export { ProductCarousel };
