/**
 * Product Carousel Web Component
 * Lazy-loads dynamic content via Shopify APIs with IntersectionObserver
 * and retry logic. Integrates with carousel.js via reinit().
 *
 * @extends HTMLElement
 */
class ProductCarousel extends HTMLElement {
  #carousel = null;
  #source = null;
  #productId = null;
  #collectionHandle = null;
  #maxProducts = 8;
  #observer = null;
  #abortController = null;

  static get observedAttributes() {
    return ['data-source', 'data-collection-handle', 'data-product-id', 'data-max-products'];
  }

  constructor() {
    super();
    this.#abortController = new AbortController();
    this.#observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          this.#observer.disconnect();
          this._loadProducts();
        }
      },
      { rootMargin: '0px 0px 400px 0px' }
    );
  }

  connectedCallback() {
    this.#source = this.dataset.source;
    this.#productId = this.dataset.productId;
    this.#collectionHandle = this.dataset.collectionHandle;
    this.#maxProducts = parseInt(this.dataset.maxProducts || '8', 10);
    this.#observer.observe(this);
  }

  disconnectedCallback() {
    if (this.#abortController) {
      this.#abortController.abort();
      this.#abortController = null;
    }
    if (this.#observer) {
      this.#observer.disconnect();
      this.#observer = null;
    }
  }

  // ── Load orchestration ───────────────────────────────────────────────────

  async _loadProducts() {
    if (!this.#source) return;

    try {
      if (this.#source === 'related') {
        const html = await this._fetchRelated();
        this._renderProducts(html);
      } else if (this.#source === 'best_sellers') {
        const html = await this._fetchBestSellers();
        this._renderProducts(html);
      } else if (this.#source === 'recently_viewed') {
        const ids = this._getRecentlyViewed();
        if (ids.length > 0) {
          const html = await this._fetchRecentlyViewed(ids);
          this._renderProducts(html);
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('[ProductCarousel] Load failed:', error.message);
      }
    }
  }

  // ── Fetch methods ────────────────────────────────────────────────────────

  /**
   * @param {string} url
   * @param {number} [retries=2]
   * @returns {Promise<string>}
   */
  async fetchWithRetry(url, retries = 2) {
    const controller = this.#abortController;
    for (let i = 0; i <= retries; i++) {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.text();
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        if (i === retries) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  async _fetchBestSellers() {
    const routes = window.Theme?.routes || window.routes || {};
    const rootUrl = routes.root_url || '/';
    const handle = this.#collectionHandle || 'all';
    const url = `${rootUrl}collections/${handle}?sort_by=best-selling&section_id=product-carousel`;
    return this.fetchWithRetry(url);
  }

  async _fetchRelated() {
    const routes = window.Theme?.routes || window.routes || {};
    const base = routes.product_recommendations_url || '/recommendations/products';
    const url = `${base}?product_id=${this.#productId}&limit=${this.#maxProducts}&intent=related`;
    return this.fetchWithRetry(url);
  }

  /**
   * @param {string[]} ids
   * @returns {Promise<string>}
   */
  async _fetchRecentlyViewed(ids) {
    const routes = window.Theme?.routes || window.routes || {};
    const searchUrl = routes.search_url || '/search';
    const query = ids.map((id) => `id:${id}`).join(' OR ');
    const url = `${searchUrl}?q=${encodeURIComponent(query)}&type=product&section_id=product-carousel`;
    return this.fetchWithRetry(url);
  }

  // ── Recently viewed ───────────────────────────────────────────────────────

  /**
   * @returns {string[]}
   */
  _getRecentlyViewed() {
    try {
      const raw = localStorage.getItem('horizon_recently_viewed_products');
      if (!raw) return [];
      const { ids, timestamp } = JSON.parse(raw);
      const ttl = 24 * 60 * 60 * 1000;
      if (Date.now() - timestamp > ttl) return [];
      return (ids || []).slice(0, 12);
    } catch {
      return [];
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  /**
   * @param {string} html
   */
  _renderProducts(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Try block-specific selector first, then generic fallback
    const blockId = this.dataset.blockId;
    const blockContent = blockId ? doc.querySelector(`#ProductCarousel-${blockId}`) : null;
    const fallback = doc.querySelector('product-carousel, carousel-component');
    const content = blockContent || fallback;

    if (!content) return;

    this.innerHTML = content.innerHTML;

    // Reinitialize inner carousel
    this.#carousel = this.querySelector('carousel-component');
    if (this.#carousel?.reinit) {
      this.#carousel.reinit();
    }
  }
}

if (!customElements.get('product-carousel')) {
  customElements.define('product-carousel', ProductCarousel);
}

export { ProductCarousel };
