/**
 * PLP Quick Add - Selector de variantes y add to cart
 * Para Shopify Horizon Theme
 *
 * Incluye sincronización de variantes PLP → PDP via URL params
 *
 * @version 2.0.0 - Optimizado
 */

(function() {
  'use strict';

  // =====================
  // CONSTANTES
  // =====================
  const CONFIG = {
    FEEDBACK_DURATION: 2000,
    MESSAGE_DURATION: 1500,
    SELECTORS: {
      controller: '.plp-variant-controller',
      colorBtn: '.plp-color',
      sizeBtn: '.plp-size',
      addToCartBtn: '.plp-add-to-cart',
      sizesContainer: '.plp-sizes',
      colorsContainer: '.plp-colors',
      productCard: 'product-card',
      productCardLink: 'product-card-link',
      priceContainer: '[ref="priceContainer"]',
      price: '.price',
      compareAtPrice: '.compare-at-price',
      cardGallery: '.card-gallery',
      slideshow: 'slideshow-component',
      slide: 'slideshow-slide',
      cartBadge: '.tae-cart-count-badge'
    },
    CLASSES: {
      active: 'active',
      out: 'out',
      ready: 'ready',
      success: 'success',
      error: 'error',
      soldOut: 'sold-out'
    },
    MESSAGES: {
      selectVariant: 'Selecciona talla y color',
      addToBag: 'Agregar a la bolsa →',
      added: '¡Agregado! ✓',
      soldOut: 'Agotado',
      error: 'Error'
    }
  };

  // Estado de selección por producto
  const selectedState = {};

  // Cache de elementos DOM por producto
  const domCache = new Map();

  // Cache de imágenes precargadas (evita precargar dos veces)
  const preloadedImages = new Set();

  // AbortController para peticiones fetch
  let currentFetchController = null;

  // =====================
  // UTILIDADES
  // =====================

  /**
   * Obtiene o crea el cache de elementos DOM para un producto
   * @param {string} productId
   * @returns {Object} Cache de elementos
   */
  function getProductCache(productId) {
    if (!domCache.has(productId)) {
      const card = document.querySelector(`${CONFIG.SELECTORS.productCard}[data-product-id="${productId}"]`);
      if (!card) return null;

      domCache.set(productId, {
        card,
        cardLink: card.closest(CONFIG.SELECTORS.productCardLink),
        priceContainer: card.querySelector(CONFIG.SELECTORS.priceContainer),
        cardGallery: card.querySelector(CONFIG.SELECTORS.cardGallery),
        links: null // Se calculará lazy
      });
    }
    return domCache.get(productId);
  }

  /**
   * Invalida el cache de un producto (útil si el DOM cambia)
   * @param {string} productId
   */
  function invalidateCache(productId) {
    domCache.delete(productId);
  }

  /**
   * Genera URL de imagen con tamaño específico usando la API de Shopify
   * @param {string} src - URL original de la imagen
   * @param {number} width - Ancho deseado
   * @returns {string} URL con tamaño
   */
  function getImageUrl(src, width) {
    if (!src) return '';

    // Si ya tiene parámetros de Shopify CDN, reemplazar el tamaño
    if (src.includes('cdn.shopify.com')) {
      // Patrón: _WIDTHx. o _WIDTHxHEIGHT.
      const sizePattern = /_\d+x\d*\./;
      if (sizePattern.test(src)) {
        return src.replace(sizePattern, `_${width}x.`);
      }
      // Insertar tamaño antes de la extensión
      return src.replace(/\.(\w+)(\?.*)?$/, `_${width}x.$1$2`);
    }

    // Para otras URLs, agregar parámetro width
    const url = new URL(src, window.location.origin);
    url.searchParams.set('width', width);
    return url.toString();
  }

  /**
   * Genera srcset para imágenes responsivas
   * @param {string} src - URL base de la imagen
   * @returns {string} srcset
   */
  function generateSrcset(src) {
    if (!src) return '';
    return [400, 800, 1200].map(w => `${getImageUrl(src, w)} ${w}w`).join(', ');
  }

  /**
   * Precarga una imagen si no ha sido precargada antes
   * @param {string} src - URL de la imagen
   * @param {number} width - Ancho a precargar (default 800)
   * @returns {Promise<void>}
   */
  function preloadImage(src, width = 800) {
    if (!src) return Promise.resolve();

    const url = getImageUrl(src, width);
    if (preloadedImages.has(url)) return Promise.resolve();

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        preloadedImages.add(url);
        resolve();
      };
      img.onerror = resolve; // No fallar si la imagen no carga
      img.src = url;
    });
  }

  /**
   * Precarga todas las imágenes de un color específico
   * @param {string} productId
   * @param {string} color
   */
  function preloadColorImages(productId, color) {
    const product = window.PLP?.[productId];
    if (!product) return;

    // Encontrar variantes de este color
    const variants = product.variants.filter(v => v.options.includes(color));
    if (!variants.length) return;

    // Precargar usando requestIdleCallback si está disponible
    const preload = () => {
      // Precargar galería de la primera variante del color
      const variant = variants[0];
      if (variant.gallery?.length) {
        // Precargar las primeras 2 imágenes de la galería
        variant.gallery.slice(0, 2).forEach(src => preloadImage(src));
      } else if (variant.featured_media?.src) {
        preloadImage(variant.featured_media.src);
      }
    };

    // Usar requestIdleCallback para no bloquear el hilo principal
    if ('requestIdleCallback' in window) {
      requestIdleCallback(preload, { timeout: 100 });
    } else {
      setTimeout(preload, 0);
    }
  }

  /**
   * Precarga las primeras imágenes de todos los colores de un producto
   * @param {string} productId
   */
  function preloadAllColorImages(productId) {
    const product = window.PLP?.[productId];
    if (!product) return;

    // Obtener colores únicos
    const colors = new Set();
    product.variants.forEach(v => {
      if (v.options[0]) colors.add(v.options[0]);
    });

    // Precargar primera imagen de cada color con delay escalonado
    let delay = 0;
    colors.forEach(color => {
      setTimeout(() => preloadColorImages(productId, color), delay);
      delay += 50; // Escalonar para no saturar
    });
  }

  /**
   * Escapa HTML para prevenir XSS
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    if (typeof str !== 'string') return String(str);
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Resetea el estado visual de un botón después de una acción
   * @param {HTMLElement} btn - Botón a resetear
   * @param {string} originalContent - Contenido original
   * @param {string[]} classesToRemove - Clases a remover
   * @param {number} delay - Delay en ms
   */
  function resetButtonState(btn, originalContent, classesToRemove = [], delay = CONFIG.FEEDBACK_DURATION) {
    setTimeout(() => {
      btn.innerHTML = originalContent;
      classesToRemove.forEach(cls => btn.classList.remove(cls));
      btn.disabled = false;
    }, delay);
  }

  // =====================
  // ESTADO
  // =====================

  /**
   * Inicializa o retorna el estado de un producto
   * @param {string} productId
   * @returns {Object} Estado del producto
   */
  function initProductState(productId) {
    if (!selectedState[productId]) {
      selectedState[productId] = {
        color: null,
        size: null,
        variantId: null
      };
    }
    return selectedState[productId];
  }

  // =====================
  // ACTUALIZACIÓN DE ENLACES
  // =====================

  /**
   * Actualiza todos los enlaces del producto para incluir el variant ID
   * @param {string} productId
   * @param {string|number} variantId
   */
  function updateProductLinks(productId, variantId) {
    if (!productId || !variantId) return;

    const cache = getProductCache(productId);
    if (!cache) return;

    // Calcular links si no están en cache
    if (!cache.links) {
      const cardLinks = cache.card.querySelectorAll('a[href*="/products/"]');
      const parentLinks = cache.cardLink
        ? cache.cardLink.querySelectorAll('a[href*="/products/"]')
        : [];
      cache.links = [...new Set([...cardLinks, ...parentLinks])];
    }

    cache.links.forEach(link => {
      try {
        const url = new URL(link.href, window.location.origin);
        if (url.pathname.includes('/products/')) {
          url.searchParams.set('variant', variantId);
          link.href = url.toString();
        }
      } catch (e) {
        // Silently fail for invalid URLs
      }
    });
  }

  // =====================
  // RENDERIZADO
  // =====================

  /**
   * Renderiza los botones de talla para un color
   * @param {string} productId
   * @param {Array} variants - Variantes filtradas por color
   * @param {HTMLElement} controller
   */
  function renderSizes(productId, variants, controller) {
    const container = controller.querySelector(CONFIG.SELECTORS.sizesContainer);
    if (!container) return;

    const firstAvailable = variants.find(v => v.available);
    const state = initProductState(productId);

    // Usar DocumentFragment para mejor performance
    const fragment = document.createDocumentFragment();

    variants.forEach(v => {
      const isFirstAvailable = firstAvailable && v.id === firstAvailable.id;
      const btn = document.createElement('button');

      btn.className = `plp-size${v.available ? '' : ' ' + CONFIG.CLASSES.out}${isFirstAvailable ? ' ' + CONFIG.CLASSES.active : ''}`;
      btn.disabled = !v.available;
      btn.dataset.variantId = v.id;
      btn.textContent = v.options[1];

      fragment.appendChild(btn);
    });

    container.innerHTML = '';
    container.appendChild(fragment);

    // Actualizar estado
    if (firstAvailable) {
      state.size = firstAvailable.options[1];
      state.variantId = firstAvailable.id;
    } else {
      state.size = null;
      state.variantId = null;
    }
  }

  // =====================
  // ACTUALIZACIÓN DE UI
  // =====================

  /**
   * Actualiza el estado del botón de agregar al carrito
   * @param {string} productId
   * @param {HTMLElement} controller
   * @param {boolean} colorAvailable
   */
  function updateAddButton(productId, controller, colorAvailable = true) {
    const btn = controller.querySelector(CONFIG.SELECTORS.addToCartBtn);
    if (!btn) return;

    const state = selectedState[productId];
    const hasColors = controller.querySelector(CONFIG.SELECTORS.colorsContainer)?.children.length > 0;

    const isComplete = hasColors
      ? (state?.color && state?.size && state?.variantId)
      : (state?.size && state?.variantId);

    if (!colorAvailable) {
      btn.disabled = true;
      btn.classList.remove(CONFIG.CLASSES.ready);
      btn.classList.add(CONFIG.CLASSES.soldOut);
      btn.textContent = CONFIG.MESSAGES.soldOut;
      return;
    }

    btn.classList.remove(CONFIG.CLASSES.soldOut);
    btn.textContent = CONFIG.MESSAGES.addToBag;

    if (isComplete) {
      btn.disabled = false;
      btn.classList.add(CONFIG.CLASSES.ready);
    } else {
      btn.disabled = true;
      btn.classList.remove(CONFIG.CLASSES.ready);
    }
  }

  /**
   * Actualiza el precio mostrado en la card
   * @param {string} productId
   * @param {Object} variant
   */
  function updatePrice(productId, variant) {
    if (!variant) return;

    const cache = getProductCache(productId);
    if (!cache?.priceContainer) return;

    const priceEl = cache.priceContainer.querySelector(CONFIG.SELECTORS.price);
    const compareAtPriceEl = cache.priceContainer.querySelector(CONFIG.SELECTORS.compareAtPrice);

    if (priceEl) {
      priceEl.textContent = variant.priceFormatted;
    }

    if (compareAtPriceEl?.parentElement) {
      const hasCompare = variant.compareAtPrice && variant.compareAtPrice > variant.price;
      compareAtPriceEl.textContent = hasCompare ? variant.compareAtPriceFormatted : '';
      compareAtPriceEl.parentElement.style.display = hasCompare ? '' : 'none';
    }
  }

  /**
   * Cambia la imagen de la card según la variante
   * @param {string} productId
   * @param {Object} variant
   */
  function changeImage(productId, variant) {
    const cache = getProductCache(productId);
    if (!cache?.cardGallery) return;

    const slideshow = cache.cardGallery.querySelector(CONFIG.SELECTORS.slideshow);
    if (!slideshow) return;

    const slides = slideshow.querySelectorAll(CONFIG.SELECTORS.slide);
    if (slides.length < 1) return;

    const [firstSlide, secondSlide] = slides;
    const baseImg = firstSlide?.querySelector('img');
    const hoverImg = secondSlide?.querySelector('img');

    if (!baseImg) return;

    // Reset slides visibility
    if (firstSlide) {
      firstSlide.setAttribute('aria-hidden', 'false');
      firstSlide.removeAttribute('hidden');
    }
    if (secondSlide) {
      secondSlide.setAttribute('aria-hidden', 'true');
      secondSlide.removeAttribute('hidden');
    }

    // Usar galería del metafield si existe
    if (variant.gallery?.length) {
      const baseSrc = variant.gallery[0];
      baseImg.src = getImageUrl(baseSrc, 800);
      baseImg.srcset = generateSrcset(baseSrc);

      if (variant.gallery[1] && hoverImg) {
        const hoverSrc = variant.gallery[1];
        // Preload
        new Image().src = getImageUrl(hoverSrc, 800);

        hoverImg.src = getImageUrl(hoverSrc, 800);
        hoverImg.srcset = generateSrcset(hoverSrc);
      }
      return;
    }

    // Fallback: usar featured_media
    if (variant.featured_media?.src) {
      const src = variant.featured_media.src;
      baseImg.src = getImageUrl(src, 800);
      baseImg.srcset = generateSrcset(src);
    }
  }

  /**
   * Muestra un mensaje temporal en un botón
   * @param {HTMLElement} btn
   * @param {string} message
   */
  function showMessage(btn, message) {
    const original = btn.innerHTML;
    btn.innerHTML = escapeHtml(message);
    setTimeout(() => {
      btn.innerHTML = original;
    }, CONFIG.MESSAGE_DURATION);
  }

  // =====================
  // GALERÍA / SLIDESHOW POR COLOR
  // =====================

  /**
   * Obtiene la galería de imágenes para un color específico.
   * Busca en todas las variantes del color y retorna la primera galería válida.
   * Regla de negocio: solo UNA variante por color tiene la galería configurada.
   *
   * @param {string} productId
   * @param {string} color
   * @returns {string[]|null} Array de URLs de imágenes o null si no hay galería
   */
  function getColorGallery(productId, color) {
    const product = window.PLP?.[productId];
    if (!product) return null;

    // Buscar variantes de este color
    const colorVariants = product.variants.filter(v => v.options.includes(color));

    // Encontrar la primera variante que tenga galería configurada
    for (const variant of colorVariants) {
      if (variant.gallery && variant.gallery.length > 0) {
        return variant.gallery;
      }
    }

    return null;
  }

  /**
   * Reconstruye el slideshow del product card con las imágenes de la galería del color.
   * Si no hay galería, mantiene el comportamiento actual (no modifica el slideshow).
   *
   * @param {string} productId
   * @param {string} color
   */
  function rebuildSlideshowForColor(productId, color) {
    const gallery = getColorGallery(productId, color);

    // Si no hay galería específica, no modificamos el slideshow
    if (!gallery || gallery.length === 0) return;

    const cache = getProductCache(productId);
    if (!cache?.cardGallery) return;

    const slideshow = cache.cardGallery.querySelector(CONFIG.SELECTORS.slideshow);
    if (!slideshow) return;

    const scroller = slideshow.querySelector('[ref="scroller"]');
    if (!scroller) return;

    // Crear fragment con los nuevos slides
    const fragment = document.createDocumentFragment();

    gallery.forEach((src, index) => {
      const slide = document.createElement('slideshow-slide');
      slide.setAttribute('ref', 'slides[]');
      slide.setAttribute('aria-hidden', index === 0 ? 'false' : 'true');
      slide.setAttribute('slide-id', `variant-gallery-${productId}-${index}`);
      slide.className = 'product-media-container media-fit product-media-container--image';
      slide.style.cssText = `view-timeline-name: --slide-${index}; --product-media-fit: cover;`;

      // Ocultar slides extras para performance (solo mostrar primeros 5)
      if (index >= 5) {
        slide.setAttribute('hidden', '');
      }

      const img = document.createElement('img');
      img.src = getImageUrl(src, 800);
      img.srcset = generateSrcset(src);
      img.sizes = '(min-width: 750px) 50vw, 100vw';
      img.loading = index === 0 ? 'eager' : 'lazy';
      img.alt = `${color} - Image ${index + 1}`;
      img.className = 'product-media';

      slide.appendChild(img);
      fragment.appendChild(slide);
    });

    // Reemplazar contenido del scroller
    scroller.innerHTML = '';
    scroller.appendChild(fragment);

    // Actualizar el contador de slides si existe
    slideshow.setAttribute('slide-count', String(gallery.length));

    // Resetear al primer slide
    slideshow.setAttribute('initial-slide', '0');

    // Forzar re-inicialización del slideshow
    // El componente Slideshow observa el atributo 'initial-slide'
    // y se re-sincroniza automáticamente
    if (typeof slideshow.select === 'function') {
      // Si el slideshow ya está inicializado, seleccionar el primer slide
      requestAnimationFrame(() => {
        try {
          slideshow.select(0, null, { animate: false });
        } catch (e) {
          // Silently fail if slideshow not ready
        }
      });
    }
  }

  // =====================
  // CARRITO
  // =====================

  /**
   * Agrega un producto al carrito
   * @param {string} variantId
   * @returns {Promise<Object>}
   */
  async function addToCart(variantId) {
    // Cancelar petición anterior si existe
    if (currentFetchController) {
      currentFetchController.abort();
    }
    currentFetchController = new AbortController();

    const response = await fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: variantId, quantity: 1 }),
      signal: currentFetchController.signal
    });

    currentFetchController = null;

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.description || CONFIG.MESSAGES.error);
    }

    return response.json();
  }

  /**
   * Actualiza el contador del carrito
   */
  async function updateCartCount() {
    try {
      const response = await fetch('/cart.js');
      const cart = await response.json();

      const countBadge = document.querySelector(CONFIG.SELECTORS.cartBadge);
      if (countBadge) {
        countBadge.textContent = String(cart.item_count);
      }

      sessionStorage.setItem('cart-count', JSON.stringify({
        value: String(cart.item_count),
        timestamp: Date.now()
      }));
    } catch (err) {
      console.error('Error updating cart count:', err);
    }
  }

  // =====================
  // EVENT HANDLERS
  // =====================

  /**
   * Handler para click en color
   * @param {HTMLElement} btn
   */
  function handleColorClick(btn) {
    const productId = btn.dataset.productId;
    const color = btn.dataset.color;
    const colorAvailable = btn.dataset.available === 'true';
    const product = window.PLP?.[productId];

    if (!product) return;

    const state = initProductState(productId);
    state.color = color;
    state.size = null;
    state.variantId = null;

    // Marcar color activo
    const controller = btn.closest(CONFIG.SELECTORS.controller);
    controller.querySelectorAll(CONFIG.SELECTORS.colorBtn).forEach(c => {
      c.classList.remove(CONFIG.CLASSES.active);
    });
    btn.classList.add(CONFIG.CLASSES.active);

    // Filtrar variantes por color y renderizar tallas
    const variants = product.variants.filter(v => v.options.includes(color));
    renderSizes(productId, variants, controller);

    // Actualizar UI
    changeImage(productId, variants[0]);
    updatePrice(productId, variants[0]);
    updateAddButton(productId, controller, colorAvailable);

    // ★ Reconstruir el slideshow/carrusel con las imágenes del color
    rebuildSlideshowForColor(productId, color);

    // Actualizar enlaces
    const targetVariant = state.variantId || variants.find(v => v.available)?.id;
    if (targetVariant) {
      updateProductLinks(productId, targetVariant);
    }
  }

  /**
   * Handler para click en talla
   * @param {HTMLElement} btn
   */
  function handleSizeClick(btn) {
    const variantId = btn.dataset.variantId;
    const controller = btn.closest(CONFIG.SELECTORS.controller);
    const productId = controller?.dataset.productId;

    if (!productId) return;

    const product = window.PLP?.[productId];
    const variant = product?.variants.find(v => v.id === Number(variantId) || v.id === variantId);

    const state = initProductState(productId);
    state.size = btn.textContent.trim();
    state.variantId = variantId;

    // Marcar talla activa
    const sizesContainer = btn.closest(CONFIG.SELECTORS.sizesContainer);
    sizesContainer.querySelectorAll(CONFIG.SELECTORS.sizeBtn).forEach(s => {
      s.classList.remove(CONFIG.CLASSES.active);
    });
    btn.classList.add(CONFIG.CLASSES.active);

    // Actualizar UI
    if (variant) {
      updatePrice(productId, variant);
    }
    updateAddButton(productId, controller);

    // Actualizar enlaces
    if (variantId) {
      updateProductLinks(productId, variantId);
    }
  }

  /**
   * Handler para click en agregar al carrito
   * @param {HTMLElement} btn
   */
  async function handleAddToCartClick(btn) {
    if (btn.disabled) return;

    const productId = btn.dataset.productId;
    const state = selectedState[productId];

    if (!state?.variantId) {
      showMessage(btn, CONFIG.MESSAGES.selectVariant);
      return;
    }

    btn.disabled = true;
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<span class="plp-spinner"></span>';

    try {
      const response = await addToCart(state.variantId);

      btn.innerHTML = CONFIG.MESSAGES.added;
      btn.classList.add(CONFIG.CLASSES.success);

      // Dispatch cart:update event so the cart drawer opens (same as add-to-cart-component)
      document.dispatchEvent(new CustomEvent('cart:update', {
        bubbles: true,
        detail: {
          resource: response,
          sourceId: 'plp-add-to-cart-' + productId,
          data: {
            source: 'product-form-component',
            itemCount: 1,
            productId: productId,
          },
        },
      }));

      resetButtonState(btn, originalContent, [CONFIG.CLASSES.success]);
    } catch (err) {
      if (err.name === 'AbortError') return; // Ignorar cancelaciones

      console.error('Add to cart error:', err);
      btn.innerHTML = err.message || CONFIG.MESSAGES.error;
      btn.classList.add(CONFIG.CLASSES.error);

      resetButtonState(btn, originalContent, [CONFIG.CLASSES.error]);
    }
  }

  // =====================
  // EVENT DELEGATION
  // =====================

  /**
   * Handler principal de clicks usando event delegation
   * @param {Event} e
   */
  function handleDocumentClick(e) {
    const target = e.target;
    if (!(target instanceof Element)) return;

    // Click en color
    const colorBtn = target.closest(CONFIG.SELECTORS.colorBtn);
    if (colorBtn) {
      handleColorClick(colorBtn);
      return;
    }

    // Click en talla (no deshabilitada)
    const sizeBtn = target.closest(`${CONFIG.SELECTORS.sizeBtn}:not(.${CONFIG.CLASSES.out})`);
    if (sizeBtn) {
      handleSizeClick(sizeBtn);
      return;
    }

    // Click en agregar al carrito
    const addBtn = target.closest(CONFIG.SELECTORS.addToCartBtn);
    if (addBtn) {
      handleAddToCartClick(addBtn);
      return;
    }
  }

  /**
   * Handler para efectos de hover en imágenes
   * @param {Event} e
   * @param {boolean} isEnter - true para mouseenter, false para mouseleave
   */
  function handleImageHover(e, isEnter) {
    const target = e.target;
    if (!(target instanceof Element)) return;

    const card = target.closest(CONFIG.SELECTORS.productCard);
    if (!card) return;

    const hoverImage = card._hoverImage;
    const baseImage = card._baseImage;

    if (isEnter && !hoverImage) return;
    if (!isEnter && !baseImage) return;
    if (!isEnter && card.contains(e.relatedTarget)) return;

    const slideshow = card.querySelector(CONFIG.SELECTORS.slideshow);
    if (!slideshow) return;

    const active = slideshow.querySelector(`${CONFIG.SELECTORS.slide}[aria-hidden='false']`);
    if (!active) return;

    const img = active.querySelector('img');
    if (!img) return;

    const src = isEnter ? hoverImage : baseImage;
    img.src = getImageUrl(src, 800);
    img.srcset = generateSrcset(src);
  }

  // =====================
  // PRELOAD HANDLERS
  // =====================

  // Tracking de cards que ya han sido procesadas para preload
  const preloadedCards = new Set();

  /**
   * Handler para precargar imágenes cuando el usuario hace hover sobre un botón de color
   * @param {Event} e
   */
  function handleColorHover(e) {
    const target = e.target;
    if (!(target instanceof Element)) return;

    const colorBtn = target.closest(CONFIG.SELECTORS.colorBtn);
    if (!colorBtn) return;

    const productId = colorBtn.dataset.productId;
    const color = colorBtn.dataset.color;

    if (productId && color) {
      preloadColorImages(productId, color);
    }
  }

  /**
   * Handler para precargar todas las imágenes cuando el usuario hace hover sobre la card
   * @param {Event} e
   */
  function handleCardHover(e) {
    const target = e.target;
    if (!(target instanceof Element)) return;

    const card = target.closest(CONFIG.SELECTORS.productCard);
    if (!card) return;

    const productId = card.dataset.productId;
    if (!productId || preloadedCards.has(productId)) return;

    preloadedCards.add(productId);
    preloadAllColorImages(productId);
  }

  // =====================
  // INICIALIZACIÓN
  // =====================

  function init() {
    // Inicializar estado para productos con variante pre-seleccionada
    document.querySelectorAll(CONFIG.SELECTORS.controller).forEach(controller => {
      const productId = controller.dataset.productId;
      const firstVariantId = controller.dataset.firstVariantId;
      const firstColor = controller.dataset.firstColor;

      if (productId && firstVariantId) {
        const state = initProductState(productId);
        state.variantId = firstVariantId;
        state.color = firstColor || null;

        const activeSize = controller.querySelector(`${CONFIG.SELECTORS.sizeBtn}.${CONFIG.CLASSES.active}`);
        if (activeSize) {
          state.size = activeSize.textContent.trim();
        }

        updateProductLinks(productId, firstVariantId);

        // ★ Reconstruir slideshow con las imágenes del primer color
        if (firstColor) {
          // Diferir para no bloquear el render inicial
          const rebuild = () => rebuildSlideshowForColor(productId, firstColor);
          if ('requestIdleCallback' in window) {
            requestIdleCallback(rebuild, { timeout: 500 });
          } else {
            setTimeout(rebuild, 100);
          }
        }
      }
    });

    // Event listeners consolidados
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('mouseover', e => {
      handleImageHover(e, true);
      handleColorHover(e);  // Preload en hover de color
      handleCardHover(e);   // Preload en hover de card
    });
    document.addEventListener('mouseout', e => handleImageHover(e, false));
  }

  // Iniciar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Exponer API para uso externo si es necesario
  window.PLPVariants = {
    invalidateCache,
    updateProductLinks,
    getState: (productId) => selectedState[productId],
    // API de galería
    getColorGallery,
    rebuildSlideshowForColor
  };

})();
