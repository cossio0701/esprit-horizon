# Implementation Tasks: Home TBT Optimization

## Phase 1: Template-Conditional Scripts (DEL-1 + DEL-2)

### Task 1.1: Wrap product-only scripts in `scripts.liquid` [x]
Wrap `product-form.js`, `variant-picker.js`, `media.js`, `product-inventory.js` in `{% if template == 'product' %}` conditionals with design_mode fallback.

**File**: `snippets/scripts.liquid`
**Lines**: 144-147 (variant-picker), 164-167 (product-form), 179-182 (media), 194-197 (inventory)
**Change**: Add conditional wrapper around each script tag:
```liquid
{% if request.design_mode or template == 'product' %}
  <script src="{{ 'variant-picker.js' | asset_url }}" type="module" fetchpriority="low"></script>
{% endif %}
```

### Task 1.2: Wrap quantity-selector script [x]
Wrap `component-quantity-selector.js` in `{% if template == 'product' or template == 'cart' %}` conditional with design_mode fallback.

**File**: `snippets/scripts.liquid`
**Lines**: 230-234
**Change**: Add conditional wrapper for product+cart pages.

### Task 1.3: Wrap color-siblings script [x]
Wrap `color-siblings.js` in `{% if template.name == 'index' or template.name == 'collection' or template.name == 'search' or template == 'product' %}` conditional with design_mode fallback.

**File**: `snippets/scripts.liquid`
**Lines**: 287
**Change**: Add conditional wrapper for pages that use color siblings (home product carousels, collection/search grids, PDP variant picker).

### Task 1.4: Add conditional modulepreload hints [x] N/A
Add matching `{% if %}` conditionals to modulepreload `<link>` tags for `product-form.js`, `variant-picker.js`, `media.js`, `product-inventory.js`, `component-quantity-selector.js`.

**Note**: These scripts are loaded via importmap (lines 6-34 in scripts.liquid), not modulepreload. No matching modulepreload tags exist to wrap.

**File**: `snippets/scripts.liquid`
**Location**: After existing modulepreload block (after line 80)
**Change**: Add new conditional modulepreload block with design_mode fallback.

### Task 1.5: Verify Phase 1 [x]
**Verification completed:**
- ✅ Syntax verified: Liquid conditionals correctly structured with 2-space indentation
- ✅ Original attributes preserved: type="module", fetchpriority="low" on all wrapped scripts
- ✅ Design mode fallback present: `request.design_mode` added to all conditionals
- ✅ Wrapped scripts: variant-picker.js, product-form.js, media.js, product-inventory.js, component-quantity-selector.js, color-siblings.js
- ℹ️ Not tested: Lighthouse TBT, functional testing (requires browser/Shopify environment)

---

## Phase 2: Carousel Lazy-Init (DEL-3)

### Task 2.1: Add `lazy-init` attribute support in `carousel.js` [x]
Modify `connectedCallback` to check for `lazy-init` attribute. If present, skip `#init()`, add `carousel--pending` CSS class, create IntersectionObserver with `rootMargin: '200px 0px'`.

**File**: `assets/carousel.js`
**Lines**: 40-61 (connectedCallback)
**Change**: 
- Added `#lazyObserver` and `#isInitialized` private fields
- Modified `connectedCallback` to check for `lazy-init` attribute
- If present: add `carousel--pending` class, create lazy observer
- If absent: call `#init()` immediately (backward compatible)
- Modified resize handler to only call `#init()` if already initialized

### Task 2.2: Add `#createLazyObserver` private method [x]
Add IntersectionObserver that calls `#init()` when carousel enters viewport (200px margin), removes pending class, disconnects observer.

**File**: `assets/carousel.js`
**Location**: After `#createLazyObserver` method (lines 63-76)
**Change**: Added private method that:
- Creates IntersectionObserver with rootMargin: '200px 0px'
- Calls `#init()` when element enters viewport
- Removes `carousel--pending` class
- Disconnects observer after init

### Task 2.3: Add `lazy-init` to `observedAttributes` [x]
Add `lazy-init` to `static observedAttributes` array.

**File**: `assets/carousel.js`
**Lines**: 28-35
**Change**: Added `'lazy-init'` to observedAttributes array.

### Task 2.4: Add carousel skeleton CSS [x]
Add `.carousel--pending` CSS class in carousel.css for skeleton/loading state before lazy init.

**File**: `assets/carousel.css`
**Location**: After skeleton loaders section (line ~377)
**Change**: Added:
```css
carousel-component.carousel--pending {
  min-height: 300px;
  opacity: 0.7;
}
carousel-component.carousel--pending .carousel-scroller-wrapper {
  visibility: hidden;
}
```

### Task 2.5: Add `lazy-init` to product-carousel block [x]
Add `lazy-init` attribute to `<carousel-component>` in product-carousel-infinite snippet.

**File**: `snippets/product-carousel-infinite.liquid`
**Change**: Added `lazy-init` attribute to carousel-component element.

### Task 2.6: Verify Phase 2 [x]
**Verification completed:**
- ✅ Syntax verified: JavaScript parses without errors
- ✅ Backward compatibility preserved: No `lazy-init` attribute = same behavior as before
- ✅ IntersectionObserver cleanup: Disconnected in `#createLazyObserver` callback and in `disconnectedCallback`
- ✅ `#isInitialized` flag prevents double-init
- ✅ Resize handler checks `#isInitialized` before re-init
- ✅ `reinit()` method resets flag to allow re-initialization
- ℹ️ Not tested: Scroll behavior, CLS (requires browser/Shopify environment)

---

## Phase 3: Dynamic Quick-Add Loading (DEL-4)

### Task 3.1: Add dynamic import method in `quick-add.js` [x]
Add `#ensureProductFormScripts()` private method that dynamically imports `@theme/product-form` and `@theme/variant-picker` when not on product page. Cache promise to avoid re-fetching.

**File**: `assets/quick-add.js`
**Location**: After LRUCache class, before QuickAddComponent
**Change**:
```javascript
let productFormScriptsPromise = null;

async function ensureProductFormScripts() {
  if (productFormScriptsPromise) return productFormScriptsPromise;
  if (window.Theme?.template?.name === 'product') return; // Already loaded
  productFormScriptsPromise = Promise.all([
    import('@theme/product-form'),
    import('@theme/variant-picker'),
  ]);
  return productFormScriptsPromise;
}
```

### Task 3.2: Call dynamic import in `handleClick` [x]
Modify `handleClick` to call `ensureProductFormScripts()` before morphing when on non-product pages.

**File**: `assets/quick-add.js`
**Lines**: 117-143 (handleClick)
**Change**:
```javascript
handleClick = async (event) => {
  event.preventDefault();
  
  // Dynamic import for non-product pages
  if (window.Theme?.template?.name !== 'product') {
    await ensureProductFormScripts();
  }
  
  // ... rest of existing code
};
```

### Task 3.3: Verify Phase 3 [x]
**Verification completed:**
- ✅ Syntax verified: JavaScript parses without errors
- ✅ Dynamic import uses correct importmap aliases: `@theme/product-form`, `@theme/variant-picker`
- ✅ Promise caching: `productFormScriptsPromise` ensures scripts only imported once
- ✅ Conditional check: Only imports on non-product pages (home, collection, search)
- ✅ Backward compatibility: Product pages skip dynamic import (scripts already loaded via scripts.liquid)
- ℹ️ Not tested: Functional testing (requires browser/Shopify environment)

---

## Summary

| Phase | Tasks | Impact | Risk |
|-------|-------|--------|------|
| Phase 1 | 5 | High (~36KB reduction) | Low (Liquid conditionals) |
| Phase 2 | 6 | Medium (defer long task) | Medium (JS changes) |
| Phase 3 | 3 | Lower (on-demand load) | Medium (async import) |

**Total**: 14 tasks across 3 phases with verification per phase.