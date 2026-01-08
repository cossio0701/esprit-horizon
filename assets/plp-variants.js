/**
 * PLP Quick Add - Selector de variantes y add to cart
 * Para Shopify Horizon Theme
 */

(function() {
  'use strict';

  // Estado de selección por producto
  const selectedState = {};

  // Inicializar estado para un producto
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
  // INICIALIZACIÓN AL CARGAR
  // =====================
  document.addEventListener("DOMContentLoaded", () => {
    // Inicializar estado para productos con variante pre-seleccionada
    document.querySelectorAll(".plp-variant-controller").forEach(controller => {
      const productId = controller.dataset.productId;
      const firstVariantId = controller.dataset.firstVariantId;
      const firstColor = controller.dataset.firstColor;

      if (productId && firstVariantId) {
        const state = initProductState(productId);
        state.variantId = firstVariantId;
        state.color = firstColor || null;

        // Obtener la talla seleccionada del botón activo
        const activeSize = controller.querySelector(".plp-size.active");
        if (activeSize) {
          state.size = activeSize.textContent.trim();
        }
      }
    });
  });

  // =====================
  // CLICK EN COLOR
  // =====================
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".plp-color");
    if (!btn) return;

    const productId = btn.dataset.productId;
    const color = btn.dataset.color;
    const colorAvailable = btn.dataset.available === "true";
    const product = window.PLP?.[productId];
    if (!product) return;

    const state = initProductState(productId);
    state.color = color;
    state.size = null;
    state.variantId = null;

    // Marcar color activo
    const container = btn.closest(".plp-variant-controller");
    container.querySelectorAll(".plp-color").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");

    // Filtrar variantes por color y renderizar tallas
    const variants = product.variants.filter((v) => v.options.includes(color));
    renderSizes(productId, variants, container);

    // Cambiar imagen
    changeImage(productId, variants[0]);

    // Actualizar precio si la variante tiene precio diferente
    updatePrice(productId, variants[0]);

    // Actualizar estado del botón según disponibilidad
    updateAddButton(productId, container, colorAvailable);
  });

  // =====================
  // CLICK EN TALLA
  // =====================
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".plp-size:not(.out)");
    if (!btn) return;

    const variantId = btn.dataset.variantId;
    const productId = btn.closest(".plp-variant-controller")?.dataset.productId;
    if (!productId) return;

    const product = window.PLP?.[productId];
    const variant = product?.variants.find(v => v.id == variantId);

    const state = initProductState(productId);
    state.size = btn.textContent.trim();
    state.variantId = variantId;

    // Marcar talla activa
    const container = btn.closest(".plp-sizes");
    container.querySelectorAll(".plp-size").forEach(s => s.classList.remove("active"));
    btn.classList.add("active");

    // Actualizar precio con la variante seleccionada
    if (variant) {
      updatePrice(productId, variant);
    }

    // Actualizar estado del botón
    const controller = btn.closest(".plp-variant-controller");
    updateAddButton(productId, controller);
  });

  // =====================
  // CLICK EN ADD TO CART
  // =====================
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".plp-add-to-cart");
    if (!btn || btn.disabled) return;

    const productId = btn.dataset.productId;
    const state = selectedState[productId];

    if (!state?.variantId) {
      showMessage(btn, "Selecciona talla y color");
      return;
    }

    // Deshabilitar botón mientras se procesa
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="plp-spinner"></span>';

    try {
      const response = await fetch('/cart/add.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: state.variantId,
          quantity: 1
        })
      });

      if (response.ok) {
        btn.innerHTML = '¡Agregado! ✓';
        btn.classList.add('success');

        // Actualizar contador del carrito
        updateCartCount();

        setTimeout(() => {
          btn.innerHTML = originalText;
          btn.classList.remove('success');
          btn.disabled = false;
        }, 2000);
      } else {
        const error = await response.json();
        btn.innerHTML = error.description || 'Error';
        btn.classList.add('error');

        setTimeout(() => {
          btn.innerHTML = originalText;
          btn.classList.remove('error');
          btn.disabled = false;
        }, 2000);
      }
    } catch (err) {
      console.error('Add to cart error:', err);
      btn.innerHTML = 'Error';
      btn.classList.add('error');

      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.classList.remove('error');
        btn.disabled = false;
      }, 2000);
    }
  });

  // =====================
  // RENDER TALLAS
  // =====================
  function renderSizes(productId, variants, controller) {
    const container = controller.querySelector(".plp-sizes");
    if (!container) return;

    // Encontrar la primera variante disponible
    const firstAvailable = variants.find(v => v.available);
    const state = initProductState(productId);

    container.innerHTML = variants
      .map((v) => {
        const isFirstAvailable = firstAvailable && v.id === firstAvailable.id;
        return `
          <button
            class="plp-size ${v.available ? "" : "out"}${isFirstAvailable ? " active" : ""}"
            ${v.available ? "" : "disabled"}
            data-variant-id="${v.id}"
          >
            ${v.options[1]}
          </button>
        `;
      })
      .join("");

    // Actualizar estado con la primera talla disponible
    if (firstAvailable) {
      state.size = firstAvailable.options[1];
      state.variantId = firstAvailable.id;
    } else {
      state.size = null;
      state.variantId = null;
    }
  }

  // =====================
  // ACTUALIZAR BOTÓN ADD
  // =====================
  function updateAddButton(productId, controller, colorAvailable = true) {
    const btn = controller.querySelector(".plp-add-to-cart");
    if (!btn) return;

    const state = selectedState[productId];

    // Verificar si el producto tiene colores
    const hasColors = controller.querySelector(".plp-colors")?.children.length > 0;

    // Para productos con colores: necesita color + size + variantId
    // Para productos solo con tallas: solo necesita size + variantId
    const isComplete = hasColors
      ? (state?.color && state?.size && state?.variantId)
      : (state?.size && state?.variantId);

    // Si el color no tiene stock disponible
    if (!colorAvailable) {
      btn.disabled = true;
      btn.classList.remove("ready");
      btn.classList.add("sold-out");
      btn.textContent = "Agotado";
      return;
    }

    // Restaurar texto original si estaba agotado
    btn.classList.remove("sold-out");
    btn.textContent = "Agregar a la bolsa →";

    if (isComplete) {
      btn.disabled = false;
      btn.classList.add("ready");
    } else {
      btn.disabled = true;
      btn.classList.remove("ready");
    }
  }

  // =====================
  // MOSTRAR MENSAJE
  // =====================
  function showMessage(btn, message) {
    const original = btn.innerHTML;
    btn.innerHTML = message;
    setTimeout(() => {
      btn.innerHTML = original;
    }, 1500);
  }

  // =====================
  // ACTUALIZAR CONTADOR CARRITO
  // =====================
  async function updateCartCount() {
    try {
      const response = await fetch('/cart.js');
      const cart = await response.json();
      const itemCount = cart.item_count;

      // Actualizar el contador del carrito (TAE custom cart icon)
      const countBadge = document.querySelector('.tae-cart-count-badge');
      if (countBadge) {
        countBadge.textContent = String(itemCount);
      }

      // Guardar en sessionStorage (para persistencia entre páginas)
      sessionStorage.setItem('cart-count', JSON.stringify({
        value: String(itemCount),
        timestamp: Date.now()
      }));

    } catch (err) {
      console.error('Error updating cart count:', err);
    }
  }

  // =====================
  // UPDATE PRICE
  // =====================
  function updatePrice(productId, variant) {
    if (!variant) return;

    const card = document.querySelector(`product-card[data-product-id="${productId}"]`);
    if (!card) return;

    // Buscar el contenedor de precio
    const priceContainer = card.querySelector('[ref="priceContainer"]');
    if (!priceContainer) return;

    const priceEl = priceContainer.querySelector('.price');
    const compareAtPriceEl = priceContainer.querySelector('.compare-at-price');

    // Actualizar precio
    if (priceEl) {
      priceEl.textContent = variant.priceFormatted;
    }

    // Actualizar precio de comparación (si existe)
    if (compareAtPriceEl) {
      if (variant.compareAtPrice && variant.compareAtPrice > variant.price) {
        compareAtPriceEl.textContent = variant.compareAtPriceFormatted;
        compareAtPriceEl.parentElement.style.display = '';
      } else {
        compareAtPriceEl.parentElement.style.display = 'none';
      }
    }
  }

  // =====================
  // CHANGE IMAGE
  // =====================
  function changeImage(productId, variant) {
    const card = document.querySelector(`product-card[data-product-id="${productId}"]`);
    if (!card) return;

    const cardGallery = card.querySelector(".card-gallery");
    if (!cardGallery) return;

    const slideshow = cardGallery.querySelector("slideshow-component");
    if (!slideshow) return;

    const slides = slideshow.querySelectorAll("slideshow-slide");
    if (slides.length < 1) return;

    const firstSlide = slides[0];
    const secondSlide = slides[1];

    const baseImg = firstSlide?.querySelector("img");
    const hoverImg = secondSlide?.querySelector("img");

    if (!baseImg) return;

    // Reset slides visibility
    if (firstSlide) {
      firstSlide.setAttribute("aria-hidden", "false");
      firstSlide.removeAttribute("hidden");
    }

    if (secondSlide) {
      secondSlide.setAttribute("aria-hidden", "true");
      secondSlide.removeAttribute("hidden");
    }

    // Usar galería del metafield si existe
    if (variant.gallery && variant.gallery.length) {
      const base = variant.gallery[0];
      baseImg.src = base;
      baseImg.srcset = `${base} 400w, ${base} 800w, ${base} 1200w`;

      if (variant.gallery[1] && hoverImg) {
        const hover = variant.gallery[1];
        // Preload
        const preload = new Image();
        preload.src = hover;

        hoverImg.src = hover;
        hoverImg.srcset = `${hover} 400w, ${hover} 800w, ${hover} 1200w`;
      }
      return;
    }

    // Fallback: usar featured_media
    if (variant.featured_media?.src) {
      baseImg.src = variant.featured_media.src;
    }
  }

  // =====================
  // HOVER EFFECTS (preservar funcionalidad existente)
  // =====================
  document.addEventListener("mouseover", (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;

    const card = target.closest("product-card");
    if (!card || !card._hoverImage) return;

    const slideshow = card.querySelector("slideshow-component");
    if (!slideshow) return;

    const active = slideshow.querySelector("slideshow-slide[aria-hidden='false']");
    if (!active) return;

    const img = active.querySelector("img");
    if (!img) return;

    img.src = card._hoverImage;
    img.srcset = `${card._hoverImage} 400w, ${card._hoverImage} 800w, ${card._hoverImage} 1200w`;
  });

  document.addEventListener("mouseout", (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;

    const card = target.closest("product-card");
    if (!card) return;

    if (card.contains(e.relatedTarget)) return;
    if (!card._baseImage) return;

    const slideshow = card.querySelector("slideshow-component");
    if (!slideshow) return;

    const active = slideshow.querySelector("slideshow-slide[aria-hidden='false']");
    if (!active) return;

    const img = active.querySelector("img");
    if (!img) return;

    img.src = card._baseImage;
    img.srcset = `${card._baseImage} 400w, ${card._baseImage} 800w, ${card._baseImage} 1200w`;
  });

})();
