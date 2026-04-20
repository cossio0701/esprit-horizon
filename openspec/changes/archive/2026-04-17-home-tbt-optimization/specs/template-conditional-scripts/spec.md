# Template-Conditional Scripts Specification

## Purpose

Controls which JavaScript modules load on each page template, eliminating unnecessary scripts from pages that don't need them.

## Requirements

### Requirement: Template-Conditional Script Loading

The system MUST wrap each script tag in `snippets/scripts.liquid` with a Liquid conditional matching the template(s) that require it. Scripts MUST NOT load on templates that don't use their functionality.

| Script | Allowed Templates |
|--------|------------------|
| product-form.js | `product` |
| variant-picker.js | `product` |
| media.js | `product` |
| product-inventory.js | `product` |
| component-quantity-selector.js | `product`, `cart` |
| component-cart-items.js | `cart` |
| component-cart-quantity-selector.js | `cart` |

#### Scenario: Home page loads only home-required scripts

- GIVEN the current template is `index`
- WHEN the page renders `snippets/scripts.liquid`
- THEN none of the 7 scripts listed above are included in the HTML output

#### Scenario: Product page loads product scripts

- GIVEN the current template is `product`
- WHEN the page renders `snippets/scripts.liquid`
- THEN product-form.js, variant-picker.js, media.js, product-inventory.js, and component-quantity-selector.js are included

#### Scenario: Cart page loads cart scripts

- GIVEN the current template is `cart`
- WHEN the page renders `snippets/scripts.liquid`
- THEN component-cart-items.js, component-cart-quantity-selector.js, and component-quantity-selector.js are included

### Requirement: Design Mode Fallback

The system MUST load ALL scripts unconditionally when `request.design_mode` is true, ensuring the theme editor renders every component correctly.

#### Scenario: Theme editor loads all scripts

- GIVEN `request.design_mode` is true
- WHEN the page renders
- THEN all 7 template-conditional scripts are included regardless of template

### Requirement: Conditional Modulepreload Hints

The system MUST wrap `<link rel="modulepreload">` hints with the same Liquid conditionals as their corresponding script tags. A modulepreload hint MUST NOT appear on a page where the script itself would not load.

#### Scenario: Home page omits unnecessary preloads

- GIVEN the current template is `index` and `request.design_mode` is false
- WHEN the page renders `<head>`
- THEN no modulepreload hints exist for product-form.js, variant-picker.js, media.js, product-inventory.js, component-quantity-selector.js, component-cart-items.js, or component-cart-quantity-selector.js

### Requirement: Below-Fold Carousel Lazy Initialization

Carousels that are not in the initial viewport MUST defer initialization until they approach the viewport. The system MUST use IntersectionObserver with `rootMargin` to trigger initialization before the carousel becomes visible.

#### Scenario: Below-fold carousel defers init

- GIVEN a carousel element has a `lazy-init` attribute and is below the fold
- WHEN the page loads
- THEN the carousel shows a skeleton/placeholder state and does NOT call `#init()` until it intersects the observer's root margin

#### Scenario: Above-fold carousel initializes eagerly

- GIVEN a carousel element does NOT have a `lazy-init` attribute
- WHEN the page loads
- THEN the carousel initializes immediately without waiting for IntersectionObserver

#### Scenario: Lazy carousel initializes on scroll

- GIVEN a lazy-init carousel exists below the fold
- WHEN the user scrolls near it (enters observer root margin)
- THEN the carousel initializes and the skeleton state is replaced with the full carousel
