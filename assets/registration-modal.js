customElements.whenDefined('dialog-component').then(() => {
  const DialogComponent = customElements.get('dialog-component');

  class RegistrationModal extends DialogComponent {
    /** @type {Element | null} */
    #triggerElement = null;

    connectedCallback() {
      super.connectedCallback();
      this.addEventListener('dialog:close', this.#onClose);
    }

    disconnectedCallback() {
      super.disconnectedCallback();
      this.removeEventListener('dialog:close', this.#onClose);
      this.#form?.removeEventListener('submit', this.#onSubmit);
      this.#removeBlurListeners();
    }

    get #form() {
      return /** @type {HTMLFormElement | null} */ (
        this.querySelector('.registration-modal__form')
      );
    }

    get #firstField() {
      return /** @type {HTMLElement | null} */ (
        this.querySelector('.registration-modal__field input')
      );
    }

    get #successPanel() {
      return /** @type {HTMLElement | null} */ (
        this.querySelector('.registration-modal__success')
      );
    }

    get #formWrapper() {
      return /** @type {HTMLElement | null} */ (
        this.querySelector('.registration-modal__form-wrapper')
      );
    }

    showDialog() {
      this.#triggerElement = document.activeElement;
      this.#resetState();
      this.#form?.addEventListener('submit', this.#onSubmit);
      this.#addBlurListeners();
      super.showDialog();
      requestAnimationFrame(() =>
        requestAnimationFrame(() => this.#firstField?.focus())
      );
    }

    #onClose = () => {
      if (this.#triggerElement instanceof HTMLElement) {
        this.#triggerElement.focus();
      }
      this.#triggerElement = null;
      this.#form?.removeEventListener('submit', this.#onSubmit);
      this.#removeBlurListeners();
    };

    #addBlurListeners() {
      for (const field of this.querySelectorAll('[required]')) {
        field.addEventListener('blur', this.#onFieldBlur);
      }
    }

    #removeBlurListeners() {
      for (const field of this.querySelectorAll('[required]')) {
        field.removeEventListener('blur', this.#onFieldBlur);
      }
    }

    /** @param {Event} event */
    #onFieldBlur = (event) => {
      const field = /** @type {HTMLInputElement} */ (event.currentTarget);
      const wrapper = field.closest(
        '.registration-modal__field, .registration-modal__legal'
      );
      this.#clearError(field, wrapper);
      if (!field.checkValidity()) {
        this.#showError(field, wrapper);
      }
    };

    /** @param {SubmitEvent} event */
    #onSubmit = async (event) => {
      event.preventDefault();
      if (!this.#validateForm()) return;

      const btn = /** @type {HTMLButtonElement | null} */ (
        this.querySelector('.registration-modal__submit')
      );
      if (btn) btn.setAttribute('aria-busy', 'true');

      try {
        // const result = await submitFormData(new FormData(event.currentTarget));
        // if (!result.ok) return;

        this.#showSuccess();
      } finally {
        if (btn) btn.removeAttribute('aria-busy');
      }
    };

    /** @returns {boolean} */
    #validateForm() {
      const form = this.#form;
      if (!form) return true;

      /** @type {HTMLElement | null} */
      let firstInvalid = null;

      for (const field of form.querySelectorAll('[required]')) {
        const wrapper = field.closest(
          '.registration-modal__field, .registration-modal__legal'
        );
        this.#clearError(field, wrapper);

        if (!/** @type {HTMLInputElement} */ (field).checkValidity()) {
          this.#showError(field, wrapper);
          if (firstInvalid === null) firstInvalid = /** @type {HTMLElement} */ (field);
        }
      }

      if (firstInvalid !== null) firstInvalid.focus();
      return firstInvalid === null;
    }

    /**
     * @param {Element} field
     * @param {Element | null} wrapper
     */
    #showError(field, wrapper) {
      const errorId = field.id + '-error';
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', errorId);

      let msg = wrapper ? wrapper.querySelector('#' + errorId) : null;
      if (!msg) {
        msg = document.createElement('span');
        msg.id = errorId;
        msg.setAttribute('role', 'alert');
        msg.className = 'registration-modal__error';
        if (wrapper) wrapper.appendChild(msg);
      }

      msg.textContent = /** @type {HTMLInputElement} */ (field).validationMessage;
    }

    /**
     * @param {Element} field
     * @param {Element | null} wrapper
     */
    #clearError(field, wrapper) {
      field.removeAttribute('aria-invalid');
      field.removeAttribute('aria-describedby');
      if (wrapper) {
        const msg = wrapper.querySelector('.registration-modal__error');
        if (msg) msg.remove();
      }
    }

    #showSuccess() {
      const success = this.#successPanel;
      const formWrapper = this.#formWrapper;
      if (!success || !formWrapper) return;

      formWrapper.classList.add('is-hiding');
      formWrapper.addEventListener('transitionend', () => {
        formWrapper.hidden = true;
        formWrapper.classList.remove('is-hiding');
        success.hidden = false;
        /** @type {any} */ (this).classList.add('is-success');
        const focusTarget = success.querySelector('img, [tabindex]') || success;
        if (focusTarget instanceof HTMLElement) focusTarget.focus();
      }, { once: true });
    }

    #resetState() {
      const success = this.#successPanel;
      const formWrapper = this.#formWrapper;
      if (!success || !formWrapper) return;

      success.hidden = true;
      formWrapper.hidden = false;
      formWrapper.classList.remove('is-hiding');

      /** @type {any} */ (this).classList.remove('is-success');

      const form = this.#form;
      if (!form) return;
      form.reset();

      for (const field of form.querySelectorAll('[required]')) {
        const wrapper = field.closest(
          '.registration-modal__field, .registration-modal__legal'
        );
        this.#clearError(field, wrapper);
      }
    }
  }

  if (!customElements.get('registration-modal')) {
    customElements.define('registration-modal', RegistrationModal);
  }

  document.addEventListener('click', (event) => {
    if (!/** @type {Element} */ (event.target).closest('[data-open-newsletter-modal]')) return;
    const modal = document.querySelector('registration-modal');
    if (modal instanceof RegistrationModal) modal.showDialog();
  });
});

// async function submitFormData(formData, endpoint) {
//   const response = await fetch(endpoint, {
//     method: 'POST',
//     headers: { 'X-Requested-With': 'XMLHttpRequest' },
//     body: formData,
//   });
//   if (!response.ok) return { ok: false, error: await response.text() };
//   return { ok: true, data: await response.json().catch(() => null) };
// }
