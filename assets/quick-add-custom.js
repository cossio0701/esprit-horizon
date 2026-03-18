import { ThemeEvents, CartUpdateEvent } from '@theme/events';

/**
 * @typedef {Object} Variant
 * @property {number} id
 * @property {boolean} available
 * @property {string[]} options
 * @property {string} title
 * @property {number} price
 * @property {number|null} compare_at_price
 */

export class QuickAddCustomComponent extends HTMLElement {
  /** @type {Variant[]} */
  #variants = [];

  /** @type {Record<string, string>} */
  #selectedOptions = {};

  /** @type {HTMLFormElement | null} */
  #form = null;

  /** @type {HTMLInputElement | null} */
  #variantInput = null;

  /** @type {HTMLButtonElement | null} */
  #submitBtn = null;

  /** @type {HTMLElement | null} */
  #btnText = null;

  /** @type {HTMLElement | null} */
  #feedback = null;

  /** @type {HTMLElement | null} */
  #feedbackText = null;

  /** @type {AbortController} */
  #abortController = new AbortController();

  connectedCallback() {
    this.#init();
  }

  disconnectedCallback() {
    this.#abortController.abort();
  }

  #init() {
    this.#parseVariants();
    this.#cacheElements();
    this.#initializeSelectedOptions();
    this.#bindEvents();
  }

  #parseVariants() {
    const variantsJson = this.querySelector('[data-variants-json]');
    if (!variantsJson) return;

    try {
      this.#variants = JSON.parse(variantsJson.textContent || '[]');
    } catch {
      console.error('Failed to parse variants JSON');
    }
  }

  #cacheElements() {
    this.#form = this.querySelector('[data-type="add-to-cart-form"]');
    this.#variantInput = this.querySelector('[data-variant-input]');
    this.#submitBtn = this.querySelector('[data-add-to-cart-btn]');
    this.#btnText = this.querySelector('[data-btn-text]');
    this.#feedback = this.querySelector('[data-feedback]');
    this.#feedbackText = this.querySelector('[data-feedback-text]');
  }

  #initializeSelectedOptions() {
    const sizeContainer = this.querySelector('.quick-add-custom__sizes');
    const colorContainer = this.querySelector('.quick-add-custom__colors');

    if (sizeContainer) {
      const firstSize = sizeContainer.querySelector('.quick-add-custom__size-btn.is-selected');
      if (firstSize) {
        const index = firstSize.dataset.optionIndex;
        if (index) this.#selectedOptions[index] = firstSize.dataset.optionValue || '';
      }
    }

    if (colorContainer) {
      const firstColor = colorContainer.querySelector('.quick-add-custom__color-btn.is-selected');
      if (firstColor) {
        const index = firstColor.dataset.optionIndex;
        if (index) this.#selectedOptions[index] = firstColor.dataset.optionValue || '';
      }
    }

    this.#updateVariant();
  }

  #bindEvents() {
    const { signal } = this.#abortController;

    this.addEventListener('click', (e) => e.stopPropagation(), { signal });

    const sizeBtns = this.querySelectorAll('.quick-add-custom__size-btn');
    sizeBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => this.#handleOptionClick(e), { signal });
    });

    const colorBtns = this.querySelectorAll('.quick-add-custom__color-btn');
    colorBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => this.#handleOptionClick(e), { signal });
    });

    if (this.#form) {
      this.#form.addEventListener('submit', (e) => this.#handleSubmit(e), { signal });
    }
  }

  /**
   * @param {Event} event
   */
  #handleOptionClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const btn = /** @type {HTMLButtonElement} */ (event.currentTarget);
    if (btn.disabled) return;

    const optionIndex = btn.dataset.optionIndex;
    const optionValue = btn.dataset.optionValue;

    if (!optionIndex || !optionValue) return;

    const container = btn.parentElement;
    if (container) {
      container.querySelectorAll('button').forEach((b) => b.classList.remove('is-selected'));
    }
    btn.classList.add('is-selected');

    this.#selectedOptions[optionIndex] = optionValue;

    this.#updateVariant();
    this.#updateOptionAvailability();
  }

  #updateVariant() {
    const matchingVariant = this.#variants.find((variant) => {
      return Object.keys(this.#selectedOptions).every((index) => {
        return variant.options[parseInt(index)] === this.#selectedOptions[index];
      });
    });

    if (!this.#variantInput || !this.#submitBtn || !this.#btnText) return;

    if (matchingVariant) {
      this.#variantInput.value = String(matchingVariant.id);

      if (matchingVariant.available) {
        this.#submitBtn.disabled = false;
        this.#btnText.textContent = this.#getTranslation('addToCart', 'Agregar a la bolsa');
        this.classList.remove('needs-selection');
      } else {
        this.#submitBtn.disabled = true;
        this.#btnText.textContent = this.#getTranslation('soldOut', 'Agotado');
      }
    } else {
      this.classList.add('needs-selection');
    }
  }

  #updateOptionAvailability() {
    const colorContainer = this.querySelector('.quick-add-custom__colors');
    const sizeContainer = this.querySelector('.quick-add-custom__sizes');

    const colorIndex = colorContainer?.dataset.optionIndex;
    const sizeIndex = sizeContainer?.dataset.optionIndex;

    if (colorIndex === undefined || sizeIndex === undefined) return;

    const selectedColor = this.#selectedOptions[colorIndex];
    const selectedSize = this.#selectedOptions[sizeIndex];

    const sizeBtns = this.querySelectorAll('.quick-add-custom__size-btn');
    sizeBtns.forEach((btn) => {
      const sizeValue = btn.dataset.optionValue;
      if (!sizeValue) return;

      const isAvailable = this.#variants.some((variant) => {
        return (
          variant.options[parseInt(sizeIndex)] === sizeValue &&
          variant.options[parseInt(colorIndex)] === selectedColor &&
          variant.available
        );
      });

      btn.classList.toggle('is-unavailable', !isAvailable);
      btn.disabled = !isAvailable;
    });

    const colorBtns = this.querySelectorAll('.quick-add-custom__color-btn');
    colorBtns.forEach((btn) => {
      const colorValue = btn.dataset.optionValue;
      if (!colorValue) return;

      const isAvailable = this.#variants.some((variant) => {
        return (
          variant.options[parseInt(colorIndex)] === colorValue &&
          variant.options[parseInt(sizeIndex)] === selectedSize &&
          variant.available
        );
      });

      btn.classList.toggle('is-unavailable', !isAvailable);
      btn.disabled = !isAvailable;
    });
  }

  /**
   * @param {Event} event
   */
  async #handleSubmit(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!this.#variantInput?.value || this.#submitBtn?.disabled) {
      this.#showFeedback(this.#getTranslation('selectOptions', 'Selecciona talla y color'));
      return;
    }

    this.classList.add('is-loading');
    const originalText = this.#btnText?.textContent || '';
    if (this.#btnText) {
      this.#btnText.textContent = this.#getTranslation('adding', 'Agregando...');
    }

    try {
      const formData = new FormData(/** @type {HTMLFormElement} */ (this.#form));

      const response = await fetch(`${window.Shopify?.routes?.root || '/'}cart/add.js`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        this.classList.remove('is-loading');
        this.classList.add('is-added');
        if (this.#btnText) {
          this.#btnText.textContent = this.#getTranslation('added', 'Agregado');
        }

        const cartResponse = await fetch(`${window.Shopify?.routes?.root || '/'}cart.js`);
        const cart = await cartResponse.json();

        document.dispatchEvent(
          new CartUpdateEvent(cart, 'quick-add-custom', {
            source: 'quick-add-custom',
            itemCount: cart.item_count,
            variantId: String(this.#variantInput.value),
            productId: this.dataset.productId,
          })
        );

        setTimeout(() => {
          this.classList.remove('is-added');
          if (this.#btnText) {
            this.#btnText.textContent = originalText;
          }
        }, 2000);
      } else {
        this.classList.remove('is-loading');
        if (this.#btnText) {
          this.#btnText.textContent = originalText;
        }
        this.#showFeedback(result.message || this.#getTranslation('error', 'Error al agregar'));
      }
    } catch {
      this.classList.remove('is-loading');
      if (this.#btnText) {
        this.#btnText.textContent = originalText;
      }
      this.#showFeedback(this.#getTranslation('connectionError', 'Error de conexión'));
    }
  }

  /**
   * @param {string} key
   * @param {string} fallback
   * @returns {string}
   */
  #getTranslation(key, fallback) {
    return this.dataset[`i18n${key.charAt(0).toUpperCase() + key.slice(1)}`] || fallback;
  }

  /**
   * @param {string} message
   */
  #showFeedback(message) {
    if (this.#feedback && this.#feedbackText) {
      this.#feedbackText.textContent = message;
      this.#feedback.hidden = false;

      setTimeout(() => {
        this.#feedback.hidden = true;
      }, 3000);
    }
  }
}

if (!customElements.get('quick-add-custom-component')) {
  customElements.define('quick-add-custom-component', QuickAddCustomComponent);
}
