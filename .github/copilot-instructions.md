# AI Coding Agent Instructions for Esprit Horizon Theme

## 🚨 MANDATORY WORKFLOW: ANALYZE → PLAN → WAIT FOR APPROVAL

**CRITICAL: Before making ANY code changes, modifications, or implementations, you MUST:**

1. **📊 ANALYZE**: Present a comprehensive analysis following the decision-making framework below
2. **📋 PLAN**: Create a detailed step-by-step implementation plan
3. **⏸️ WAIT**: Stop and explicitly ask for user approval or adjustments before proceeding
4. **✅ EXECUTE**: Only after receiving explicit authorization, proceed with changes

**You are FORBIDDEN from:**
- Making direct code changes without presenting analysis first
- Assuming approval - always wait for explicit confirmation
- Skipping the planning phase for "simple" tasks
- Proceeding without showing the full scope of changes

**Format for every request:**
```
## 🔍 Analysis
[Detailed analysis following the framework below]

## 📋 Implementation Plan
1. [Step 1]
2. [Step 2]
...

## ⚠️ Impact Assessment
- Files to modify: [list]
- Potential risks: [list]
- Testing requirements: [list]

**Waiting for your approval to proceed. Would you like me to:**
- ✅ Proceed with this plan
- 🔄 Adjust the approach
- ❌ Cancel
```

---

## Architecture Overview

This is **Shopify's latest flagship theme (Horizon)** - a cutting-edge implementation showcasing Shopify's most advanced features and best practices. Built with modern web components, native Liquid templating, and progressive enhancement principles.

### Core Philosophy: Leverage Shopify & Horizon Capabilities First

**CRITICAL: Before implementing ANY feature, perform a thorough analysis:**

#### Step 1: Analyze Shopify Native Solutions
- **Metafields** - Can this be solved with custom product/collection/variant fields?
- **Metaobjects** - Should this be a structured content type managed in admin?
- **Menus/Navigation** - Is this navigation-related? Use `linklists` for merchant control
- **Sections/Blocks** - Can existing sections be reused or composed?
- **App Blocks** - Would a Shopify app solve this better? Support `"type": "@app"`
- **Shopify APIs** - Cart API, Section Rendering, Predictive Search, Recommendations, etc.

#### Step 2: Check Existing Horizon Implementation
- **Search blocks/** - Is there a similar block pattern already implemented?
- **Check snippets/** - Utility snippets like `spacing-style`, `icon-or-image`, `section`, etc.
- **Review sections/** - Look at section composition patterns
- **Inspect assets/** - JavaScript utilities, web components, morph system

#### Step 3: Compose Before Creating
**Prefer combinations over custom code:**
- Metafields + Blocks = Dynamic, merchant-editable content
- Metaobjects + Snippets = Reusable structured content rendering
- Menus + Sections = Flexible navigation with merchant control
- Existing Blocks + `{% content_for 'blocks' %}` = Nested compositions
- Utility Snippets + Settings = Consistent styling and spacing

#### Step 4: Implementation Priority
1. ✅ **Best**: Use/extend existing Shopify features + Horizon patterns
2. ✅ **Good**: Compose existing snippets/blocks with new settings
3. ⚠️ **Caution**: Create new block/snippet following Horizon patterns
4. ❌ **Avoid**: Custom JavaScript solutions when Shopify provides native APIs
5. ❌ **Never**: Hardcode data that merchants should control via admin

**Goal**: Maximize merchant control through Shopify admin and theme editor while maintaining Horizon's performance and patterns.

### Mobile-First Philosophy

**ALWAYS design and develop for mobile devices first**, then progressively enhance for larger screens:

- **CSS**: Write mobile styles as default, use `@media (min-width: 1024px)` for desktop
- **JavaScript**: Use `isMobileBreakpoint()` and `mediaQueryLarge` from `@theme/utilities`
- **Images**: Prioritize mobile-optimized sizes, use `sizes` attribute for responsive loading
- **Performance**: Mobile devices have limited resources - lazy load, defer non-critical JS
- **Touch**: Ensure minimum touch targets (44px), test gesture interactions
- **Viewport**: Design layouts that work on small screens (320px min-width)

**Example Pattern**:
```javascript
// Check breakpoint before applying desktop-only features
if (!isMobileBreakpoint()) {
  // Desktop enhancement
}

// Listen for breakpoint changes
mediaQueryLarge.addEventListener('change', handleResponsiveChange);
```

**Horizon's Responsive Utilities**:
- `isMobileBreakpoint()` - Returns true if viewport < 1024px
- `mediaQueryLarge` - MediaQueryList for `(min-width: 1024px)`
- CSS: `--spacing-scale` adjusts automatically for mobile
- Blocks: Settings like `vertical_on_mobile` for responsive layouts

### Key Structural Patterns

- **Sections** (`sections/`) are page-level containers that wrap blocks and handle layout/styling
- **Blocks** (`blocks/`) are reusable components that can contain other blocks via `@theme` type declarations
- **Snippets** (`snippets/`) are utility templates for rendering common patterns (extensively documented with `{%- doc -%}`)
- **Assets** (`assets/`) contain JavaScript (ES modules) and CSS files

### Block Naming Convention

- Blocks prefixed with `_` (e.g., `_accordion-row.liquid`) are **private/nested blocks** meant to be used inside other blocks
- Public blocks (no prefix) can be added directly to sections in the theme editor

## JavaScript Architecture

### Module System & Import Maps

All JavaScript uses **ES modules** with an import map (`snippets/scripts.liquid`) that aliases `@theme/*` to asset URLs:

```javascript
import { Component } from '@theme/component';
import { requestIdleCallback } from '@theme/utilities';
```

**Key modules:**
- `@theme/component` - Base class for web components with ref management
- `@theme/utilities` - Performance helpers, view transitions, device detection
- `@theme/morph` - DOM morphing for dynamic updates
- `@theme/section-renderer` - Shopify Section Rendering API wrapper
- `@theme/section-hydration` - Lazy hydration system for performance

### Web Components Pattern

Custom elements extend `HTMLElement` or the `Component` base class:

```javascript
class AccordionCustom extends HTMLElement {
  #controller = new AbortController();
  
  connectedCallback() {
    const { signal } = this.#controller;
    this.addEventListener('event', this.handler, { signal });
  }
  
  disconnectedCallback() {
    this.#controller.abort(); // Clean up all listeners
  }
}
```

**Always:**
- Use private fields (`#`) for internal state
- Clean up with `AbortController` in `disconnectedCallback`
- Register components in the same file they're defined

### TypeScript Definitions

The project uses JSDoc with TypeScript type checking (`assets/jsconfig.json`):
- `global.d.ts` defines Shopify/Theme globals
- Strict null checks and no implicit any are enabled
- Use JSDoc comments for type safety: `/** @type {HTMLElement} */`

## Liquid Patterns

### Schema-Based Blocks

Every block/section has a `{% schema %}` JSON definition that configures the theme editor. Blocks support:
- `"type": "@theme"` - Accept any theme block
- `"type": "@app"` - Accept Shopify app blocks
- Settings with visibility conditions: `"visible_if": "{{ section.settings.x == 'value' }}"`

### Composable Content

Blocks render nested children using:
```liquid
{% content_for 'blocks' %}
```

This pattern enables unlimited nesting (accordion → accordion-row → text, etc.)

### Documentation Comments

Use `{%- doc -%}` blocks at the top of snippets to document parameters:
```liquid
{%- doc -%}
  @param {object} section - The section object
  @param {string} children - The children HTML
{%- enddoc -%}
```

### Utility Snippets

Common patterns are extracted to snippets:
- `spacing-style` - Renders responsive padding/margin CSS variables with min scaling
- `border-override` - Applies border CSS from block settings
- `section` - Wraps content with background, overlay, and spacing
- `icon-or-image` - Renders SVG icon or uploaded image based on settings

Always use these when implementing blocks with styling options.

## CSS Architecture

### CSS-in-Liquid

Styles are embedded in Liquid files using `{% stylesheet %}` tags, scoped to the component. Critical CSS is inlined; non-critical is extracted.

### CSS Custom Properties

The theme uses CSS variables extensively:
- Color schemes: `var(--color-foreground)`, `var(--color-background)`
- Spacing: `var(--padding-sm)`, `var(--margin-xs)`
- Typography: `var(--font-{preset}--family/size/weight)`
- Responsive scaling: `calc(var(--spacing-scale) * Npx)` with `max()` for minimums

## Development Workflows

### Theme Structure

- This is a **Shopify CLI 3.x** project (look for `.shopify/` directory)
- No build step required - Shopify serves assets directly and handles optimization
- **Development command**: `shopify theme dev` - Use this for local development with hot reload
- Shopify handles asset minification, image optimization, and CDN delivery automatically

### Making Changes

1. **Sections/Blocks**: Edit `.liquid` files in respective directories
2. **JavaScript**: Edit `.js` files in `assets/` - use ES modules and `@theme/*` imports
3. **Styles**: Add `{% stylesheet %}` blocks within `.liquid` files
4. **Global changes**: Update `snippets/scripts.liquid` for import maps

### Testing in Theme Editor

- Custom elements respond to `shopify:block:select` events (see `theme-editor.js`)
- Use `{{ block.shopify_attributes }}` on block root elements for editor integration
- Test with `Shopify.designMode` flag for editor-specific behavior

## Critical Patterns to Follow (Shopify & Horizon Best Practices)

1. **Mobile-First Always**: Design for mobile (320px+) first, progressively enhance for desktop using `@media (min-width: 1024px)`
2. **Shopify Section Rendering API**: Always use `sectionRenderer.renderSection()` for dynamic content updates - leverages Shopify's native caching and performance optimizations
3. **Shopify App Blocks**: Support `"type": "@app"` in schemas to enable merchant app integrations
4. **Native Liquid Features**: Use Shopify's built-in filters and objects (`{{ product }}`, `{{ collection }}`, etc.) - they're optimized and handle edge cases
5. **Horizon's Lazy Hydration**: Use `hydrate()` for off-screen sections - Horizon's custom performance pattern
6. **Horizon's View Transitions**: Use `startViewTransition()` from utilities for SPA-like navigation - built on Web API with fallbacks
7. **Responsive Utilities**: Use `isMobileBreakpoint()` and `mediaQueryLarge` from Horizon's utility system
8. **Shopify Custom Data**: Leverage Shopify's native data features instead of hardcoding:
   - **Metafields** (`{{ product.metafields.namespace.key }}`) - Custom fields on products, collections, etc.
   - **Metaobjects** (`{{ shop.metaobjects }}`) - Structured custom content types
   - **Menus** (`{{ linklists.menu-handle }}`) - Dynamic navigation managed by merchants
   - All are theme editor compatible and merchant-manageable
9. **Accessibility**: Horizon maintains WCAG 2.1 AA standards - preserve ARIA attributes and keyboard navigation

## Common Gotchas

- Import map URLs are generated server-side - don't assume static paths in JS
- Block schemas must match Liquid output structure for theme editor compatibility
- Private blocks (`_`) won't appear in theme editor unless nested in public blocks
- Section IDs need normalization via `normalizeSectionId()` before API calls
- Always check for `Shopify.designMode` when implementing editor-specific features
- Shopify Liquid has strict output caching - avoid side effects in template logic

## Decision-Making Framework: Analyze Before Implementing

### Example 1: "Add a custom product feature showcase"

**❌ Wrong approach**: Create custom HTML/JS from scratch

**✅ Correct analysis**:
1. Check if `metafields` can store the feature data (product.metafields.custom.features)
2. Look at `blocks/product-description.liquid` for similar patterns
3. Use `snippets/icon-or-image.liquid` for feature icons
4. Compose with existing blocks using `{% content_for 'blocks' %}`
5. Result: Merchant-editable via admin, theme editor compatible, reuses Horizon patterns

### Example 2: "Create a testimonials section"

**❌ Wrong approach**: Hardcode testimonials in Liquid

**✅ Correct analysis**:
1. Create metaobject definition in Shopify admin (testimonials with name, quote, image)
2. Reference metaobjects in section: `{{ shop.metaobjects.testimonials.values }}`
3. Reuse `snippets/resource-card.liquid` or similar for rendering
4. Use `snippets/spacing-style.liquid` for consistent spacing
5. Result: Merchants manage content in admin, fully theme editor compatible

### Example 3: "Add custom navigation menu"

**❌ Wrong approach**: Hardcode menu structure

**✅ Correct analysis**:
1. Use Shopify's native menus: `{{ linklists.main-menu }}`
2. Check `snippets/header-menu.liquid` and `snippets/mega-menu.liquid` for patterns
3. Extend with metafields on menu items if needed (`link.object.metafields`)
4. Result: Merchants control navigation via admin, supports mega menus

### Example 4: "Implement product filtering"

**❌ Wrong approach**: Build custom filter JavaScript

**✅ Correct analysis**:
1. Shopify provides native collection filtering
2. Check `sections/main-collection.liquid` and `blocks/filters.liquid`
3. Use Section Rendering API via `@theme/section-renderer` for dynamic updates
4. Leverage `startViewTransition()` for smooth animations
5. Result: Native Shopify filtering + Horizon's performance optimizations

## When in Doubt: Look at Existing Horizon Code

Horizon is a **reference implementation** of Shopify's latest patterns. Before writing custom code:

1. **Search existing blocks/snippets** - Most e-commerce patterns are already solved
2. **Check utility snippets** - `spacing-style`, `border-override`, `icon-or-image`, etc. handle common needs
3. **Review similar components** - Copy patterns from existing blocks (schema structure, event handling, styling)
4. **Use Shopify's native APIs** - Section Rendering, Predictive Search, Cart API, Product Recommendations
5. **Leverage Horizon's JavaScript utilities** - Don't reinvent device detection, view transitions, or performance helpers

**Remember**: Every custom implementation should justify why Shopify/Horizon's existing solutions weren't sufficient.
