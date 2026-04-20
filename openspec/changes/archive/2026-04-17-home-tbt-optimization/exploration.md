# Exploration: Home Page TBT Performance Optimization

## Current State

The home page scores **66/100** on Lighthouse desktop. The previous optimization round (`home-performance-optimization`) improved FCP (1.7s→0.8s) and LCP (2.8s→0.9s) but **TBT got significantly worse** (350ms→1,380ms, score 0.01).

### Root Cause Analysis

**1. Unnecessary JS loaded on every page (scripts.liquid)**

The file `snippets/scripts.liquid` loads ~20+ JS modules unconditionally on ALL pages. The following scripts are loaded on home but only needed on specific templates:

| Script | Size | Needed on Home? | Actually Used On |
|--------|------|-----------------|------------------|
| `product-form.js` | 13KB | ❌ NO | Product pages (add-to-cart) |
| `variant-picker.js` | 7.3KB | ❌ NO | Product pages (variant selection) |
| `media.js` | 3.9KB | ❌ NO | Product pages (deferred media, 3D models) |
| `product-inventory.js` | 929B | ❌ NO | Product pages (inventory display) |
| `component-quantity-selector.js` | 4.3KB | ❌ NO | Cart/product pages (qty selector) |
| `component-cart-items.js` | 6.2KB | ❌ NO | Cart pages (cart management) |
| `component-cart-quantity-selector.js` | 695B | ❌ NO | Cart pages |
| `accordion-custom.js` | ~3KB | ❌ NO | Pages with accordions |
| `disclosure-custom.js` | ~2KB | ❌ NO | Pages with disclosures |
| `rte-formatter.js` | ~2KB | ❌ NO | Rich text editing |
| `anchored-popover.js` | ~3KB | ⚠️ Maybe | Header/search popovers |
| `floating-panel.js` | ~3KB | ⚠️ Maybe | Floating UI panels |
| `help-floating-component.js` | ~2KB | ✅ YES | Help modal (rendered on all pages) |
| `video-background.js` | ~2KB | ⚠️ Maybe | Video backgrounds |

**Total unnecessary JS on home: ~36KB+** (not counting modulepreload overhead)

**2. All scripts use `type="module"` + `fetchpriority="low"` but NO template conditionals**

Every script is loaded as an ES module. While `fetchpriority="low"` helps, the browser still has to:
- Fetch every module file
- Parse every module file
- Execute `customElements.define()` for every component

The `customElements.define()` calls happen synchronously during module evaluation, contributing to main-thread blocking time.

**3. carousel.js contributes 253ms long task**

The carousel Web Component (`assets/carousel.js`, 490 lines) does heavy work in `connectedCallback()`:
- `#init()` runs immediately on connection
- Clones DOM nodes for infinite loop
- Sets up scroll snap, keyboard listeners, autoplay
- No lazy initialization or IntersectionObserver deferral

The product-carousel.js uses IntersectionObserver to defer product loading, but the carousel.js itself initializes immediately when the custom element is connected.

**4. slideshow.js loaded unconditionally (75ms contribution)**

`slideshow.js` (797 lines) is loaded on ALL pages. It IS needed on home because:
- Product cards in the "Spring days" section use `card-gallery` → `slideshow` for image galleries
- Product carousels may also use slideshow for product images

However, slideshow.js is a heavy component with drag handling, view transitions, and complex scroll management.

**5. compiled_assets/styles.css (46KB, 93% unused)**

This is Shopify's **platform-generated** CSS bundle that aggregates all `{% style %}` blocks from every section/block used on the page. It's not controlled by theme code — Shopify generates it automatically. The 93% unused CSS comes from styles for sections/blocks NOT present on the home page but included in the global bundle.

**6. FK Grotesk Neue font-face (58KB, 100% unused)**

This font is NOT configured in theme settings (settings use `sans_serif_n4`/`sans_serif_n7` system fonts). It's likely injected by the **Commonst Esprit LTM Shopify App** (header dynamic menu block) or the Shopify extension's CSS. Cannot be controlled from theme code.

**7. header-main.css (394ms render-blocking)**

This CSS comes from the Shopify App extension (Commonst Esprit LTM). It's render-blocking and external to the theme.

**8. Module preloads for unused scripts**

`scripts.liquid` has `<link rel="modulepreload">` for many scripts that aren't needed on home:
- `utilities.js`, `component.js`, `section-renderer.js`, `section-hydration.js`, `morph.js`
- `focus.js`, `recently-viewed-products.js`, `scrolling.js`, `events.js`

These are preloaded even though they may not be immediately needed.

**9. Inline scripts in head (56ms-106ms each)**

The following inline scripts run in the head:
- Import map definition
- `window.STOREFRONT_ACCESS_TOKEN` / `window.STOREFRONT_DOMAIN`
- `Theme` object with placeholders, translations, routes
- `critical.js` loaded with `async blocking="render"`

**10. Home page sections confirmed from index.json**

1. Banner home (Shopify App block)
2. Essentials (text content)
3. Carrusel 1 (product-carousel, source: new_arrivals)
4. AI blocks group (spacer + category images)
5. Sección Nomad (container with video + image)
6. Spring days (container with image + 4 product-cards)
7. Seccion Video (autoplay video, preload=none already set)
8. Carrusel 2 (product-carousel, source: recently_viewed)

## Affected Areas

- `snippets/scripts.liquid` — Main script loading strategy, needs template conditionals
- `assets/carousel.js` — Heavy initialization, could defer with IntersectionObserver
- `assets/slideshow.js` — Loaded unconditionally, needed for product card galleries
- `layout/theme.liquid` — Entry point for critical.js and script rendering
- `snippets/fonts.liquid` — Font preloading (FK Grotesk likely from app, not theme)
- `snippets/product-card.liquid` — Uses slideshow for card galleries
- `snippets/card-gallery.liquid` — Renders slideshow-component for product images
- `blocks/product-carousel.liquid` — Uses carousel-component
- `config/settings_data.json` — Font settings (system fonts, not FK Grotesk)

## Approaches

### Approach 1: Template-conditional JS loading (Highest Impact)
Wrap unnecessary scripts in `scripts.liquid` with template conditionals:
```liquid
{% if template == 'product' %}
  <script src="{{ 'product-form.js' | asset_url }}" type="module" fetchpriority="low"></script>
  <script src="{{ 'variant-picker.js' | asset_url }}" type="module" fetchpriority="low"></script>
  <script src="{{ 'media.js' | asset_url }}" type="module" fetchpriority="low"></script>
  <script src="{{ 'product-inventory.js' | asset_url }}" type="module" fetchpriority="low"></script>
{% endif %}
{% if template == 'cart' %}
  <script src="{{ 'component-cart-items.js' | asset_url }}" type="module" fetchpriority="low"></script>
{% endif %}
```
- **Pros:** Eliminates ~36KB+ of unnecessary JS parsing/evaluation on home. Direct TBT reduction.
- **Cons:** Must carefully audit each script for cross-template usage. Risk of breaking functionality if a script is needed somewhere unexpected.
- **Effort:** Medium — requires testing on all page types.

### Approach 2: Lazy-initialize carousel with IntersectionObserver
Defer carousel.js initialization until the carousel enters the viewport:
- Move `#init()` logic behind an IntersectionObserver
- Show skeleton/placeholder until initialization
- **Pros:** Reduces main-thread work during initial page load. The 253ms long task moves off the critical path.
- **Cons:** User might see a brief delay before carousel becomes interactive. Product carousels on home are above-fold (Carrusel 1), so this might hurt perceived performance.
- **Effort:** Medium — requires careful UX consideration for above-fold carousels.

### Approach 3: Remove unnecessary modulepreloads
Only preload modules that are actually needed on the current template:
```liquid
{% if template == 'index' %}
  <link rel="modulepreload" href="{{ 'carousel.js' | asset_url }}" fetchpriority="low">
{% endif %}
```
- **Pros:** Reduces network contention during critical loading phase.
- **Cons:** Modules not preloaded will load slightly later (but still with `type="module"` defer behavior).
- **Effort:** Low — straightforward conditional wrapping.

### Approach 4: Split critical.js to reduce render-blocking time
`critical.js` is loaded with `async blocking="render"` — it blocks rendering. It contains OverflowList and header height calculations. Consider:
- Moving non-critical parts out of critical.js
- Using `defer` instead of `blocking="render"` where possible
- **Pros:** Could reduce render-blocking time.
- **Cons:** Risk of layout shift if header calculations are deferred.
- **Effort:** Medium-High — requires careful analysis of what's truly critical.

### Approach 5: Defer non-essential Web Component registration
Instead of registering all custom elements at module evaluation time, use a registry pattern:
```javascript
// Instead of immediate customElements.define()
const registry = new Map();
registry.set('product-form', ProductFormComponent);
// Only define when element is found in DOM
if (document.querySelector('product-form-component')) {
  customElements.define('product-form-component', ProductFormComponent);
}
```
- **Pros:** Avoids parsing/evaluating component code for elements not on the page.
- **Cons:** Significant refactor across all JS files. Complex to implement correctly.
- **Effort:** High — architectural change across the entire JS codebase.

### Approach 6: Address compiled_assets/styles.css (Shopify Platform)
The 46KB compiled CSS with 93% unused is Shopify's platform-generated bundle. Options:
- **Cannot directly control** — Shopify generates this from all section/block `{% style %}` tags
- **Mitigation:** Minimize `{% style %}` blocks in sections/blocks not used on home
- **Font issue:** FK Grotesk likely from Commonst app — contact app developer or disable app font loading
- **Effort:** Low-Medium — audit and reduce style blocks, but limited control over platform behavior.

## Recommendation

**Prioritize Approach 1 (template-conditional JS loading)** as the primary fix, combined with **Approach 3 (conditional modulepreloads)**. These two together will:
1. Eliminate ~36KB+ of unnecessary JS from home page
2. Remove ~6 unnecessary `customElements.define()` calls from main thread
3. Reduce modulepreload network contention

This directly addresses the 1,380ms TBT by removing the scripts that contribute to long tasks without being used.

**Secondary: Approach 2 (carousel lazy-init)** for the second carousel (recently viewed) which is below-fold. The first carousel (new arrivals) is above-fold and should remain eager.

**Tertiary: Investigate FK Grotesk font** — check if the Commonst app has a setting to disable custom font loading. The 58KB font is 100% unused on home.

**Out of scope (for now):**
- `compiled_assets/styles.css` — Shopify platform-controlled, limited theme-side mitigation
- `header-main.css` — Shopify App extension, not theme-controlled
- `slideshow.js` — Actually needed on home for product card galleries

## Risks

1. **Template conditional gaps:** Some scripts might be used in unexpected places (e.g., product cards in cart drawer might need product-form.js). Must test cart drawer, quick-add modal, search results, and collection pages thoroughly.
2. **Quick-add modal:** If quick-add is triggered from home page, it may need product-form.js and variant-picker.js. These need to be loaded when quick-add opens, not necessarily on page load.
3. **Cart drawer:** The header has a cart drawer with cross-sell. If it uses cart-items or quantity-selector, those scripts need to be available.
4. **Shopify App blocks:** The Commonst app blocks may have their own JS dependencies that interact with theme scripts.
5. **Design mode:** Scripts may be needed in theme editor/design mode for preview functionality.

## Ready for Proposal

**Yes** — sufficient investigation completed. The primary recommendation (template-conditional JS loading) is well-understood with clear affected files and manageable risk. The orchestrator should proceed to sdd-propose with this analysis.
