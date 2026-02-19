/**
 * Product Carousel Web Component
 * Handles dynamic content fetching via Shopify APIs.
 */
class ProductCarousel extends HTMLElement {
    constructor() {
        super();
        this.source = this.dataset.source;
        this.sectionId = this.dataset.sectionId;
        this.blockId = this.dataset.blockId;
        this.productId = this.dataset.productId;
        this.maxProducts = parseInt(this.dataset.maxProducts || '8', 10);
        this.sortBy = this.dataset.sortBy;
        this.collectionHandle = this.dataset.collectionHandle;

        console.log('[ProductCarousel] Initialized', {
            source: this.source,
            sectionId: this.sectionId,
            blockId: this.blockId,
            productId: this.productId
        });

        this.observer = new IntersectionObserver(this.onIntersection.bind(this), {
            rootMargin: '0px 0px 400px 0px'
        });
        this.observer.observe(this);
    }

    /**
     * @param {IntersectionObserverEntry[]} entries
     */
    onIntersection(entries) {
        if (!entries[0]?.isIntersecting) return;
        console.log('[ProductCarousel] Intersecting', this.blockId);
        this.observer.unobserve(this);

        if (['best_sellers', 'related', 'recently_viewed'].includes(String(this.source))) {
            this.loadDynamicContent();
        }

        if (this.source === 'collection' && this.sortBy === 'best_selling') {
            this.loadDynamicContent();
        }
    }

    async loadDynamicContent() {
        let url;
        // @ts-ignore
        const routes = window.Theme?.routes || window.routes || {};
        console.log('[ProductCarousel] Routes available:', routes);

        if (this.source === 'related') {
            const recommendationsUrl = routes.product_recommendations_url || '/recommendations/products';
            url = `${recommendationsUrl}?section_id=${this.sectionId}&product_id=${this.productId}&limit=${this.maxProducts}&intent=related`;
        } else if (this.source === 'best_sellers' || (this.source === 'collection' && this.sortBy === 'best_selling')) {
            const handle = this.collectionHandle || 'all';
            const rootUrl = routes.root_url || '/';
            url = `${rootUrl}collections/${handle}?section_id=${this.sectionId}&sort_by=best-selling`;
        } else if (this.source === 'recently_viewed') {
            const viewedIds = JSON.parse(localStorage.getItem('viewedProducts') || '[]');
            console.log('[ProductCarousel] Recently viewed IDs from localStorage:', viewedIds);
            if (viewedIds.length === 0) {
                console.log('[ProductCarousel] No recently viewed products found, keeping fallback content.');
                return;
            }
            this.loadRecentlyViewed(viewedIds);
            return;
        }

        if (url) {
            console.log('[ProductCarousel] Fetching URL:', url);
            try {
                const response = await fetch(url);
                console.log('[ProductCarousel] Response status:', response.status);
                if (!response.ok) throw new Error(`Network response was not ok: ${response.status}`);

                const text = await response.text();
                const html = new DOMParser().parseFromString(text, 'text/html');

                console.log('[ProductCarousel] Searching for block ID:', `#ProductCarousel-${this.blockId}`);
                const dynamicContent = html.querySelector(`#ProductCarousel-${this.blockId}`);

                if (dynamicContent) {
                    console.log('[ProductCarousel] Content found, updating innerHTML');
                    this.innerHTML = dynamicContent.innerHTML;
                    // Re-initialize Horizon slideshow if available
                    // @ts-ignore
                    if (window.H?.slideshow?.init) {
                        console.log('[ProductCarousel] Re-initializing slideshow');
                        // @ts-ignore
                        window.H.slideshow.init(this);
                    }
                } else {
                    console.warn('[ProductCarousel] Target block not found in response HTML');
                    // Fallback: search for any product-carousel if block ID fails
                    const firstCarousel = html.querySelector('product-carousel');
                    if (firstCarousel) {
                        console.log('[ProductCarousel] Found a fallback product-carousel, using it.');
                        this.innerHTML = firstCarousel.innerHTML;
                    }
                }
            } catch (e) {
                console.error('[ProductCarousel] Failed to load dynamic product carousel:', e);
            }
        } else {
            console.log('[ProductCarousel] No URL generated for source:', this.source);
        }
    }

    /**
     * @param {string[]} ids
     */
    async loadRecentlyViewed(ids) {
        console.log('[ProductCarousel] loadRecentlyViewed (IDs):', ids);

        // @ts-ignore
        const routes = window.Theme?.routes || window.routes || {};
        const searchUrl = routes.search_url || '/search';

        const query = ids.map(id => `id:${id}`).join(' OR ');
        const url = `${searchUrl}?q=${encodeURIComponent(query)}&type=product&section_id=${this.sectionId}`;

        console.log('[ProductCarousel] Recently Viewed Fetch URL:', url);

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Network response was not ok: ${response.status}`);

            const text = await response.text();
            const html = new DOMParser().parseFromString(text, 'text/html');

            // Find the content inside the carousel wrapper in the response
            const dynamicContent = html.querySelector(`#ProductCarousel-${this.blockId}`);

            if (dynamicContent) {
                console.log('[ProductCarousel] Recently Viewed content found');
                this.innerHTML = dynamicContent.innerHTML;
                // Re-initialize Horizon slideshow
                // @ts-ignore
                if (window.H?.slideshow?.init) {
                    // @ts-ignore
                    window.H.slideshow.init(this);
                }
            } else {
                console.warn('[ProductCarousel] Recently Viewed target block not found');
            }
        } catch (e) {
            console.error('[ProductCarousel] Failed to load Recently Viewed products:', e);
        }
    }
}

if (!customElements.get('product-carousel')) {
    customElements.define('product-carousel', ProductCarousel);
}
