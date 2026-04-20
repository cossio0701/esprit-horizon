# Design: Home TBT Optimization

## Technical Approach

Reduce home page TBT from ~1,380ms to ~600ms by: (1) wrapping 6 product/cart-only `<script>` tags in Liquid template conditionals in `scripts.liquid`, (2) applying matching conditionals to `<link rel="modulepreload">` hints, (3) deferring below-fold carousel initialization via IntersectionObserver, and (4) dynamically importing `product-form.js`/`variant-picker.js` only when quick-add is invoked on non-product pages. All conditionals fall back to loading everything under `request.design_mode`.

## Architecture Decisions

### Decision: Template condition mapping

**Choice**: Use `{% if request.design_mode %}…load all…{% else %}…conditional{% endif %}` pattern per script.

| Script | Condition | Rationale |
|--------|-----------|-----------|
| `product-form.js` | `template == 'product'` | Only PDP has add-to-cart form |
| `variant-picker.js` | `template == 'product'` | Variant selection is PDP-only |
| `media.js` | `template == 'product'` | PDP media player; product cards use slideshow |
| `product-inventory.js` | `template == 'product'` | Inventory display is PDP-only |
| `component-quantity-selector.js` | `template == 'product' or template == 'cart'` | PDP quantity + cart page quantity |
| `color-siblings.js` | `template.name == 'index' or collection/search/product` | Used in product cards (home, collection, search) and PDP variant picker |
| `component-cart-items.js` | No change | Already loaded inline in `cart-products.liquid`, not in `scripts.liquid` |

**Alternatives**: Feature-detect via DOM (`document.querySelector('variant-picker')`) — rejected because Liquid conditionals eliminate the parse cost entirely, while DOM detection still downloads/parses the module.

**Rationale**: Liquid conditionals prevent the browser from even seeing the `<script>` tag, eliminating both network and parse/compile costs (~36KB savings on home).

### Decision: Design mode safety net

**Choice**: Wrap conditional blocks in `{% if request.design_mode %}` that loads ALL scripts unconditionally.

**Rationale**: Shopify theme editor may not set `template` reliably; merchants must be able to customize all sections. Single top-level guard keeps each script block simple.

### Decision: Carousel lazy-init via IntersectionObserver

**Choice**: Add `lazy-init` attribute to `Carousel.connectedCallback`. When present, create IntersectionObserver with `rootMargin: '200px 0px'` that calls `#init()` when element nears viewport, then disconnects.

**Alternatives**: `requestIdleCallback` — rejected because it doesn't account for scroll proximity; `setTimeout(0)` — rejected, still runs during main task.

**Rationale**: Below-fold carousels contribute 253ms long task at page load. Observer defers work until ~200px from viewport, keeping above-fold paint fast. Home page product carousels will use `lazy-init`; above-fold hero carousels remain eager.

### Decision: Quick-add dynamic import strategy

**Choice**: In `quick-add.js`, add a pre-morph dynamic import of `product-form.js` and `variant-picker.js` inside `handleClick` when `window.Theme.template.name !== 'product'`. Cache the import promise to avoid re-fetching.

**Alternatives**: Import on `mouseenter` (prefetch) — adds complexity for marginal gain; keep eager — defeats TBT purpose.

**Rationale**: Quick-add modal needs product-form/variant-picker to function, but only when clicked. Dynamic import defers ~15KB until interaction. Product pages load them eagerly (already conditional).

## Data Flow

```
scripts.liquid (Liquid server-side)
  ├─ {% if design_mode %} → ALL scripts
  └─ {% else %}
       ├─ Unconditional: critical, carousel, slideshow, quick-add, dialog, etc.
       └─ Conditional: product-form, variant-picker, media, inventory, qty-selector, color-siblings

carousel.js (client-side)
  connectedCallback()
    ├─ No lazy-init → #init() immediately (above-fold)
    └─ lazy-init → IntersectionObserver → #init() on near-viewport

quick-add.js (client-side)
  handleClick()
    ├─ template == product → morph() directly (scripts already loaded)
    └─ template != product → await dynamic import → morph()
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `snippets/scripts.liquid` | Modify | Wrap 6 scripts in `{% if %}` conditionals with design_mode fallback; wrap matching modulepreload hints |
| `assets/carousel.js` | Modify | Add `lazy-init` attribute support: IntersectionObserver in `connectedCallback`, skeleton CSS class before init |
| `assets/quick-add.js` | Modify | Add dynamic import of product-form/variant-picker in `handleClick` when not on product page |
| `blocks/product-carousel.liquid` | Modify | Add `lazy-init` attribute to `<carousel-component>` element |

## Interfaces / Contracts

### Carousel `lazy-init` attribute (new)

```html
<carousel-component lazy-init loop="true" columns-desktop="4">
```

- When present in `connectedCallback`: skip `#init()`, add `carousel--pending` CSS class, create IntersectionObserver
- Observer callback: remove `carousel--pending`, call `#init()`, disconnect observer
- `rootMargin: '200px 0px'` — starts init 200px before visible

### Quick-add dynamic import (new internal method)

```javascript
async #ensureProductFormScripts() {
  if (this.#scriptsLoaded) return;
  await Promise.all([
    import('@theme/product-form'),
    import('@theme/variant-picker'),
  ]);
  this.#scriptsLoaded = true;
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Manual | Home page Lighthouse TBT | Before/after comparison, target <600ms |
| Manual | Product page scripts still work | Verify variant picker, add-to-cart, quantity selector |
| Manual | Cart page scripts still work | Verify cart quantity, cart items |
| Manual | Quick-add from home page | Click quick-add → modal opens → variant selection works → add to cart |
| Manual | Design mode loads all scripts | Open theme editor on home → verify all components render |
| Manual | Carousel lazy-init | Scroll to below-fold carousel → verify it initializes smoothly |
| Regression | Collection/search pages | Verify color-siblings, pagination, product cards |

## Migration / Rollout

No migration required. Changes are purely template-level conditionals and client-side JS logic. Rollback = revert the commit. No data changes, no feature flags needed.

## Open Questions

- [ ] Confirm `component-quantity-selector.js` is NOT used in cart drawer (cart uses `cart-quantity-selector-component` from `cart-products.liquid` — if shared, condition needs expanding)
- [ ] Should the first carousel on home (if above-fold) also get `lazy-init`? Exploration suggests hero banner is app-rendered, not carousel-component — verify.
