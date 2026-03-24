class QuickAddCustomComponent extends HTMLElement {
  constructor() {
    super();
    this.variants = [];
    this.selectedOptions = {};
    this.form = null;
    this.variantInput = null;
    this.submitBtn = null;
    this.btnText = null;
    this.feedback = null;
    this.feedbackText = null;
    this._siblingCache = new Map();
    this._fetchToken = 0;
  }

  connectedCallback() {
    this.init();
  }

  init() {
    const variantsJson = this.querySelector('[data-variants-json]');
    if (variantsJson) {
      try {
        this.variants = JSON.parse(variantsJson.textContent);
        this._originalVariants = [...this.variants];
      } catch (e) {
        console.error('Failed to parse variants JSON:', e);
      }
    }

    this._originalProductId = this.dataset.productId;

    this.form = this.querySelector('[data-type="add-to-cart-form"]');
    this.variantInput = this.querySelector('[data-variant-input]');
    this.submitBtn = this.querySelector('[data-add-to-cart-btn]');
    this.btnText = this.querySelector('[data-btn-text]');
    this.feedback = this.querySelector('[data-feedback]');
    this.feedbackText = this.querySelector('[data-feedback-text]');

    this._originalSizesHTML = this.querySelector('.quick-add-custom__sizes')?.innerHTML ?? null;

    const cardGallery = this.closest('.card-gallery');
    if (cardGallery) {
      this._mode = 'slideshow';
      this._slideshow = cardGallery.querySelector('slideshow-component') ?? null;
      this._slideshowScroller = this._slideshow?.querySelector('[ref="scroller"]') ?? null;
      this._originalScrollerHTML = this._slideshowScroller?.innerHTML ?? null;
      this._cardImg = null;
      this._cardLink = cardGallery.querySelector('[ref="cardGalleryLink"]') ?? null;
      this._originalHref = this._cardLink?.href ?? null;
    } else {
      this._mode = 'simple';
      this._cardImg = this.closest('.product-card-simple__media')?.querySelector('.product-card-simple__image') ?? null;
      this._originalImageSrc = this._cardImg?.src ?? null;
      this._originalImageSrcset = this._cardImg?.srcset ?? null;
      this._cardLink = this.closest('.product-card-simple__link') ?? null;
      this._originalHref = this._cardLink?.href ?? null;
    }

    this.initializeSelectedOptions();
    this.bindEvents();
  }

  initializeSelectedOptions() {
    const sizeContainer = this.querySelector('.quick-add-custom__sizes');
    if (sizeContainer) {
      const firstSize = sizeContainer.querySelector('.quick-add-custom__size-btn.is-selected');
      if (firstSize) {
        this.selectedOptions[firstSize.dataset.optionIndex] = firstSize.dataset.optionValue;
      }
    }
    this.updateVariant();
  }

  bindEvents() {
    this.addEventListener('click', (e) => e.stopPropagation());

    this.querySelectorAll('.quick-add-custom__size-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => this.handleOptionClick(e));
    });

    const colorsContainer = this.querySelector('[data-siblings-colors]');
    if (colorsContainer) {
      colorsContainer.addEventListener('mouseover', (e) => {
        const btn = e.target.closest('.quick-add-custom__color-btn');
        if (btn && btn.dataset.self !== 'true' && btn.dataset.handle) {
          this.prefetchSiblingHandle(btn.dataset.handle);
        }
      });
      colorsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.quick-add-custom__color-btn');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        this.handleSiblingColorBtn(btn);
      });
      this.loadQuickAddSiblings(colorsContainer);
    }

    if (this.form) {
      this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    }
  }

  handleOptionClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const btn = event.currentTarget;
    if (btn.disabled) return;

    const container = btn.parentElement;
    container.querySelectorAll('button').forEach((b) => b.classList.remove('is-selected'));
    btn.classList.add('is-selected');

    this.selectedOptions[btn.dataset.optionIndex] = btn.dataset.optionValue;
    this.updateVariant();
    this.updateSizeAvailability();
  }

  prefetchSiblingHandle(handle) {
    if (!handle || this._siblingCache.has(handle)) return;
    fetch('/products/' + handle + '.js')
      .then((r) => r.json())
      .then((data) => this._siblingCache.set(handle, data))
      .catch(() => {});
  }

  handleSiblingColorBtn(btn) {
    const handle = btn.dataset.handle;
    const colorsContainer = this.querySelector('[data-siblings-colors]');
    if (colorsContainer) {
      colorsContainer.querySelectorAll('.quick-add-custom__color-btn').forEach((b) => b.classList.remove('is-selected'));
    }
    btn.classList.add('is-selected');

    if (btn.dataset.self === 'true') {
      this.restoreOriginal();
      return;
    }

    if (this._siblingCache.has(handle)) {
      this.rebuildFromProduct(this._siblingCache.get(handle));
      return;
    }

    this.classList.add('is-loading');
    this.submitBtn.disabled = true;

    const token = ++this._fetchToken;

    fetch('/products/' + handle + '.js')
      .then((r) => r.json())
      .then((data) => {
        if (token !== this._fetchToken) return;
        this._siblingCache.set(handle, data);
        this.rebuildFromProduct(data);
        this.classList.remove('is-loading');
      })
      .catch(() => {
        if (token !== this._fetchToken) return;
        this.classList.remove('is-loading');
        this.showFeedback('Error al cargar tallas');
      });
  }

  loadQuickAddSiblings(container) {
    const styleRef = container.dataset.styleRef;
    if (!styleRef) return;
    const currentHandle = container.dataset.currentHandle;

    const CACHE_KEY = 'siblings_v2_' + styleRef;
    let cached = null;
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) cached = JSON.parse(raw);
    } catch (e) {}

    if (cached) {
      this.renderQuickAddSiblings(container, cached, currentHandle);
      return;
    }

    const params = [
      'q=' + encodeURIComponent(styleRef),
      'resources[type]=product',
      'resources[limit]=20',
      'resources[options][fields]=tag',
      'resources[options][unavailable_products]=show',
    ].join('&');

    fetch('/search/suggest.json?' + params)
      .then((r) => r.json())
      .then((json) => {
        const results = (json.resources && json.resources.results && json.resources.results.products) || [];
        const erpPrefix = styleRef + '-';
        const styleRefLower = styleRef.toLowerCase();
        const siblings = results.filter((p) => {
          if (p.tags && p.tags.length) return p.tags.some((t) => t.indexOf(erpPrefix) === 0);
          return p.handle.indexOf(styleRefLower) !== -1;
        });
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(siblings)); } catch (e) {}
        this.renderQuickAddSiblings(container, siblings, currentHandle);
      })
      .catch(() => {});
  }

  renderQuickAddSiblings(container, siblings, currentHandle) {
    if (!siblings || siblings.length === 0) return;
    const otherSiblings = siblings.filter((s) => s.handle !== currentHandle && s.available !== false);
    if (otherSiblings.length === 0) return;

    otherSiblings.forEach((sibling) => {
      const colorName = this._getSiblingColorName(sibling);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quick-add-custom__color-btn';
      btn.dataset.handle = sibling.handle;
      btn.setAttribute('aria-label', colorName);
      btn.setAttribute('title', colorName);

      const imgObj = sibling.featured_image || sibling.image;
      const imgUrl = imgObj && imgObj.url;
      if (imgUrl) {
        btn.style.backgroundImage = 'url(' + imgUrl + ')';
        btn.style.backgroundSize = '300%';
        btn.style.backgroundPosition = 'center 35%';
      }

      const span = document.createElement('span');
      span.className = 'visually-hidden';
      span.textContent = colorName;
      btn.appendChild(span);

      container.appendChild(btn);
    });
  }

  _getSiblingColorName(product) {
    if (product.variants && product.variants.length > 0) {
      const variantTitle = product.variants[0].title;
      if (variantTitle && variantTitle !== 'Default Title') {
        const parts = variantTitle.split(' / ');
        return parts[parts.length - 1];
      }
    }
    return product.title;
  }

  restoreOriginal() {
    this.variants = [...this._originalVariants];
    this.dataset.productId = this._originalProductId;

    const sizeContainer = this.querySelector('.quick-add-custom__sizes');
    if (sizeContainer && this._originalSizesHTML !== null) {
      sizeContainer.innerHTML = this._originalSizesHTML;
      sizeContainer.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', (e) => this.handleOptionClick(e));
      });
    }

    const firstSize = this.querySelector('.quick-add-custom__size-btn.is-selected');
    this.selectedOptions = firstSize
      ? { [firstSize.dataset.optionIndex]: firstSize.dataset.optionValue }
      : {};
    this.updateVariant();

    const colorsContainer = this.querySelector('[data-siblings-colors]');
    if (colorsContainer) {
      colorsContainer.querySelectorAll('.quick-add-custom__color-btn').forEach((b) => b.classList.remove('is-selected'));
      const selfBtn = colorsContainer.querySelector('[data-self="true"]');
      if (selfBtn) selfBtn.classList.add('is-selected');
    }

    if (this._mode === 'slideshow') {
      if (this._slideshowScroller && this._originalScrollerHTML !== null) {
        this._slideshowScroller.innerHTML = this._originalScrollerHTML;
        this._resetSlideshowToFirst();
      }
    } else {
      if (this._cardImg && this._originalImageSrc) {
        this._cardImg.src = this._originalImageSrc;
        this._cardImg.srcset = this._originalImageSrcset ?? '';
      }
    }
    if (this._cardLink && this._originalHref) this._cardLink.href = this._originalHref;
  }

  rebuildFromProduct(productData) {
    const sizeContainer = this.querySelector('.quick-add-custom__sizes');
    if (!sizeContainer) return;

    const sizeIndex = parseInt(sizeContainer.dataset.optionIndex);
    const sizeOption = productData.options[sizeIndex];
    if (!sizeOption) return;

    this.variants = productData.variants.map((v) => ({
      id: v.id,
      available: v.available,
      options: v.options,
      title: v.title,
      price: v.price,
    }));

    this.dataset.productId = productData.id;

    sizeContainer.innerHTML = sizeOption.values
      .map((value, i) => {
        const available = productData.variants.some(
          (v) => v.options[sizeIndex] === value && v.available
        );
        return `<button
          type="button"
          class="quick-add-custom__size-btn${i === 0 ? ' is-selected' : ''}${!available ? ' is-unavailable' : ''}"
          data-option-value="${value}"
          data-option-index="${sizeIndex}"
          ${!available ? 'disabled' : ''}
          aria-label="${value}"
        >${value}</button>`;
      })
      .join('');

    sizeContainer.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', (e) => this.handleOptionClick(e));
    });

    this.selectedOptions = { [sizeIndex]: sizeOption.values[0] };
    this.updateVariant();
    this.updateCardImage(productData);
    if (this._cardLink) this._cardLink.href = '/products/' + productData.handle;
  }

  updateCardImage(productData) {
    if (this._mode === 'slideshow') {
      this._rebuildSlideshow(productData.images ?? []);
    } else {
      if (!this._cardImg) return;
      const rawUrl = productData.featured_image;
      if (!rawUrl) return;
      const base = rawUrl.split('?')[0];
      const url = base.startsWith('//') ? 'https:' + base : base;
      this._cardImg.src = url + '?width=600';
      this._cardImg.srcset = [200, 300, 400, 500, 600].map((w) => `${url}?width=${w} ${w}w`).join(', ');
    }
  }

  _rebuildSlideshow(images) {
    if (!this._slideshowScroller || !images.length) return;

    const fragment = document.createDocumentFragment();
    images.slice(0, 5).forEach((rawUrl, index) => {
      const base = rawUrl.split('?')[0];
      const url = base.startsWith('//') ? 'https:' + base : base;

      const slide = document.createElement('slideshow-slide');
      slide.setAttribute('ref', 'slides[]');
      slide.setAttribute('aria-hidden', index === 0 ? 'false' : 'true');
      slide.setAttribute('slide-id', `sibling-${index}`);
      slide.className = 'product-media-container media-fit product-media-container--image';

      const img = document.createElement('img');
      img.src = url + '?width=800';
      img.srcset = [400, 800, 1200].map((w) => `${url}?width=${w} ${w}w`).join(', ');
      img.sizes = 'auto';
      img.loading = index === 0 ? 'eager' : 'lazy';
      img.className = 'product-media';
      img.alt = '';

      slide.appendChild(img);
      fragment.appendChild(slide);
    });

    this._slideshowScroller.innerHTML = '';
    this._slideshowScroller.appendChild(fragment);
    this._resetSlideshowToFirst();
  }

  _resetSlideshowToFirst() {
    if (!this._slideshow) return;
    requestAnimationFrame(() => {
      try { this._slideshow.select(0, null, { animate: false }); } catch (e) {}
    });
  }

  updateVariant() {
    const matchingVariant = this.variants.find((variant) => {
      return Object.keys(this.selectedOptions).every((index) => {
        return variant.options[parseInt(index)] === this.selectedOptions[index];
      });
    });

    if (matchingVariant) {
      this.variantInput.value = matchingVariant.id;
      if (matchingVariant.available) {
        this.submitBtn.disabled = false;
        this.btnText.textContent = 'Agregar a la bolsa';
        this.classList.remove('needs-selection');
      } else {
        this.submitBtn.disabled = true;
        this.btnText.textContent = 'Agotado';
      }
    } else {
      this.classList.add('needs-selection');
    }
  }

  updateSizeAvailability() {
    const sizeContainer = this.querySelector('.quick-add-custom__sizes');
    if (!sizeContainer) return;

    const sizeIndex = parseInt(sizeContainer.dataset.optionIndex);

    sizeContainer.querySelectorAll('.quick-add-custom__size-btn').forEach((btn) => {
      const sizeValue = btn.dataset.optionValue;
      const isAvailable = this.variants.some(
        (v) => v.options[sizeIndex] === sizeValue && v.available
      );
      btn.classList.toggle('is-unavailable', !isAvailable);
      btn.disabled = !isAvailable;
    });
  }

  async handleSubmit(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!this.variantInput.value || this.submitBtn.disabled) {
      this.showFeedback('Selecciona una talla');
      return;
    }

    this.classList.add('is-loading');
    const originalText = this.btnText.textContent;
    this.btnText.textContent = 'Agregando...';

    try {
      const formData = new FormData(this.form);

      const response = await fetch(window.Shopify?.routes?.root + 'cart/add.js', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        this.classList.remove('is-loading');
        this.classList.add('is-added');
        this.btnText.textContent = 'Agregado';

        const cartResponse = await fetch(window.Shopify?.routes?.root + 'cart.js');
        const cart = await cartResponse.json();

        document.dispatchEvent(
          new CustomEvent('cart:update', {
            bubbles: true,
            detail: {
              resource: cart,
              sourceId: 'quick-add-custom',
              data: {
                source: 'quick-add-custom',
                itemCount: cart.item_count,
                variantId: String(this.variantInput.value),
                productId: this.dataset.productId,
              },
            },
          })
        );

        setTimeout(() => {
          this.classList.remove('is-added');
          this.btnText.textContent = originalText;
        }, 2000);
      } else {
        this.classList.remove('is-loading');
        this.btnText.textContent = originalText;
        this.showFeedback(result.message || 'Error al agregar');
      }
    } catch (error) {
      console.error('Add to cart error:', error);
      this.classList.remove('is-loading');
      this.btnText.textContent = originalText;
      this.showFeedback('Error de conexión');
    }
  }

  showFeedback(message) {
    if (this.feedback && this.feedbackText) {
      this.feedbackText.textContent = message;
      this.feedback.hidden = false;
      setTimeout(() => {
        this.feedback.hidden = true;
      }, 3000);
    }
  }
}

if (!customElements.get('quick-add-custom-component')) {
  customElements.define('quick-add-custom-component', QuickAddCustomComponent);
}
