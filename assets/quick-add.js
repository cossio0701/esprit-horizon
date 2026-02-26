import { morph } from '@theme/morph';
import { Component } from '@theme/component';
import { CartUpdateEvent, ThemeEvents } from '@theme/events';
import { DialogComponent, DialogCloseEvent } from '@theme/dialog';
import { mediaQueryLarge, isMobileBreakpoint, getIOSVersion } from '@theme/utilities';

export class QuickAddComponent extends Component {
  /** @type {AbortController | null} */
  #abortController = null;
  /** @type {Map<string, Element>} */
  #cachedContent = new Map();

  get productPageUrl() {
    const productCard = /** @type {import('./product-card').ProductCard | null} */ (this.closest('product-card'));
    const productLink = productCard?.getProductCardLink();

    if (!productLink?.href) return '';

    const url = new URL(productLink.href);

    if (url.searchParams.has('variant')) {
      url.searchParams.set('quick_add', 'true');
      return url.toString();
    }

    const selectedVariantId = this.#getSelectedVariantId();
    if (selectedVariantId) {
      url.searchParams.set('variant', selectedVariantId);
    }

    url.searchParams.set('quick_add', 'true');
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
    let productGrid = this.#cachedContent.get(currentUrl);

    if (!productGrid) {
      console.log('[QuickAdd] Cache miss. Fetching...');
      // Fetch and cache the content
      const html = await this.fetchProductPage(currentUrl);
      if (html) {
        console.log('[QuickAdd] Fetch successful. Parsing...');
        const gridElement = html.querySelector('[data-product-grid-content]');
        if (gridElement) {
          console.log('[QuickAdd] Found [data-product-grid-content]');
          // Cache the cloned element to avoid modifying the original
          productGrid = /** @type {Element} */ (gridElement.cloneNode(true));
          this.#cachedContent.set(currentUrl, productGrid);
        } else {
          console.warn('[QuickAdd] FAILED to find [data-product-grid-content]');
        }
      } else {
        console.error('[QuickAdd] FAILED to fetch product page');
      }
    } else {
      console.log('[QuickAdd] Cache hit.');
    }

    if (productGrid) {
      console.log('[QuickAdd] Updating modal...');
      // Use a fresh clone from the cache
      const freshContent = /** @type {Element} */ (productGrid.cloneNode(true));
      await this.updateQuickAddModal(freshContent);
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
   * Fetches the product page content
   * @param {string} productPageUrl - The URL of the product page to fetch
   * @returns {Promise<Document | null>}
   */
  async fetchProductPage(productPageUrl) {
    if (!productPageUrl) return null;

    // We use this to abort the previous fetch request if it's still pending.
    this.#abortController?.abort();
    this.#abortController = new AbortController();

    try {
      const response = await fetch(productPageUrl, {
        signal: this.#abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch product page: HTTP error ${response.status}`);
      }

      const responseText = await response.text();
      const html = new DOMParser().parseFromString(responseText, 'text/html');

      return html;
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
   * Re-renders the variant picker.
   * @param {Element} productGrid - The product grid element
   */
  async updateQuickAddModal(productGrid) {
    const modalContent = document.getElementById('quick-add-modal-content');
    console.log('[QuickAdd] updateQuickAddModal - grid:', productGrid, 'modal:', modalContent);

    if (!productGrid || !modalContent) return;

    // Extract key elements
    const mediaGallery = productGrid.querySelector('.product-information__media, .section-variant-gallery, .gallery-main-container');
    const productPrice = productGrid.querySelector('product-price');
    const variantPicker = productGrid.querySelector('variant-picker');
    const productFormComponent = productGrid.querySelector('product-form-component');

    // Create or find Title
    let productTitle = productGrid.querySelector('.product-title');
    if (!productTitle) {
      productTitle = document.createElement('a');
      productTitle.classList.add('product-title', 'h3');
      productTitle.textContent = this.dataset.productTitle || '';
      /** @type {HTMLAnchorElement} */ (productTitle).href = this.productPageUrl;
    }

    // Clear current grid content to rearrange
    productGrid.innerHTML = '';

    // 1. Media Gallery on top
    if (mediaGallery) {
      console.log('[QuickAdd] Appending Media Gallery');
      productGrid.appendChild(mediaGallery);
    }

    // Create a container for the info below media
    const infoContainer = document.createElement('div');
    infoContainer.classList.add('quick-add-modal__info');

    // 2. Title and Price
    const productHeader = document.createElement('div');
    productHeader.classList.add('product-header');
    productHeader.appendChild(productTitle);
    if (productPrice) {
      productHeader.appendChild(productPrice);
    }
    infoContainer.appendChild(productHeader);

    // 3. Variant Picker
    if (variantPicker) {
      infoContainer.appendChild(variantPicker);
    }

    // 4. Product Form
    if (productFormComponent) {
      infoContainer.appendChild(productFormComponent);
    }

    productGrid.appendChild(infoContainer);

    console.log('[QuickAdd] Morphing content...');
    morph(modalContent, productGrid);

    // Configuración del carrusel para el modal: 2 columnas en mobile y loop infinito
    modalContent.querySelectorAll('carousel-component').forEach((carousel) => {
      carousel.setAttribute('columns-mobile', '2');
      carousel.setAttribute('gap', '10');
      carousel.setAttribute('show-dots', 'true');
      carousel.setAttribute('thumbs-mobile', 'none');
      carousel.setAttribute('thumbs-desktop', 'none');
      carousel.setAttribute('loop', 'true');
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

  connectedCallback() {
    super.connectedCallback();

    this.addEventListener(ThemeEvents.cartUpdate, this.handleCartUpdate, { signal: this.#abortController.signal });
    this.addEventListener(ThemeEvents.variantUpdate, this.#updateProductTitleLink);

    this.addEventListener(DialogCloseEvent.eventName, this.#handleDialogClose);
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    this.#abortController.abort();
    this.removeEventListener(DialogCloseEvent.eventName, this.#handleDialogClose);
  }

  /**
   * Closes the dialog
   * @param {CartUpdateEvent} event - The cart update event
   */
  handleCartUpdate = (event) => {
    if (event.detail.data.didError) return;
    this.closeDialog();
  };

  #updateProductTitleLink = (/** @type {CustomEvent} */ event) => {
    const anchorElement = /** @type {HTMLAnchorElement} */ (
      event.detail.data.html?.querySelector('.view-product-title a')
    );
    const viewMoreDetailsLink = /** @type {HTMLAnchorElement} */ (this.querySelector('.view-product-title a'));
    const mobileProductTitle = /** @type {HTMLAnchorElement} */ (this.querySelector('.product-header a'));

    if (!anchorElement) return;

    if (viewMoreDetailsLink) viewMoreDetailsLink.href = anchorElement.href;
    if (mobileProductTitle) mobileProductTitle.href = anchorElement.href;
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
