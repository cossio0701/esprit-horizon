import { morph } from '@theme/morph';
import { ThemeEvents } from '@theme/events';

class CartCrossSell extends HTMLElement {
  #abortController = new AbortController();

  connectedCallback() {
    const { signal } = this.#abortController;

    this.addEventListener('click', this.#handleQuickBuyClick, { signal });
  }

  disconnectedCallback() {
    this.#abortController.abort();
  }

  #handleQuickBuyClick = async (event) => {
    const quickBuyBtn = event.target.closest('.cart-cross-sell-card__quick-buy');
    if (!quickBuyBtn) return;

    event.preventDefault();
    event.stopPropagation();

    const productUrl = quickBuyBtn.dataset.productUrl;
    if (!productUrl) return;

    const dialogComponent = document.getElementById('quick-add-dialog');
    if (!dialogComponent || typeof dialogComponent.showDialog !== 'function') return;

    const productHtml = await this.#fetchQuickAddSection(productUrl);
    if (productHtml) {
      await this.#updateQuickAddModal(productHtml);
    }

    dialogComponent.showDialog();
  };

  async #fetchQuickAddSection(productPageUrl) {
    if (!productPageUrl) return null;

    const url = new URL(productPageUrl, window.location.origin);
    url.searchParams.set('section_id', 'quick-add-content');

    try {
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`Failed to fetch quick add section: HTTP error ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      console.error('[CartCrossSell] Error fetching quick add section:', error);
      return null;
    }
  }

  async #updateQuickAddModal(html) {
    const modalContent = document.getElementById('quick-add-modal-content');
    if (!html || !modalContent) return;

    morph(modalContent, html);

    requestAnimationFrame(() => {
      modalContent.querySelectorAll('carousel-component').forEach(el => {
        if (typeof el.reinit === 'function') el.reinit();
      });
    });
  }
}

if (!customElements.get('cart-cross-sell')) {
  customElements.define('cart-cross-sell', CartCrossSell);
}
