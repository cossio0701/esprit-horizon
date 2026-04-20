import { morph } from '@theme/morph';
import { Component } from '@theme/component';
import { CartUpdateEvent, ThemeEvents } from '@theme/events';
import { DialogComponent, DialogCloseEvent } from '@theme/dialog';
import { mediaQueryLarge, isMobileBreakpoint, getIOSVersion } from '@theme/utilities';

const MAX_CACHE_SIZE = 20;

/**
 * Dynamically imports product-form.js and variant-picker.js when on non-product pages.
 * Caches the promise to avoid re-fetching on subsequent calls.
 * @returns {Promise<[unknown, unknown]> | void}
 */
let productFormScriptsPromise = null;

function ensureProductFormScripts() {
  // Already on product page where scripts are already loaded
  if (window.Theme?.template?.name === 'product') return;
  // Return cached promise if already loading/loaded
  if (productFormScriptsPromise) return productFormScriptsPromise;

  productFormScriptsPromise = Promise.all([
    import('@theme/product-form'),
    import('@theme/variant-picker'),
  ]);
  return productFormScriptsPromise;
}

class LRUCache {
  /** @type {Map<string, string>} */
  #cache = new Map();

  /** @type {number} */
  #maxSize;

  /** @param {number} maxSize */
  constructor(maxSize = MAX_CACHE_SIZE) {
    this.#maxSize = maxSize;
  }

  /** @param {string} key */
  get(key) {
    if (!this.#cache.has(key)) return undefined;
    const value = this.#cache.get(key);
    this.#cache.delete(key);
    this.#cache.set(key, /** @type {string} */ (value));
    return value;
  }

  /** @param {string} key @param {string} value */
  set(key, value) {
    if (this.#cache.has(key)) this.#cache.delete(key);
    else if (this.#cache.size >= this.#maxSize) {
      const oldestKey = this.#cache.keys().next().value;
      if (oldestKey) this.#cache.delete(oldestKey);
    }
    this.#cache.set(key, value);
  }

  has(key) {
    return this.#cache.has(key);
  }

  clear() {
    this.#cache.clear();
  }
}

export class QuickAddComponent extends Component {
  /** @type {AbortController | null} */
  #abortController = null;
  /** @type {LRUCache} */
  #cache = new LRUCache(MAX_CACHE_SIZE);

  get productPageUrl() {
    const productCard = /** @type {import('./product-card').ProductCard | null} */ (this.closest('product-card'));
    const productLink = productCard?.getProductCardLink();

    if (!productLink?.href) return '';

    const url = new URL(productLink.href);

    const selectedVariantId = this.#getSelectedVariantId();
    if (selectedVariantId) {
      url.searchParams.set('variant', selectedVariantId);
    }

    return url.toString();
  }

  /**
   * Gets the currently selected variant ID from the product card
   * @returns {string | null} The variant ID or null
   */
  #getSelectedVariantId() {
    const productCard = /** @type {import('./product-card').ProductCard | null} */ (this.closest('product-card'));
    return productCard?.getSelectedVariantId() || null;
  }

  connectedCallback() {
    super.connectedCallback();

    mediaQueryLarge.addEventListener('change', this.#closeQuickAddModal);
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    mediaQueryLarge.removeEventListener('change', this.#closeQuickAddModal);
    this.#abortController?.abort();
  }

  /**
   * Handles quick add button click
   * @param {Event} event - The click event
   */
  handleClick = async (event) => {
    event.preventDefault();

    // Dynamic import for non-product pages (home, collection, search)
    // On product pages, scripts are already loaded via scripts.liquid
    if (window.Theme?.template?.name !== 'product') {
      await ensureProductFormScripts();
    }

    const currentUrl = this.productPageUrl;
    if (!currentUrl) return;

    let productHtml = this.#cache.get(currentUrl);

    if (!productHtml) {
      productHtml = await this.fetchQuickAddSection(currentUrl);
      if (productHtml) {
        this.#cache.set(currentUrl, productHtml);
      }
    }

    if (productHtml) {
      await this.updateQuickAddModal(productHtml);
    }

    this.#openQuickAddModal();
  };

  /** @param {QuickAddDialog} dialogComponent */
  #stayVisibleUntilDialogCloses(dialogComponent) {
    this.toggleAttribute('stay-visible', true);

    dialogComponent.addEventListener(DialogCloseEvent.eventName, () => this.toggleAttribute('stay-visible', false), {
      once: true,
    });
  }

  #openQuickAddModal = () => {
    const dialogComponent = document.getElementById('quick-add-dialog');
    if (!(dialogComponent instanceof QuickAddDialog)) return;

    this.#stayVisibleUntilDialogCloses(dialogComponent);

    dialogComponent.showDialog();
  };

  #closeQuickAddModal = () => {
    const dialogComponent = document.getElementById('quick-add-dialog');
    if (!(dialogComponent instanceof QuickAddDialog)) return;

    dialogComponent.closeDialog();
  };

  /**
   * Fetches the quick add section content
   * @param {string} productPageUrl - The URL of the product page to fetch
   * @returns {Promise<string | null>}
   */
  async fetchQuickAddSection(productPageUrl) {
    if (!productPageUrl) return null;

    const url = new URL(productPageUrl);
    url.searchParams.set('section_id', 'quick-add-content');

    this.#abortController?.abort();
    this.#abortController = new AbortController();

    try {
      const response = await fetch(url.toString(), {
        signal: this.#abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch quick add section: HTTP error ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      if (/** @type {Error} */ (error).name === 'AbortError') {
        return null;
      }
      throw error;
    } finally {
      this.#abortController = null;
    }
  }

  /**
   * Updates the modal content with the fetched HTML
   * @param {string} html - The section HTML
   */
  async updateQuickAddModal(html) {
    const modalContent = document.getElementById('quick-add-modal-content');

    if (!html || !modalContent) return;

    morph(modalContent, html);

    requestAnimationFrame(() => {
      modalContent.querySelectorAll('carousel-component').forEach((el) => {
        if (typeof el.reinit === 'function') el.reinit();
      });
    });

    this.#syncVariantSelection(modalContent);
  }

  /**
   * Syncs the variant selection from the product card to the modal
   * @param {Element} modalContent - The modal content element
   */
  #syncVariantSelection(modalContent) {
    const selectedVariantId = this.#getSelectedVariantId();
    if (!selectedVariantId) return;

    const modalInputs = modalContent.querySelectorAll('input[type="radio"][data-variant-id]');
    for (const input of modalInputs) {
      if (input instanceof HTMLInputElement && input.dataset.variantId === selectedVariantId && !input.checked) {
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }
    }
  }
}

if (!customElements.get('quick-add-component')) {
  customElements.define('quick-add-component', QuickAddComponent);
}

class QuickAddDialog extends DialogComponent {
  /** @type {AbortController} */
  #abortController = new AbortController();

  /** @type {number} */
  #touchStartX = 0;
  /** @type {number} */
  #touchStartY = 0;
  /** @type {number} */
  #lastTouchY = 0;
  /** @type {number} */
  #lastTouchTime = 0;
  /** @type {number} */
  #velocity = 0;
  /** @type {boolean} */
  #isDragging = false;
  /** @type {boolean} */
  #dragConfirmed = false;

  /** Minimum distance to trigger close if velocity is low */
  static SWIPE_THRESHOLD = 100;
  /** Minimum velocity (px/ms) to trigger close */
  static VELOCITY_THRESHOLD = 0.6;

  connectedCallback() {
    super.connectedCallback();

    const { signal } = this.#abortController;

    this.addEventListener(ThemeEvents.cartUpdate, this.#handleCartUpdate, { signal });
    this.addEventListener(ThemeEvents.variantUpdate, this.#handleVariantUpdate, { signal });
    this.addEventListener(DialogCloseEvent.eventName, this.#handleDialogClose, { signal });

    this.#initDragHandle();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#abortController.abort();
  }

  #initDragHandle() {
    const dialog = this.refs.dialog;
    const handle = /** @type {HTMLElement | null} */ (this.refs.dragHandle);
    if (!dialog || !handle) return;

    const { signal } = this.#abortController;

    handle.addEventListener('click', () => this.closeDialog(), { signal });

    dialog.addEventListener('touchstart', this.#onTouchStart, { passive: true, signal });
    dialog.addEventListener('touchmove', this.#onTouchMove, { passive: false, signal });
    dialog.addEventListener('touchend', this.#onTouchEnd, { passive: true, signal });
  }

  /**
   * @param {TouchEvent} e
   */
  #onTouchStart = (e) => {
    if (!isMobileBreakpoint()) return;

    const touch = e.touches[0];
    if (!touch) return;

    this.#touchStartX = touch.clientX;
    this.#touchStartY = touch.clientY;
    this.#lastTouchY = touch.clientY;
    this.#lastTouchTime = Date.now();
    this.#isDragging = true;
    this.#dragConfirmed = false;
    this.#velocity = 0;
  };

  /**
   * @param {TouchEvent} e
   */
  #onTouchMove = (e) => {
    if (!this.#isDragging || !isMobileBreakpoint()) return;

    const touch = e.touches[0];
    if (!touch) return;

    const deltaY = touch.clientY - this.#touchStartY;
    const deltaX = touch.clientX - this.#touchStartX;
    const currentTime = Date.now();
    const timeDelta = currentTime - this.#lastTouchTime;

    if (timeDelta > 0) {
      this.#velocity = (touch.clientY - this.#lastTouchY) / timeDelta;
    }
    this.#lastTouchY = touch.clientY;
    this.#lastTouchTime = currentTime;

    const dialog = this.refs.dialog;
    if (!(dialog instanceof HTMLElement)) return;

    if (!this.#dragConfirmed) {
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        this.#isDragging = false;
        return;
      }

      if (dialog.scrollTop > 5) {
        return;
      }

      if (deltaY > 5) {
        this.#dragConfirmed = true;
        dialog.style.transition = 'none';
        dialog.style.animation = 'none';
      } else {
        return;
      }
    }

    if (this.#dragConfirmed) {
      e.preventDefault();
      const moveY = Math.max(0, deltaY);
      dialog.style.transform = `translateY(${moveY}px)`;

      const opacity = Math.max(0, 1 - (moveY / (window.innerHeight * 0.5)));
      dialog.style.setProperty('--backdrop-opacity-multiplier', opacity.toString());
    }
  };

  /**
   * @param {TouchEvent} e
   */
  #onTouchEnd = (e) => {
    if (!this.#isDragging || !this.#dragConfirmed) {
      this.#isDragging = false;
      return;
    }

    this.#isDragging = false;
    const dialog = this.refs.dialog;
    if (!(dialog instanceof HTMLElement)) return;

    const deltaY = (e.changedTouches[0]?.clientY ?? 0) - this.#touchStartY;

    if (deltaY > QuickAddDialog.SWIPE_THRESHOLD || this.#velocity > QuickAddDialog.VELOCITY_THRESHOLD) {
      this.#dismissFromDrag();
    } else {
      dialog.style.transition = 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)';
      dialog.style.transform = '';
      dialog.style.removeProperty('--backdrop-opacity-multiplier');
    }
  };

  async #dismissFromDrag() {
    const { dialog } = this.refs;
    if (!(dialog instanceof HTMLDialogElement)) return;

    this.#isDragging = false;
    this.#dragConfirmed = false;

    dialog.style.removeProperty('--backdrop-opacity-multiplier');

    await this.closeDialog();

    dialog.style.transform = '';
    dialog.style.transition = '';
    dialog.style.animation = '';
  }

  /**
   * @param {CartUpdateEvent} event
   */
  #handleCartUpdate = (event) => {
    if (event.detail.data.didError) return;
    this.closeDialog();
  };

  /**
   * @param {CustomEvent} event
   */
  #handleVariantUpdate = (event) => {
    const html = event.detail?.data?.html;
    if (!html) return;

    const galleryContainer = /** @type {HTMLElement | null} */ (this.querySelector('.quick-add-content__media'));
    const newGallerySource = html.querySelector('.quick-add-content__media');

    if (galleryContainer && newGallerySource) {
      morph(galleryContainer, newGallerySource);

      requestAnimationFrame(() => {
        galleryContainer.querySelectorAll('carousel-component').forEach((el) => {
          if (typeof el.reinit === 'function') el.reinit();
        });
      });
    }

    const variantPicker = html.querySelector('variant-picker');
    const productUrl = variantPicker?.dataset?.productUrl;
    if (!productUrl) return;

    const variantId = event.detail?.resource?.id;
    const url = new URL(productUrl, window.location.origin);
    if (variantId) url.searchParams.set('variant', variantId);

    const href = url.pathname + url.search;
    const viewDetailsLink = /** @type {HTMLAnchorElement} */ (this.querySelector('.quick-add-content__view-details'));
    const productTitleLink = /** @type {HTMLAnchorElement} */ (this.querySelector('.quick-add-content__title'));

    if (viewDetailsLink) viewDetailsLink.href = href;
    if (productTitleLink) productTitleLink.href = href;
  };

  #handleDialogClose = () => {
    const iosVersion = getIOSVersion();

    if (!iosVersion || iosVersion.major >= 17 || (iosVersion.major === 16 && iosVersion.minor >= 4)) return;

    requestAnimationFrame(() => {
      const grid = /** @type {HTMLElement | null} */ (document.querySelector('#ResultsList [product-grid-view]'));
      if (grid) {
        const currentWidth = grid.getBoundingClientRect().width;
        grid.style.width = `${currentWidth - 1}px`;
        requestAnimationFrame(() => {
          grid.style.width = '';
        });
      }
    });
  };
}

if (!customElements.get('quick-add-dialog')) {
  customElements.define('quick-add-dialog', QuickAddDialog);
}
