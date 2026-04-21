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

    get #submitBtn() {
      return /** @type {HTMLButtonElement | null} */ (
        this.querySelector('.registration-modal__submit')
      );
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

    get #syncEndpoint() {
      return this.dataset.syncEndpoint?.trim() || '';
    }

    showDialog() {
      this.#triggerElement = document.activeElement;
      this.#resetState();
      this.#form?.addEventListener('submit', this.#onSubmit);
      this.#addBlurListeners();
      this.#addInputListeners();
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
      this.#removeInputListeners();
    };

    #addInputListeners() {
      for (const field of this.querySelectorAll('[required]')) {
        field.addEventListener('input', this.#checkFormValidity);
        field.addEventListener('change', this.#checkFormValidity);
      }
    }

    #removeInputListeners() {
      for (const field of this.querySelectorAll('[required]')) {
        field.removeEventListener('input', this.#checkFormValidity);
        field.removeEventListener('change', this.#checkFormValidity);
      }
    }

    #checkFormValidity = () => {
      const form = this.#form;
      const btn = this.#submitBtn;
      if (!form || !btn) return;
      btn.disabled = !form.checkValidity();
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

      const form = this.#form;
      if (!form) return;

      const btn = /** @type {HTMLButtonElement | null} */ (
        this.querySelector('.registration-modal__submit')
      );
      if (btn) btn.setAttribute('aria-busy', 'true');

      try {
        const response = await fetch(form.action, {
          method: 'POST',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
          body: new FormData(form),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          const errorMsg = errorData?.errors?.email?.[0]
            || errorData?.errors?.base?.[0]
            || 'Ocurrió un error. Intenta de nuevo.';
          const emailField = form.querySelector('input[type="email"]');
          const emailWrapper = emailField?.closest('.registration-modal__field');
          if (emailField && emailWrapper) {
            emailField.setAttribute('aria-invalid', 'true');
            let msg = emailWrapper.querySelector('.registration-modal__error');
            if (!msg) {
              msg = document.createElement('span');
              msg.className = 'registration-modal__error';
              msg.setAttribute('role', 'alert');
              emailWrapper.appendChild(msg);
            }
            msg.textContent = errorMsg;
          }
          return;
        }

        const payload = this.#buildSyncPayload(form);

        this.#showSuccess();
        this.#dispatchRegistrationSuccess(payload);
        this.#sendSyncPayload(payload);
      } finally {
        if (btn) btn.removeAttribute('aria-busy');
      }
    };

    /** @param {HTMLFormElement} form */
    #buildSyncPayload(form) {
      const formData = new FormData(form);

      return {
        customer: {
          first_name: this.#getFieldValue(form, 'customer[first_name]'),
          email: this.#getFieldValue(form, 'customer[email]'),
          phone: this.#getFieldValue(form, 'customer[phone]'),
          accepts_marketing: formData.has('customer[accepts_marketing]'),
        },
        extra_fields: this.#getExtraFields(form),
        meta: {
          source: 'registration-modal',
          submitted_at: new Date().toISOString(),
          shopify_form: 'create_customer',
        },
      };
    }

    /**
     * @param {HTMLFormElement} form
     * @param {string} name
     * @returns {string}
     */
    #getFieldValue(form, name) {
      const field = form.elements.namedItem(name);

      if (
        !(field instanceof HTMLInputElement)
        && !(field instanceof HTMLSelectElement)
        && !(field instanceof HTMLTextAreaElement)
      ) {
        return '';
      }

      return field.value.trim();
    }

    /** @param {HTMLFormElement} form */
    #getExtraFields(form) {
      const extraFields = {};

      for (const field of form.querySelectorAll('[data-sync-field]')) {
        const key = field.getAttribute('data-sync-field')?.trim();
        if (!key) continue;

        if (field instanceof HTMLInputElement && field.type === 'checkbox') {
          extraFields[key] = field.checked;
          continue;
        }

        if (field instanceof HTMLInputElement && field.type === 'radio') {
          if (!field.checked) continue;
          extraFields[key] = field.value.trim();
          continue;
        }

        if (
          field instanceof HTMLInputElement
          || field instanceof HTMLSelectElement
          || field instanceof HTMLTextAreaElement
        ) {
          extraFields[key] = field.value.trim();
        }
      }

      return extraFields;
    }

    /** @param {{ customer: object, extra_fields: object, meta: object }} payload */
    #dispatchRegistrationSuccess(payload) {
      this.dispatchEvent(new CustomEvent('registration-modal:registration-success', {
        detail: payload,
        bubbles: true,
        composed: true,
      }));
    }

    /** @param {{ customer: object, extra_fields: object, meta: object }} payload */
    #sendSyncPayload(payload) {
      const endpoint = this.#syncEndpoint;
      if (!endpoint) return;

      fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch((error) => {
        console.warn('Registration modal sync failed', error);
      });
    }

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
