import { morph } from '@theme/morph';
import { Component } from '@theme/component';
import { CartUpdateEvent, ThemeEvents } from '@theme/events';
import { DialogComponent, DialogCloseEvent } from '@theme/dialog';
import { mediaQueryLarge, isMobileBreakpoint, getIOSVersion } from '@theme/utilities';

export class QuickAddComponent extends Component {
  /** @type {AbortController | null} */
  #abortController = null;
  /** @type {Map<string, string>} */
  #cachedContent = new Map();

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

    const currentUrl = this.productPageUrl;
    console.log('[QuickAdd] handleClick - URL:', currentUrl);

    // Check if we have cached content for this URL
    /** @type {string | null | undefined} */
    let productHtml = this.#cachedContent.get(currentUrl);

    if (!productHtml) {
      console.log('[QuickAdd] Cache miss. Fetching section...');
      // Fetch and cache the content
      productHtml = await this.fetchQuickAddSection(currentUrl);
      if (productHtml) {
        this.#cachedContent.set(currentUrl, productHtml);
      } else {
        console.error('[QuickAdd] FAILED to fetch quick add section');
      }
    } else {
      console.log('[QuickAdd] Cache hit.');
    }

    if (productHtml) {
      console.log('[QuickAdd] Updating modal...');
      await this.updateQuickAddModal(productHtml);
    } else {
      console.error('[QuickAdd] No content to display');
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

    // We use this to abort the previous fetch request if it's still pending.
    this.#abortController?.abort();
    this.#abortController = new AbortController();

    try {
      const response = await fetch(url.toString(), {
        signal: this.#abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch quick add section: HTTP error ${response.status}`);
      }

      const responseText = await response.text();
      return responseText;
    } catch (error) {
      if (error.name === 'AbortError') {
        return null;
      } else {
        throw error;
      }
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

    // morph preserves custom elements without calling connectedCallback again.
    // We must manually re-initialize the carousel so it re-reads its attributes
    // and rebuilds any dynamically-generated nodes (dots, arrows visibility, CSS vars).
    requestAnimationFrame(() => {
      modalContent.querySelectorAll('carousel-component').forEach(el => {
        // @ts-ignore — reinit() is defined on CarouselComponent
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

    // Find and check the corresponding input in the modal
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
  #abortController = new AbortController();

  /* ── Drag-to-dismiss gesture (mobile bottom-sheet) ── */

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

    this.addEventListener(ThemeEvents.cartUpdate, this.handleCartUpdate, { signal });
    this.addEventListener(ThemeEvents.variantUpdate, this.#handleVariantUpdate, { signal });
    this.addEventListener(DialogCloseEvent.eventName, this.#handleDialogClose, { signal });

    // Drag handle: tap to close + swipe-down to dismiss
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

    // Tap handle to close
    handle.addEventListener('click', () => this.closeDialog(), { signal });

    // Drag gesture on the entire dialog
    dialog.addEventListener('touchstart', this.#onTouchStart, { passive: true, signal });
    dialog.addEventListener('touchmove', this.#onTouchMove, { passive: false, signal });
    dialog.addEventListener('touchend', this.#onTouchEnd, { passive: true, signal });
  }

  #onTouchStart = (/** @type {TouchEvent} */ e) => {
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

  #onTouchMove = (/** @type {TouchEvent} */ e) => {
    if (!this.#isDragging || !isMobileBreakpoint()) return;

    const touch = e.touches[0];
    if (!touch) return;

    const deltaY = touch.clientY - this.#touchStartY;
    const deltaX = touch.clientX - this.#touchStartX;
    const currentTime = Date.now();
    const timeDelta = currentTime - this.#lastTouchTime;

    // Calculate instantaneous velocity
    if (timeDelta > 0) {
      this.#velocity = (touch.clientY - this.#lastTouchY) / timeDelta;
    }
    this.#lastTouchY = touch.clientY;
    this.#lastTouchTime = currentTime;

    const dialog = this.refs.dialog;
    if (!(dialog instanceof HTMLElement)) return;

    // If we haven't confirmed the drag yet, check if we should
    if (!this.#dragConfirmed) {
      // Don't drag if scrolling horizontally (e.g. inside a carousel)
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        this.#isDragging = false;
        return;
      }

      // Don't drag if we are scrolling down INSIDE the modal content
      if (dialog.scrollTop > 5) {
        return;
      }

      // Only start drag if moving downward
      if (deltaY > 5) {
        this.#dragConfirmed = true;
        dialog.style.transition = 'none';
        dialog.style.animation = 'none'; // CRITICAL: Prevent CSS animation from locking transform
      } else {
        return;
      }
    }

    // If drag is confirmed, move the dialog and update backdrop
    if (this.#dragConfirmed) {
      e.preventDefault();
      const moveY = Math.max(0, deltaY);
      dialog.style.transform = `translateY(${moveY}px)`;

      // Backdrop opacity scaling
      const opacity = Math.max(0, 1 - (moveY / (window.innerHeight * 0.5)));
      dialog.style.setProperty('--backdrop-opacity-multiplier', opacity.toString());
    }
  };

  #onTouchEnd = (/** @type {TouchEvent} */ e) => {
    if (!this.#isDragging || !this.#dragConfirmed) {
      this.#isDragging = false;
      return;
    }

    this.#isDragging = false;
    const dialog = this.refs.dialog;
    if (!(dialog instanceof HTMLElement)) return;

    const deltaY = (e.changedTouches[0]?.clientY ?? 0) - this.#touchStartY;

    // Dismiss if crossed threshold OR velocity is high enough
    if (deltaY > QuickAddDialog.SWIPE_THRESHOLD || this.#velocity > QuickAddDialog.VELOCITY_THRESHOLD) {
      this.#dismissFromDrag();
    } else {
      // Snap back
      dialog.style.transition = 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)';
      dialog.style.transform = '';
      dialog.style.removeProperty('--backdrop-opacity-multiplier');
    }
  };

  /**
   * Finalizes the dismissal after a successful drag gesture
   */
  async #dismissFromDrag() {
    const { dialog } = this.refs;
    if (!(dialog instanceof HTMLDialogElement)) return;

    // Reset local dragging state immediately to prevent multi-triggering
    this.#isDragging = false;
    this.#dragConfirmed = false;

    // Reset backdrop multiplier so it doesn't conflict with final removal
    dialog.style.removeProperty('--backdrop-opacity-multiplier');

    // Use the standard close method.
    // Because we removed the 'from' in bottomSheetSlideOut CSS,
    // it will now animate correctly from the current deltaY position.
    await this.closeDialog();

    // Cleanup inline styles after it's closed
    dialog.style.transform = '';
    dialog.style.transition = '';
    dialog.style.animation = '';
  }

  /* ── Existing handlers ── */

  /**
   * Closes the dialog
   * @param {CartUpdateEvent} event - The cart update event
   */
  handleCartUpdate = (event) => {
    if (event.detail.data.didError) return;
    this.closeDialog();
  };

  #handleVariantUpdate = (/** @type {CustomEvent} */ event) => {
    const html = event.detail?.data?.html;
    if (!html) return;

    // 1. Update Gallery
    const galleryContainer = /** @type {HTMLElement | null} */ (this.querySelector('.quick-add-content__media'));
    const newGallerySource = html.querySelector('.quick-add-content__media');

    if (galleryContainer && newGallerySource) {
      morph(galleryContainer, newGallerySource);

      // Re-initialize any carousel in the newly morphed gallery
      requestAnimationFrame(() => {
        galleryContainer.querySelectorAll('carousel-component').forEach(el => {
          // @ts-ignore
          if (typeof el.reinit === 'function') el.reinit();
        });
      });
    }

    // 2. Update Links (Title & View Details)
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
    /**
     * This is a patch to solve an issue with the UI freezing when the dialog is closed.
     * To reproduce it, use iOS 16.0.
     */
    if (!iosVersion || iosVersion.major >= 17 || (iosVersion.major === 16 && iosVersion.minor >= 4)) return;

    requestAnimationFrame(() => {
      /** @type {HTMLElement | null} */
      const grid = document.querySelector('#ResultsList [product-grid-view]');
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
