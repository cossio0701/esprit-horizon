import { calculateHeaderGroupHeight } from '@theme/critical';
import { Component } from '@theme/component';
import { onDocumentLoaded, changeMetaThemeColor } from '@theme/utilities';

/**
 * @typedef {Object} HeaderComponentRefs
 * @property {HTMLDivElement} headerDrawerContainer - The header drawer container element
 * @property {HTMLElement} headerMenu - The header menu element
 * @property {HTMLElement} headerRowTop - The header top row element
 */

/**
 * @typedef {CustomEvent<{ minimumReached: boolean }>} OverflowMinimumEvent
 */

/**
 * A custom element that manages the site header.
 *
 * @extends {Component<HeaderComponentRefs>}
 */

class HeaderComponent extends Component {
  requiredRefs = ['headerDrawerContainer', 'headerMenu', 'headerRowTop', 'mobileMenuToggle', 'mobileMenuDrawer', 'mobileMenuClose', 'mobileMenuOverlay', 'mobileMenuBody'];

  /**
   * Width of window when header drawer was hidden
   * @type {number | null}
   */
  #menuDrawerHiddenWidth = null;

  /**
   * The last recorded scrollTop of the document, when sticky behavior is 'scroll-up
   * @type {number}
   */
  #lastScrollTop = 0;

  /**
   * A timeout to allow for hiding animation, when sticky behavior is 'scroll-up'
   * @type {number | null}
   */
  #timeout = null;

  /**
   * The duration to wait for hiding animation, when sticky behavior is 'scroll-up'
   * @constant {number}
   */
  #animationDelay = 150;

  /**
   * Minimum document scroll needed before the home header switches state.
   * This avoids micro-scroll jitter while still making the transition depend
   * on real document scroll instead of the header's viewport position.
   * @constant {number}
   */
  #scrollThreshold = 8;

  /**
   * Keeps the global `--header-height` custom property up to date,
   * which other theme components can then consume
   */
  #resizeObserver = new ResizeObserver(([entry]) => {
    if (!entry) return;

    const { height } = entry.target.getBoundingClientRect();
    document.body.style.setProperty('--header-height', `${height}px`);

    // Check if the menu drawer should be hidden in favor of the header menu
    if (this.#menuDrawerHiddenWidth && window.innerWidth > this.#menuDrawerHiddenWidth) {
      this.#updateMenuVisibility(false);
    }
  });

  /**
   * Returns the current document scroll position.
   * @returns {number}
   */
  #getScrollTop = () => Math.max(0, document.scrollingElement?.scrollTop ?? window.scrollY ?? 0);

  /**
   * Clears the pending hide timeout for scroll-up sticky mode.
   */
  #clearHideTimeout = () => {
    if (!this.#timeout) return;

    clearTimeout(this.#timeout);
    this.#timeout = null;
  };

  /**
   * Updates the header sticky datasets with a single source of truth.
   * @param {'inactive' | 'active' | 'idle'} stickyState
   * @param {'none' | 'up' | 'down'} scrollDirection
   */
  #setStickyPresentation = (stickyState, scrollDirection) => {
    const stateChanged = this.dataset.stickyState !== stickyState;
    const directionChanged = this.dataset.scrollDirection !== scrollDirection;

    if (stateChanged) {
      this.dataset.stickyState = stickyState;
      changeMetaThemeColor(this.refs.headerRowTop);
    }

    if (directionChanged) {
      this.dataset.scrollDirection = scrollDirection;
    }
  };

  /**
   * Updates sticky state for `sticky="always"` based on real document scroll.
   * @param {number} scrollTop
   */
  #updateAlwaysStickyState = (scrollTop) => {
    const hasScrolled = scrollTop > this.#scrollThreshold;
    const isScrollingUp = scrollTop < this.#lastScrollTop;

    this.removeAttribute('data-animating');
    this.#clearHideTimeout();

    this.#setStickyPresentation(
      hasScrolled ? 'active' : 'inactive',
      hasScrolled ? (isScrollingUp ? 'up' : 'down') : 'none'
    );

    this.#lastScrollTop = scrollTop;
  };

  /**
   * Updates sticky state for `sticky="scroll-up"` based on real document scroll.
   * @param {number} scrollTop
   */
  #updateScrollUpStickyState = (scrollTop) => {
    const headerHeight = this.getBoundingClientRect().height;
    const hasScrolled = scrollTop > this.#scrollThreshold;
    const hasPassedHeader = scrollTop > headerHeight;
    const isScrollingUp = scrollTop < this.#lastScrollTop;

    if (!hasScrolled || !hasPassedHeader) {
      this.removeAttribute('data-animating');
      this.#clearHideTimeout();
      this.#setStickyPresentation('inactive', 'none');
      this.#lastScrollTop = scrollTop;
      return;
    }

    if (isScrollingUp) {
      this.removeAttribute('data-animating');
      this.#clearHideTimeout();
      this.#setStickyPresentation('active', 'up');
      this.#lastScrollTop = scrollTop;
      return;
    }

    if (this.dataset.stickyState === 'active') {
      this.setAttribute('data-animating', '');
      this.#setStickyPresentation('active', 'none');
      this.#clearHideTimeout();

      this.#timeout = setTimeout(() => {
        this.#setStickyPresentation('idle', 'none');
        this.removeAttribute('data-animating');
      }, this.#animationDelay);
    } else {
      this.#setStickyPresentation('idle', 'none');
    }

    this.#lastScrollTop = scrollTop;
  };

  /**
   * Handles the overflow minimum event from the header menu
   * @param {OverflowMinimumEvent} event
   */
  #handleOverflowMinimum = (event) => {
    this.#updateMenuVisibility(event.detail.minimumReached);
  };

  /**
   * Updates the visibility of the menu and drawer
   * @param {boolean} hideMenu - Whether to hide the menu and show the drawer
   */
  #updateMenuVisibility(hideMenu) {
    if (hideMenu) {
      this.refs.headerDrawerContainer.classList.remove('desktop:hidden');
      this.#menuDrawerHiddenWidth = window.innerWidth;
      this.refs.headerMenu.classList.add('hidden');
    } else {
      this.refs.headerDrawerContainer.classList.add('desktop:hidden');
      this.#menuDrawerHiddenWidth = null;
      this.refs.headerMenu.classList.remove('hidden');
    }
  }

  #handleWindowScroll = () => {
    const stickyMode = this.getAttribute('sticky');
    const scrollTop = this.#getScrollTop();

    if (stickyMode === 'always') {
      this.#updateAlwaysStickyState(scrollTop);
      return;
    }

    if (stickyMode === 'scroll-up') {
      this.#updateScrollUpStickyState(scrollTop);
    }
  };

  /**
   * Opens the mobile menu drawer and moves dynamic content if needed
   */
  #openMobileMenu = () => {
    const drawer = Array.isArray(this.refs.mobileMenuDrawer) ? this.refs.mobileMenuDrawer[0] : this.refs.mobileMenuDrawer;
    if (drawer) drawer.setAttribute('open', '');
    document.body.classList.add('overflow-hidden');

    // Move dynamic menu content if it exists and hasn't been moved yet
    const dynamicContent = document.querySelector('[data-mobile-menu-content]');
    const body = Array.isArray(this.refs.mobileMenuBody) ? this.refs.mobileMenuBody[0] : this.refs.mobileMenuBody;
    if (dynamicContent && body && !body.contains(dynamicContent)) {
      body.appendChild(dynamicContent);
    }
  };

  /**
   * Closes the mobile menu drawer
   */
  #closeMobileMenu = () => {
    const drawer = Array.isArray(this.refs.mobileMenuDrawer) ? this.refs.mobileMenuDrawer[0] : this.refs.mobileMenuDrawer;
    if (drawer) drawer.removeAttribute('open');
    document.body.classList.remove('overflow-hidden');
  };

  connectedCallback() {
    super.connectedCallback();
    this.#resizeObserver.observe(this);
    this.addEventListener('overflowMinimum', this.#handleOverflowMinimum);
    this.#lastScrollTop = this.#getScrollTop();

    const stickyMode = this.getAttribute('sticky');
    if (stickyMode) {
      if (stickyMode === 'always') {
        this.#updateAlwaysStickyState(this.#lastScrollTop);
      } else if (stickyMode === 'scroll-up') {
        this.#updateScrollUpStickyState(this.#lastScrollTop);
      }

      if (stickyMode === 'scroll-up' || stickyMode === 'always') {
        document.addEventListener('scroll', this.#handleWindowScroll, { passive: true });
      }
    }

    // Mobile menu events
    const toggle = Array.isArray(this.refs.mobileMenuToggle) ? this.refs.mobileMenuToggle[0] : this.refs.mobileMenuToggle;
    const close = Array.isArray(this.refs.mobileMenuClose) ? this.refs.mobileMenuClose[0] : this.refs.mobileMenuClose;
    const overlay = Array.isArray(this.refs.mobileMenuOverlay) ? this.refs.mobileMenuOverlay[0] : this.refs.mobileMenuOverlay;

    toggle?.addEventListener('click', this.#openMobileMenu);
    close?.addEventListener('click', this.#closeMobileMenu);
    overlay?.addEventListener('click', this.#closeMobileMenu);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#resizeObserver.disconnect();
    this.#clearHideTimeout();
    this.removeEventListener('overflowMinimum', this.#handleOverflowMinimum);
    document.removeEventListener('scroll', this.#handleWindowScroll);
    document.body.style.setProperty('--header-height', '0px');
  }
}

if (!customElements.get('header-component')) {
  customElements.define('header-component', HeaderComponent);
}

onDocumentLoaded(() => {
  const header = document.querySelector('#header-component');
  const headerGroup = document.querySelector('#header-group');

  // Update header group height on resize of any child
  if (headerGroup) {
    const resizeObserver = new ResizeObserver(() => calculateHeaderGroupHeight(header, headerGroup));

    // Observe all children of the header group
    const children = headerGroup.children;
    for (let i = 0; i < children.length; i++) {
      const element = children[i];
      if (element === header || !(element instanceof HTMLElement)) continue;
      resizeObserver.observe(element);
    }

    // Also observe the header group itself for child changes
    const mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          // Re-observe all children when the list changes
          const children = headerGroup.children;
          for (let i = 0; i < children.length; i++) {
            const element = children[i];
            if (element === header || !(element instanceof HTMLElement)) continue;
            resizeObserver.observe(element);
          }
        }
      }
    });

    mutationObserver.observe(headerGroup, { childList: true });
  }
});
