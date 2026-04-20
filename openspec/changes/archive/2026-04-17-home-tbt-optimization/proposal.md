# Proposal: Home Page TBT Optimization

## Intent

Home page TBT degraded from 350ms → 1,380ms after the previous FCP/LCP optimization round. Lighthouse desktop score is 66/100. The root cause is ~36KB+ of unnecessary JS modules loaded unconditionally on all pages, plus 253ms of eager carousel initialization. This change eliminates that waste through template-conditional loading.

## Scope

### In Scope
- Wrap product/cart-only scripts in template conditionals in `snippets/scripts.liquid` (~36KB removed from home)
- Wrap unnecessary `modulepreload` links in template conditionals
- Defer below-fold carousel (recently_viewed) initialization with IntersectionObserver
- Dynamic loading strategy for quick-add modal (load product-form.js/variant-picker.js on demand)

### Out of Scope
- `compiled_assets/styles.css` (46KB) — Shopify platform-controlled
- FK Grotesk Neue font (58KB) — Commonst Shopify app extension, not theme code
- `slideshow.js` — needed on home for product card galleries
- Carousel.js refactoring for above-fold carousels (Carrusel 1 new_arrivals stays eager)
- `critical.js` splitting (risk of layout shift)
- General Web Component lazy-registration registry (architectural change, too high effort)

## Capabilities

### New Capabilities
- `template-conditional-scripts`: Script loading strategy that wraps JS modules in Liquid template conditionals, loading only scripts needed for the current page template
- `dynamic-module-loading`: On-demand script loading for features triggered by user interaction (e.g., quick-add modal loading product-form.js only when opened)

### Modified Capabilities
None — no existing specs found in `openspec/specs/`.

## Approach

**Primary: Template-conditional JS loading.** In `snippets/scripts.liquid`, wrap scripts in `{% if template == 'product' %}` / `{% if template == 'cart' %}` blocks so they only load on pages that need them. This removes ~36KB and ~6 `customElements.define()` calls from the home page main thread.

**Secondary: Conditional modulepreloads.** Apply same template conditionals to `<link rel="modulepreload">` tags for the deferred scripts.

**Tertiary: Below-fold carousel lazy-init.** Add IntersectionObserver to defer initialization of the second carousel (recently_viewed, below-fold) while keeping the first carousel (new_arrivals, above-fold) eager.

**Quick-add safety net:** For product cards on home that have quick-add, dynamically import product-form.js and variant-picker.js when the quick-add modal opens, rather than preloading them.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `snippets/scripts.liquid` | Modified | Add template conditionals to ~10 script tags + modulepreload links |
| `assets/carousel.js` | Modified | Add lazy-init option for below-fold carousels via IntersectionObserver |
| `snippets/product-card.liquid` | Modified | Dynamic import for quick-add instead of preload |
| `blocks/product-carousel.liquid` | Modified | Pass lazy-init attribute to below-fold carousels |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Script needed in unexpected template (cart drawer, search results) | Medium | Audit all interactive elements: cart drawer, quick-add, search suggestions; test every page type |
| Quick-add breaks without preloaded scripts | Medium | Dynamic import with loading state when quick-add opens |
| Design mode (theme editor) requires all scripts | Low | Add `{% if request.design_mode %}` fallback to load all scripts |
| Below-fold carousel shows broken layout before init | Low | Skeleton/placeholder CSS state before initialization |

## Rollback Plan

Revert `snippets/scripts.liquid` to unconditional loading — all scripts load on all pages as before. Each template conditional is isolated and can be individually reverted.

## Dependencies

- None external. All changes are within theme code.

## Success Criteria

- [ ] Home page TBT drops below 600ms (from 1,380ms)
- [ ] Lighthouse desktop score improves to 80+
- [ ] No JS errors on any page template (product, cart, collection, home, page, blog)
- [ ] Quick-add modal works correctly from home page
- [ ] Cart drawer functionality unchanged
- [ ] Theme editor (design mode) renders all components correctly
