import { isClickedOutside } from '@theme/utilities';

export class HelpFloatingComponent extends HTMLElement {
  #details = null;

  #handleClick = (event) => {
    if (!this.#details?.open) return;

    if (isClickedOutside(event, this)) {
      this.#details.removeAttribute('open');
    }
  };

  #handleKeyDown = (event) => {
    if (event.key === 'Escape' && this.#details?.open) {
      event.preventDefault();
      this.#details.removeAttribute('open');
    }
  };

  connectedCallback() {
    this.#details = this.querySelector('details.help-floating');

    if (!this.#details) return;

    document.addEventListener('click', this.#handleClick);
    document.addEventListener('keydown', this.#handleKeyDown);
  }

  disconnectedCallback() {
    document.removeEventListener('click', this.#handleClick);
    document.removeEventListener('keydown', this.#handleKeyDown);
  }
}

if (!customElements.get('help-floating-component')) {
  customElements.define('help-floating-component', HelpFloatingComponent);
}