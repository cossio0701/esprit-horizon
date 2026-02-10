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
    const productLink = productCard?.getProductCardLink?.();

    // Try to get URL from product card link first
    let baseUrl = productLink?.href;

    // Fallback to data-product-url attribute
    if (!baseUrl && this.dataset.productUrl) {
      baseUrl = this.dataset.productUrl;
    }

    if (!baseUrl) return '';

    const url = new URL(baseUrl, window.location.origin);

    if (url.searchParams.has('variant')) {
      return url.toString();
    }

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

    if (!currentUrl) {
      const productUrl = this.dataset.productUrl;
      if (productUrl) {
        window.location.href = productUrl;
      }
      return;
    }

    // Check if we have cached content for this URL
    let productGrid = this.#cachedContent.get(currentUrl);

    if (!productGrid) {
      const html = await this.fetchProductPage(currentUrl);

      if (html) {
        console.log('[QuickAdd] Fetched HTML document');

        // Try multiple selectors to find the product content
        const contentSelectors = [
          '[data-product-grid-content]',
          '.pdp-main-container',
          '.product-grid-content',
          '.product-information',
          'main .product',
          '#MainProduct',
          '.product-section',
          'section[data-section-type="product"]',
          '.shopify-section-template-product'
        ];

        let gridElement = null;
        for (const selector of contentSelectors) {
          gridElement = html.querySelector(selector);
          console.log(`[QuickAdd] Trying selector "${selector}":`, !!gridElement);
          if (gridElement) {
            console.log('[QuickAdd] Found element with selector:', selector);
            console.log('[QuickAdd] Element class:', gridElement.className);
            // Check if gallery exists inside
            const hasGallery = gridElement.querySelector('.section-variant-gallery, .gallery-main-container, .variant-swipers');
            console.log('[QuickAdd] Has gallery inside:', !!hasGallery);
            break;
          }
        }

        if (gridElement) {
          productGrid = /** @type {Element} */ (gridElement.cloneNode(true));
          this.#cachedContent.set(currentUrl, productGrid);
          console.log('[QuickAdd] Cloned and cached productGrid');
        } else {
          // Fallback: use the entire body content
          console.log('[QuickAdd] No grid element found, using body fallback');
          const bodyContent = html.querySelector('body');
          if (bodyContent) {
            productGrid = /** @type {Element} */ (bodyContent.cloneNode(true));
            this.#cachedContent.set(currentUrl, productGrid);
          }
        }
      }
    }

    if (productGrid) {
      const freshContent = /** @type {Element} */ (productGrid.cloneNode(true));
      await this.updateQuickAddModal(freshContent);
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

    if (!dialogComponent) {
      return;
    }

    if (typeof /** @type {any} */ (dialogComponent).showDialog !== 'function') {
      const dialogEl = dialogComponent.querySelector('dialog');
      if (dialogEl && typeof dialogEl.showModal === 'function') {
        dialogEl.showModal();
        return;
      }
      return;
    }

    if (dialogComponent instanceof QuickAddDialog) {
      this.#stayVisibleUntilDialogCloses(dialogComponent);
    }

    /** @type {any} */ (dialogComponent).showDialog();
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
      if (/** @type {Error} */ (error).name === 'AbortError') {
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

    if (!productGrid || !modalContent) return;

    if (isMobileBreakpoint()) {
      const mobileView = this.#buildMobileView(productGrid);
      if (mobileView) {
        // Keep the swipe handle, remove everything else
        const swipeHandle = modalContent.querySelector('[data-swipe-handle]');
        modalContent.innerHTML = '';

        // Re-add swipe handle first
        if (swipeHandle) {
          modalContent.appendChild(swipeHandle);
        } else {
          // Create swipe handle if it doesn't exist
          const newHandle = document.createElement('div');
          newHandle.className = 'quick-add-modal__swipe-handle';
          newHandle.setAttribute('data-swipe-handle', '');
          modalContent.appendChild(newHandle);
        }

        modalContent.appendChild(mobileView);

        // Wait for DOM to update then reinitialize web components
        requestAnimationFrame(() => {
          this.#reinitializeWebComponents(modalContent);
        });
        return;
      }
    }

    morph(modalContent, productGrid);
    this.#syncVariantSelection(modalContent);
  }

  /**
   * Reinitializes web components after they've been cloned and inserted
   * @param {Element} container - The container with cloned components
   */
  #reinitializeWebComponents(container) {
    // For variant-picker, we need to dispatch events to re-sync with the form
    const variantPicker = container.querySelector('variant-picker');
    if (variantPicker) {
      // Trigger change event on the currently selected radio
      const checkedInput = variantPicker.querySelector('input[type="radio"]:checked');
      if (checkedInput) {
        checkedInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    // Re-connect product-form-component
    const productForm = container.querySelector('product-form-component');
    if (productForm && typeof /** @type {any} */ (productForm).connectedCallback === 'function') {
      try {
        /** @type {any} */ (productForm).connectedCallback();
      } catch (e) {
        // Ignore errors from double initialization
      }
    }
  }

  /**
   * Builds the custom mobile view HTML structure using cloned Shopify components
   * @param {Element} productGrid - The product grid element from fetch
   * @returns {HTMLElement} The mobile view container
   */
  #buildMobileView(productGrid) {
    const container = document.createElement('div');
    container.className = 'qam-mobile-view';

    // Extract product data
    const productUrl = this.productPageUrl;
    const productTitle = this.dataset.productTitle ||
      productGrid.querySelector('.view-product-title a, h1, .product-title, [class*="title"] a, .qam-title')?.textContent?.trim() ||
      'Producto';

    // Extract product reference (Ref: color_group metafield)
    const refEl = productGrid.querySelector('[class*="product-ref"]');
    const productRef = refEl ? refEl.textContent.trim() : '';

    // Get images from fetched product page (has all images), fallback to card
    const images = this.#extractImages(productGrid);

    // Clone the price element - try multiple selectors
    const priceSelectors = ['product-price', '.price-wrapper', '.price', '[data-product-price]'];
    let priceClone = null;
    for (const selector of priceSelectors) {
      const priceEl = productGrid.querySelector(selector);
      if (priceEl && priceEl.textContent?.trim()) {
        priceClone = priceEl.cloneNode(true);
        break;
      }
    }

    // Clone the variant picker - keep everything for proper functionality
    const variantPicker = productGrid.querySelector('variant-picker');
    let variantPickerClone = null;
    if (variantPicker) {
      variantPickerClone = /** @type {Element} */ (variantPicker.cloneNode(true));
      // Only remove internal buttons that would conflict, keep the form structure
      variantPickerClone.querySelectorAll('.buy-buttons-block, button[type="submit"]').forEach(el => el.remove());
    }

    // Clone the product form component
    const productForm = productGrid.querySelector('product-form-component');
    let formClone = null;
    if (productForm) {
      formClone = /** @type {Element} */ (productForm.cloneNode(true));
      // Remove variant picker from form clone if present (we show it separately)
      formClone.querySelectorAll('variant-picker').forEach(el => el.remove());
    }

    // Build the base HTML structure
    container.innerHTML = `
      <!-- Image Gallery -->
      <div class="qam-gallery">
        <div class="qam-gallery__track">
          ${images.map((img, i) => `
            <div class="qam-gallery__slide">
              <img
                class="qam-gallery__image"
                src="${img.src}"
                alt="${this.#escapeHtml(img.alt || productTitle)}"
                loading="${i === 0 ? 'eager' : 'lazy'}"
                onerror="this.parentElement.style.display='none'"
              >
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Product Info -->
      <div class="qam-info">
        <h2 class="qam-title">${this.#escapeHtml(productTitle)}</h2>
        ${productRef ? `<span class="qam-ref">${this.#escapeHtml(productRef)}</span>` : ''}
        <div class="qam-price-container"></div>
        <div class="qam-divider"></div>
      </div>

      <!-- Variant Selectors -->
      <div class="qam-variants"></div>

      <!-- Actions -->
      <div class="qam-actions">
        <div class="qam-form-container"></div>
        <a href="${productUrl}" class="qam-view-details">Ver todos los detalles</a>
      </div>
    `;

    // Insert cloned elements
    if (priceClone) {
      const priceContainer = container.querySelector('.qam-price-container');
      if (priceContainer) priceContainer.appendChild(priceClone);
    }

    if (variantPickerClone) {
      const variantsContainer = container.querySelector('.qam-variants');
      if (variantsContainer) variantsContainer.appendChild(variantPickerClone);
    }

    if (formClone) {
      const formContainer = container.querySelector('.qam-form-container');
      if (formContainer) formContainer.appendChild(formClone);
    }

    return container;
  }

  /**
   * Extracts images from the product card element
   * @returns {Array<{src: string, alt: string}> | null}
   */
  #extractImagesFromCard() {
    const productCard = this.closest('product-card');
    if (!productCard) return null;

    /** @type {Array<{src: string, alt: string}>} */
    const images = [];
    /** @type {Set<string>} */
    const seenSrcs = new Set();

    // Only get images from the card gallery (product images), not swatches or other elements
    const cardGallery = productCard.querySelector('.card-gallery, [class*="card-gallery"]');
    if (!cardGallery) return null;

    // Get images specifically from product media containers or slideshow slides
    const imgSelectors = [
      '.product-media-container img',
      'slideshow-slide img',
      '.product-media img',
      'img[src*="/products/"]'
    ];

    /** @type {NodeListOf<HTMLImageElement>} */
    let imgElements = cardGallery.querySelectorAll(imgSelectors.join(', '));

    // If no images found with specific selectors, try getting direct img children
    if (imgElements.length === 0) {
      imgElements = cardGallery.querySelectorAll('img');
    }

    imgElements.forEach((img) => {
      let src = img.getAttribute('src') || img.getAttribute('data-src') || '';

      // Skip empty, icons, logos, swatches, and tiny images
      if (!src ||
          src.includes('icon') ||
          src.includes('logo') ||
          src.includes('swatch') ||
          src.includes('badge') ||
          src.includes('placeholder') ||
          img.width < 50 ||
          img.height < 50) {
        return;
      }

      // Normalize URL
      if (src.startsWith('//')) src = 'https:' + src;
      else if (src.startsWith('/')) src = window.location.origin + src;

      // Only include product images from Shopify CDN
      if (src.includes('cdn.shopify') && src.includes('/products/')) {
        const normalizedSrc = src.replace(/(_\d+x\d*)/g, '').split('?')[0] || src;
        if (!seenSrcs.has(normalizedSrc)) {
          seenSrcs.add(normalizedSrc);
          const finalSrc = src.replace(/(_\d+x\d*)/g, '_800x').replace(/width=\d+/g, 'width=800');
          images.push({ src: finalSrc, alt: img.alt || '' });
        }
      }
    });

    return images.length > 0 ? images : null;
  }

  /**
   * Extracts images from the product grid
   * @param {Element} productGrid
   * @returns {Array<{src: string, alt: string}>}
   */
  #extractImages(productGrid) {
    /** @type {Array<{src: string, alt: string}>} */
    const images = [];
    /** @type {Set<string>} */
    const seenSrcs = new Set();
    /** @type {Element[]} */
    let imgElements = [];

    // DEBUG
    console.log('[QuickAdd] ========== EXTRACTING IMAGES ==========');
    console.log('[QuickAdd] productGrid tagName:', productGrid.tagName);
    console.log('[QuickAdd] productGrid className:', productGrid.className);

    // Check what containers exist
    const sectionVariantGallery = productGrid.querySelector('.section-variant-gallery');
    const galleryMainContainer = productGrid.querySelector('.gallery-main-container');
    const variantSwipers = productGrid.querySelector('.variant-swipers');

    console.log('[QuickAdd] .section-variant-gallery found:', !!sectionVariantGallery);
    console.log('[QuickAdd] .gallery-main-container found:', !!galleryMainContainer);
    console.log('[QuickAdd] .variant-swipers found:', !!variantSwipers);

    // PRIORITY 1: Try .variant-swipers > .variant-swiper > .swiper > .swiper-slide img
    // This is the exact structure from _product-gallery-pdp.liquid
    if (variantSwipers) {
      // First try visible swiper (the one without hidden attribute)
      const visibleSwiper = variantSwipers.querySelector('.variant-swiper:not([hidden])');
      if (visibleSwiper) {
        // Get images from .swiper-wrapper > .swiper-slide > img (not thumbnails)
        imgElements = Array.from(visibleSwiper.querySelectorAll('.swiper-wrapper .swiper-slide img'));
        console.log('[QuickAdd] Images from visible variant-swiper:', imgElements.length);
      }

      // If no images from visible, try ALL swipers (including hidden ones for all colors)
      if (imgElements.length === 0) {
        const allSwiperSlides = variantSwipers.querySelectorAll('.variant-swiper .swiper-wrapper .swiper-slide img');
        imgElements = Array.from(allSwiperSlides);
        console.log('[QuickAdd] Images from ALL variant-swipers:', imgElements.length);
      }
    }

    // PRIORITY 2: Try .gallery-main-container
    if (imgElements.length === 0 && galleryMainContainer) {
      imgElements = Array.from(galleryMainContainer.querySelectorAll('.swiper-wrapper .swiper-slide img'));
      console.log('[QuickAdd] Images from gallery-main-container:', imgElements.length);
    }

    // PRIORITY 3: Try .section-variant-gallery
    if (imgElements.length === 0 && sectionVariantGallery) {
      // Get swiper-wrapper images, not thumbnails
      imgElements = Array.from(sectionVariantGallery.querySelectorAll('.swiper-wrapper .swiper-slide img'));
      console.log('[QuickAdd] Images from section-variant-gallery .swiper-wrapper:', imgElements.length);

      // If still nothing, try all images except thumbnails
      if (imgElements.length === 0) {
        const allImgs = sectionVariantGallery.querySelectorAll('img');
        imgElements = Array.from(allImgs).filter(img => !img.closest('.variant-thumb') && !img.closest('.variant-thumbs'));
        console.log('[QuickAdd] Images from section-variant-gallery (filtered):', imgElements.length);
      }
    }

    // PRIORITY 4: Generic swiper-wrapper images anywhere
    if (imgElements.length === 0) {
      const swiperWrapperImgs = productGrid.querySelectorAll('.swiper-wrapper .swiper-slide img');
      imgElements = Array.from(swiperWrapperImgs).filter(img => !img.closest('.variant-thumb') && !img.closest('.variant-thumbs'));
      console.log('[QuickAdd] Images from any .swiper-wrapper:', imgElements.length);
    }

    // PRIORITY 5: Try media gallery selectors (for themes without variant swiper)
    if (imgElements.length === 0) {
      const mediaSelectors = [
        'media-gallery img',
        '.product-information__media img',
        '.product-media-container img',
        'slideshow-slide img',
        '.product-gallery img'
      ];

      for (const selector of mediaSelectors) {
        const found = productGrid.querySelectorAll(selector);
        if (found.length > 0) {
          imgElements = Array.from(found);
          console.log(`[QuickAdd] Found ${imgElements.length} images with: ${selector}`);
          break;
        }
      }
    }

    // PRIORITY 6: Any Shopify CDN product images
    if (imgElements.length === 0) {
      imgElements = Array.from(productGrid.querySelectorAll('img[src*="cdn.shopify"][src*="/products/"]'));
      console.log('[QuickAdd] Images from CDN with /products/:', imgElements.length);
    }

    // PRIORITY 7: Last resort - all images
    if (imgElements.length === 0) {
      imgElements = Array.from(productGrid.querySelectorAll('img'));
      console.log('[QuickAdd] ALL img elements:', imgElements.length);
    }

    // Process found images
    console.log('[QuickAdd] Processing', imgElements.length, 'image elements...');

    imgElements.forEach((img, index) => {
      const imgEl = /** @type {HTMLImageElement} */ (img);

      // Skip thumbnails
      if (imgEl.closest('.variant-thumb') || imgEl.closest('.variant-thumbs')) {
        console.log(`[QuickAdd] Image ${index}: SKIPPED (thumbnail)`);
        return;
      }

      // Get src - check ALL possible attributes
      let src = imgEl.getAttribute('src') ||
                imgEl.getAttribute('data-src') ||
                imgEl.getAttribute('data-srcset')?.split(' ')[0] ||
                imgEl.getAttribute('srcset')?.split(' ')[0] ||
                '';

      // DEBUG: Log all attributes of the image
      console.log(`[QuickAdd] Image ${index} attributes:`, {
        src: imgEl.getAttribute('src'),
        dataSrc: imgEl.getAttribute('data-src'),
        srcset: imgEl.getAttribute('srcset'),
        dataSrcset: imgEl.getAttribute('data-srcset'),
        loading: imgEl.getAttribute('loading'),
        outerHTML: imgEl.outerHTML.substring(0, 200)
      });

      if (!src) {
        console.log(`[QuickAdd] Image ${index}: SKIPPED (no src found)`);
        return;
      }

      console.log(`[QuickAdd] Image ${index} src:`, src);

      // Skip non-product images
      const excludePatterns = [
        'icon', 'logo', 'placeholder', 'spinner', 'loading',
        'wash', 'care', 'lavado', 'cuidado', 'instruc',
        'badge', 'swatch', 'payment', 'shipping', '1x1'
      ];

      const srcLower = src.toLowerCase();
      if (excludePatterns.some(pattern => srcLower.includes(pattern))) {
        console.log(`[QuickAdd] Image ${index}: SKIPPED (excluded pattern)`);
        return;
      }

      // Skip tiny thumbnail URLs
      if (src.includes('_150x') || src.includes('width=150') || src.includes('_100x')) {
        console.log(`[QuickAdd] Image ${index}: SKIPPED (thumbnail URL)`);
        return;
      }

      // Normalize URL
      if (src.startsWith('//')) src = 'https:' + src;
      else if (src.startsWith('/')) src = window.location.origin + src;

      // Check if it's a valid Shopify image (CDN or local dev /cdn/shop/)
      const isShopifyCDN = src.includes('cdn.shopify');
      const isLocalShopifyCDN = src.includes('/cdn/shop/');
      const isValidImage = isShopifyCDN || isLocalShopifyCDN || (src.startsWith('http') && src.match(/\.(jpg|jpeg|png|webp|gif)/i));

      console.log(`[QuickAdd] Image ${index} isShopifyCDN:`, isShopifyCDN, 'isLocalCDN:', isLocalShopifyCDN);

      if (isValidImage) {
        const normalizedSrc = src.replace(/(_\d+x\d*|\d+x\d*|width=\d+|height=\d+)/g, '').split('?')[0] || src;

        if (!seenSrcs.has(normalizedSrc)) {
          seenSrcs.add(normalizedSrc);

          // For Shopify CDN, optimize the size
          let finalSrc = src;
          if (isShopifyCDN) {
            finalSrc = src.replace(/(_\d+x\d*)/g, '_800x').replace(/width=\d+/g, 'width=800');
            if (!finalSrc.includes('_800x') && !finalSrc.includes('width=800')) {
              finalSrc = finalSrc.replace(/\.(jpg|jpeg|png|webp|gif)/i, '_800x.$1');
            }
          } else if (isLocalShopifyCDN) {
            // For local dev, just adjust width param
            finalSrc = src.replace(/width=\d+/g, 'width=800');
          }

          images.push({ src: finalSrc, alt: imgEl.alt || '' });
          console.log(`[QuickAdd] ✓ ADDED image ${images.length}:`, finalSrc.substring(0, 100));
        } else {
          console.log(`[QuickAdd] Image ${index}: SKIPPED (duplicate)`);
        }
      } else {
        console.log(`[QuickAdd] Image ${index}: SKIPPED (not valid URL)`);
      }
    });

    console.log('[QuickAdd] ========== TOTAL IMAGES:', images.length, '==========');

    // Fallback: product card image
    if (images.length === 0) {
      const productCard = this.closest('product-card');
      if (productCard) {
        const cardImg = productCard.querySelector('img');
        if (cardImg) {
          let src = cardImg.getAttribute('src') || cardImg.getAttribute('data-src') || '';
          if (src) {
            if (src.startsWith('//')) src = 'https:' + src;
            else if (src.startsWith('/')) src = window.location.origin + src;
            images.push({ src, alt: cardImg.alt || '' });
            console.log('[QuickAdd] Used card fallback image');
          }
        }
      }
    }

    // Final placeholder fallback
    if (images.length === 0) {
      images.push({
        src: 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png',
        alt: 'Producto'
      });
      console.log('[QuickAdd] Used placeholder');
    }

    return images.slice(0, 12);
  }

  /**
   * Escapes HTML to prevent XSS
   * @param {string} str
   * @returns {string}
   */
  #escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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
  #abortController = new AbortController();
  #swipeStartY = 0;
  #swipeCurrentY = 0;
  #isDragging = false;

  connectedCallback() {
    super.connectedCallback();

    this.addEventListener(ThemeEvents.cartUpdate, this.handleCartUpdate, { signal: this.#abortController.signal });
    this.addEventListener(ThemeEvents.variantUpdate, this.#updateProductTitleLink);

    this.addEventListener(DialogCloseEvent.eventName, this.#handleDialogClose);

    // Initialize swipe-to-dismiss for mobile
    this.#initSwipeToDismiss();
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    this.#abortController.abort();
    this.removeEventListener(DialogCloseEvent.eventName, this.#handleDialogClose);
  }

  /**
   * Initialize swipe-to-dismiss functionality for mobile bottom sheet
   */
  #initSwipeToDismiss() {
    const dialog = this.querySelector('dialog');
    const swipeHandle = this.querySelector('[data-swipe-handle]');
    const content = this.querySelector('.quick-add-modal__content');

    if (!dialog || !content) return;

    // Handle touch events on the swipe handle
    const handleTouchStart = (/** @type {TouchEvent} */ e) => {
      const touch = e.touches[0];
      if (!touch) return;
      this.#swipeStartY = touch.clientY;
      this.#swipeCurrentY = this.#swipeStartY;
      this.#isDragging = true;
      dialog.style.transition = 'none';
    };

    const handleTouchMove = (/** @type {TouchEvent} */ e) => {
      if (!this.#isDragging) return;

      const touch = e.touches[0];
      if (!touch) return;
      this.#swipeCurrentY = touch.clientY;
      const deltaY = this.#swipeCurrentY - this.#swipeStartY;

      // Only allow dragging down
      if (deltaY > 0) {
        e.preventDefault();
        dialog.style.transform = `translateY(${deltaY}px)`;

        // Add visual feedback - reduce opacity as user drags
        const opacity = Math.max(0.5, 1 - deltaY / 400);
        dialog.style.setProperty('--drag-opacity', String(opacity));
      }
    };

    const handleTouchEnd = () => {
      if (!this.#isDragging) return;

      this.#isDragging = false;
      const deltaY = this.#swipeCurrentY - this.#swipeStartY;

      dialog.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';

      // If dragged more than 100px or with velocity, close the dialog
      if (deltaY > 100) {
        dialog.style.transform = 'translateY(100%)';
        setTimeout(() => {
          this.closeDialog();
          dialog.style.transform = '';
          dialog.style.transition = '';
        }, 300);
      } else {
        // Snap back
        dialog.style.transform = '';
        setTimeout(() => {
          dialog.style.transition = '';
        }, 300);
      }
    };

    // Attach to swipe handle if it exists, otherwise to content
    const swipeTarget = swipeHandle || content;

    swipeTarget.addEventListener('touchstart', handleTouchStart, { passive: true, signal: this.#abortController.signal });
    swipeTarget.addEventListener('touchmove', handleTouchMove, { passive: false, signal: this.#abortController.signal });
    swipeTarget.addEventListener('touchend', handleTouchEnd, { passive: true, signal: this.#abortController.signal });

    // Also allow tapping on backdrop to close
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        this.closeDialog();
      }
    }, { signal: this.#abortController.signal });
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
