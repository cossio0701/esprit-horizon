import { DialogComponent } from "@theme/dialog";
import { CartAddEvent, CartUpdateEvent } from "@theme/events";

/**
 * A custom element that manages a cart drawer.
 *
 * @extends {DialogComponent}
 */
class CartDrawerComponent extends DialogComponent {
  connectedCallback() {
    super.connectedCallback();
    document.addEventListener(CartAddEvent.eventName, this.#handleCartAdd);

    this.addEventListener("click", this.#onTabClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener(CartAddEvent.eventName, this.#handleCartAdd);
  }

  /** @param {MouseEvent} event */
  #onTabClick = (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const tabButton = target.closest(".cart-drawer__tab");
    if (!(tabButton instanceof HTMLElement)) return;

    const tab = tabButton.dataset.tab;
    if (tab) this.#switchTab(tab);
  };

  /** @param {string} tab */
  #switchTab = (tab) => {
    const tabs = /** @type {NodeListOf<HTMLElement>} */ (
      this.querySelectorAll(".cart-drawer__tab")
    );
    const contents = /** @type {NodeListOf<HTMLElement>} */ (
      this.querySelectorAll(".cart-drawer__content")
    );

    tabs.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });

    contents.forEach((content) => {
      const isActive = content.dataset.tabContent === tab;
      content.classList.toggle("active", isActive);
      content.style.display = isActive ? "flex" : "none";
    });
  };

  /** @param {CartUpdateEvent} event */
  #handleCartAdd = (event) => {
    if (event.detail?.data?.skipOpen) return;

    if (this.hasAttribute("auto-open")) {
      this.#switchTab("cart");
      this.showDialog();
    }
  };

  open() {
    this.#switchTab("cart");
    this.showDialog();

    /**
     * Close cart drawer when installments CTA is clicked to avoid overlapping dialogs
     */
    customElements.whenDefined("shopify-payment-terms").then(() => {
      const installmentsContent = document.querySelector(
        "shopify-payment-terms",
      )?.shadowRoot;
      const cta = installmentsContent?.querySelector(
        "#shopify-installments-cta",
      );
      cta?.addEventListener("click", this.closeDialog, { once: true });
    });
  }

  close() {
    this.closeDialog();
  }
}

if (!customElements.get("cart-drawer-component")) {
  customElements.define("cart-drawer-component", CartDrawerComponent);
}
