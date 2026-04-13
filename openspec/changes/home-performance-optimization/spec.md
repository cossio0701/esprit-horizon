# Specs: Home Performance Optimization

## DEL-1: Remove Render-Blocker

### Requirements

The system MUST NOT emit `<link rel="expect" blocking="render">` in `layout/theme.liquid`. View transitions are disabled; this element adds ~1.7s FCP penalty with no benefit.

#### Scenario: Home page HTML has no render-blocking expect link

- GIVEN `layout/theme.liquid` is rendered
- WHEN the `<head>` is output
- THEN no `<link rel="expect">` element exists
- AND no element with `blocking="render"` attribute exists in `<head>`

#### Scenario: View transitions setting does not affect removal

- GIVEN `settings.page_transition_enabled` is true or false
- WHEN `theme.liquid` renders
- THEN the `<link rel="expect" href="#MainContent" blocking="render">` is absent regardless

### Edge Cases

- The `<script blocking="render">` for `critical.js` on line 48-53 is a DIFFERENT element and MUST remain untouched.
- If view transitions are later enabled, the `view-transitions.js` script (already conditionally loaded in `scripts.liquid` line 36-44) handles that independently.

---

## DEL-2: Conditional JS Loading

### Requirements

The system MUST conditionally load JS scripts based on the current template, skipping scripts that register custom elements unused on that template.

**Categorization of scripts in `snippets/scripts.liquid` (lines 121-247):**

| Script | Custom Elements | Required Templates | Conditional |
|--------|----------------|-------------------|-------------|
| `media-gallery.js` | `media-gallery` | `product` | ✅ `{% if template == 'product' %}` |
| `gift-card-recipient-form.js` | `gift-card-recipient-form` | `product` | ✅ `{% if template == 'product' %}` |
| `show-more.js` | `show-more-component` | `collection`, `search` | ✅ `{% if template.name == 'collection' or template.name == 'search' %}` |
| `product-form.js` | `add-to-cart-component`, `product-form-component`, `fly-to-cart` | `product` + quick-add pages | ⚠️ See Edge Cases |
| `variant-picker.js` | `variant-picker` | `product` + quick-add pages | ⚠️ See Edge Cases |
| All other scripts | Various | All pages | ❌ Keep unconditional |

#### Scenario: Home page skips media-gallery and gift-card scripts

- GIVEN template is `index`
- WHEN `scripts.liquid` renders
- THEN `<script>` tags for `media-gallery.js` and `gift-card-recipient-form.js` are NOT emitted
- AND `show-more.js` script tag is NOT emitted

#### Scenario: Product page loads all product scripts

- GIVEN template is `product`
- WHEN `scripts.liquid` renders
- THEN `media-gallery.js`, `gift-card-recipient-form.js`, `product-form.js`, and `variant-picker.js` script tags ARE emitted

#### Scenario: Collection page loads show-more but skips media-gallery

- GIVEN template is `collection`
- WHEN `scripts.liquid` renders
- THEN `show-more.js` script tag IS emitted
- AND `media-gallery.js` and `gift-card-recipient-form.js` script tags are NOT emitted

#### Scenario: Quick-add works on home page after conditional loading

- GIVEN template is `index` and `settings.quick_add` is enabled
- WHEN user clicks quick-add button on a product card
- THEN quick-add modal fetches and renders product form correctly
- AND add-to-cart functionality works

### Edge Cases

**CRITICAL — `product-form.js` and `variant-picker.js` are needed for quick-add on ALL pages.** The quick-add modal (rendered in `theme.liquid` line 70-72) fetches product sections via Section Rendering API and inserts `<product-form-component>` and `<variant-picker>` HTML via `morph()`. These custom elements MUST be registered before morph runs.

- **Recommended approach**: Wrap `product-form.js` and `variant-picker.js` in `{% if template == 'product' or settings.quick_add or settings.mobile_quick_add %}` — this skips them only when quick-add is disabled AND template is not product.
- `product-inventory.js` is referenced in quick-add-modal CSS for styling `<product-inventory>` elements. If product-inventory appears in quick-add content, it MUST also follow the quick-add conditional.
- The import map (lines 6-34) and modulepreload hints MUST remain unconditional — they are URL maps, not executed code.
- `cart-discount.js` is already conditionally loaded (line 131-137). No change needed.
- `product-card.js`, `product-price.js`, `product-title-truncation.js` are needed on home for product carousels — MUST remain unconditional.

---

## DEL-3: Deduplicate Font Preloads

### Requirements

The system MUST emit at most one `<link rel="preload">` per unique font URL in `snippets/fonts.liquid`. Currently, `type_body_font` and `type_subheading_font` both resolve to `sans_serif_n4` (same URL), and `type_heading_font` and `type_accent_font` both resolve to `sans_serif_n7` (same URL) — producing 4 preload links for 2 actual font files.

#### Scenario: Identical font URLs emit a single preload

- GIVEN `settings.type_body_font` and `settings.type_subheading_font` resolve to the same `font_url`
- WHEN `fonts.liquid` renders
- THEN only one `<link rel="preload">` is emitted for that URL

#### Scenario: Distinct font URLs each get a preload

- GIVEN `settings.type_heading_font` and `settings.type_body_font` resolve to different URLs
- WHEN `fonts.liquid` renders
- THEN two distinct `<link rel="preload">` elements are emitted

#### Scenario: All four fonts are unique

- GIVEN all four font settings resolve to different URLs
- WHEN `fonts.liquid` renders
- THEN four `<link rel="preload">` elements are emitted (no deduplication needed)

#### Scenario: System fonts are still skipped

- GIVEN `settings.type_body_font.system?` is true
- WHEN `fonts.liquid` renders
- THEN no preload is emitted for the body font
- AND other non-system fonts are still preloaded (deduplicated)

### Edge Cases

- Use Liquid `assign` to track emitted URLs. Compare resolved `font_url` strings, not setting names — this is generic and handles any font configuration.
- The `theme-check-disable` / `theme-check-enable` comments (lines 1, 42) MUST be preserved.

---

## DEL-4: Lazy-Load Below-Fold Video

### Requirements

For autoplay MP4 videos rendered below the fold, the system MUST set `preload="none"` on the `<video>` element to prevent unnecessary byte downloads during initial page load.

The `<video>` tag is generated via Liquid's `video_tag` filter (line 118 of `snippets/video.liquid`): `{{ video | video_tag: image_size: '2500x', autoplay: true, loop: video_loop, muted: true, controls: controls }}`. This filter does NOT support a `preload` parameter.

The `blocks/video.liquid` block MUST accept a `preload` parameter and pass it to the `snippets/video.liquid` snippet. The snippet MUST manually construct the `<video>` tag when `preload` is specified, instead of using the `video_tag` filter.

#### Scenario: Below-fold autoplay video uses preload=none

- GIVEN a video block with `video_autoplay: true` and `preload: 'none'` is rendered
- WHEN the video snippet outputs the `<video>` tag
- THEN the tag includes `preload="none"` attribute
- AND `autoplay`, `loop`, `muted` attributes are preserved

#### Scenario: Above-fold video uses default preload

- GIVEN a video block WITHOUT `preload` parameter
- WHEN the video snippet outputs the `<video>` tag
- THEN the `video_tag` filter is used (default behavior, no preload override)
- AND `preload="metadata"` is the browser default

#### Scenario: Autoplay video plays when scrolled into view

- GIVEN a below-fold video with `preload="none"` and `autoplay`
- WHEN the user scrolls the video into the viewport
- THEN the video begins loading and playing automatically
- AND no user interaction is required to start playback

#### Scenario: Mobile variant video also respects preload

- GIVEN a video block with `use_mobile_video: true` and `preload: 'none'`
- WHEN viewed on mobile
- THEN the mobile `<video>` tag also has `preload="none"`

### Edge Cases

- Shopify's `video_tag` filter does NOT support `preload` parameter. When `preload` is specified, the snippet MUST manually build the `<video>` tag with `src`, `autoplay`, `loop`, `muted`, `controls`, `preload` attributes and `<source>` children, bypassing the filter.
- YouTube/Vimeo iframe videos are NOT affected — `preload="none"` only applies to hosted MP4 `<video>` elements.
- The home page video section (`section_tmebwi` in `templates/index.json`, position 7 in order) is below the fold and has `video_autoplay: true`. Pass `preload: 'none'` from the block level.
- `video-background.js` handles background videos separately — verify it doesn't conflict with `preload="none"`.

---

## DEL-5: Delete Deprecated carousel-component.js

### Requirements

The file `assets/carousel-component.js` (16,428 bytes) MUST be deleted. It registers the same `carousel-component` custom element as `assets/carousel.js`, which is the current version. No Liquid file references `carousel-component.js` — all imports use `@theme/carousel` → `carousel.js`.

#### Scenario: No references to carousel-component.js exist

- GIVEN the codebase after deletion
- WHEN searching all `.liquid` and `.js` files for `carousel-component.js`
- THEN zero references are found

#### Scenario: Carousel still works after deletion

- GIVEN `carousel-component.js` is deleted
- WHEN any page with `<carousel-component>` elements loads
- THEN `carousel.js` registers the custom element
- AND all carousel functionality works correctly

### Edge Cases

- `carousel.js` and `carousel-component.js` both call `customElements.define('carousel-component', ...)`. Since `carousel-component.js` is never loaded (not in import map, not in any `<script>` tag), deletion has zero runtime impact.
- Verify with `grep -r "carousel-component\.js" .` after deletion to confirm no references.

---

## DEL-6: Remove Empty Section

### Requirements

The section `17677328072562cb5a` in `templates/index.json` MUST be removed from both the `sections` object and the `order` array. This section has type `_blocks`, zero blocks, no name, and renders empty DOM — adding unnecessary weight.

#### Scenario: Empty section removed from index template

- GIVEN `templates/index.json` is loaded
- WHEN the JSON is parsed
- THEN `sections["17677328072562cb5a"]` does not exist
- AND `"17677328072562cb5a"` is not in the `order` array
- AND the order array has 8 entries (was 9)

#### Scenario: Home page renders without the empty section

- GIVEN the home page is rendered after removal
- WHEN inspecting the DOM
- THEN no empty section wrapper for `17677328072562cb5a` exists
- AND all other sections render normally

### Edge Cases

- Use `jq` for the edit: `jq 'del(.sections["17677328072562cb5a"]) | .order -= ["17677328072562cb5a"]' templates/index.json`
- Preserve the auto-generated comment header (lines 1-9) — do not modify it.
- If the Shopify theme editor re-adds an empty section in the future, this is acceptable — the optimization is for the current template state.
