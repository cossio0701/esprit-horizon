# Proposal: Home Page Performance Optimization

## Intent

The home page scores **56 on Lighthouse desktop** with FCP 1.7s, LCP 2.8s, TBT 350ms. The main culprits are: a render-blocking `<link rel="expect">` for disabled view transitions, ~200KB of unused JS loaded unconditionally, duplicate font preloads, a deprecated carousel JS file, and an empty section adding DOM weight. This change targets quick, high-impact fixes to bring the score above 80.

## Scope

### In Scope
- Remove `<link rel="expect" blocking="render">` from `theme.liquid` (view transitions are OFF)
- Add template-based conditional loading in `scripts.liquid` — skip product-only, collection-only, and cart-only scripts on `index`
- Deduplicate font preloads in `fonts.liquid` (body=subheading=`sans_serif_n4`, heading=accent=`sans_serif_n7` — 4 links, 2 unique fonts)
- Add lazy loading strategy for autoplay MP4 videos below the fold
- Delete deprecated `assets/carousel-component.js` (16KB, superseded by `carousel.js`)
- Remove empty section `17677328072562cb5a` from `templates/index.json`

### Out of Scope
- Splitting `base.css` (103KB, too complex for this iteration)
- Reducing carousel product count (user wants 16)
- Changing font families (user confirmed Helvetica)
- Commonst app optimization (separate repo, developer will coordinate separately)

## Capabilities

### New Capabilities
- `conditional-script-loading`: Template-aware JS loading in `scripts.liquid` — scripts load only when the current template requires them

### Modified Capabilities
- `video-block`: Add `preload="none"` + lazy load for below-fold autoplay MP4 videos
- `font-preloading`: Deduplicate preload links when multiple font settings resolve to the same font file

## Approach

Ordered by estimated impact:

1. **Remove render-blocker** (highest FCP impact) — Delete the `<link rel="expect" href="#MainContent" blocking="render">` from `theme.liquid` lines 16-21
2. **Conditional JS loading** (highest TBT impact) — Wrap product-page-only scripts (`product-form.js`, `variant-picker.js`, `media-gallery.js`, `gift-card-recipient-form.js`) in `{% if template == 'product' %}`; wrap collection scripts (`show-more.js`) in `{% if template.name == 'collection' %}`; move non-home scripts to conditional blocks
3. **Deduplicate font preloads** — Track which font URLs have been emitted and skip duplicates in `fonts.liquid`
4. **Lazy-load below-fold video** — Add `preload="none"` to the video section (section 8, below fold) and consider Intersection Observer or native `loading="lazy"` for the video tag
5. **Delete `carousel-component.js`** — Remove deprecated file; verify no remaining references
6. **Remove empty section** — Remove `17677328072562cb5a` from `templates/index.json` order and sections

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `layout/theme.liquid` | Modified | Remove render-blocking `<link rel="expect">` |
| `snippets/scripts.liquid` | Modified | Add template conditionals for JS loading |
| `snippets/fonts.liquid` | Modified | Deduplicate font preloads |
| `snippets/video.liquid` | Modified | Add preload="none" / lazy strategy for autoplay |
| `blocks/video.liquid` | Modified | Pass loading attribute through to snippet |
| `templates/index.json` | Modified | Remove empty section `17677328072562cb5a` |
| `assets/carousel-component.js` | Removed | Deprecated, superseded by `carousel.js` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Missing template conditional breaks a page type | Medium | Test each template type (`index`, `product`, `collection`, `cart`, `page`, `search`) after changes |
| Carousel breaks if `carousel-component.js` is referenced elsewhere | Low | Grep confirms only `carousel.js` registers the custom element; old file is 16KB dead code |
| Font dedup breaks if theme editor changes font settings | Low | Logic is generic — compares resolved URLs, not setting names |
| Video lazy loading delays autoplay on slow connections | Low | Only applies to below-fold video; above-fold content unaffected |
| Empty section removal conflicts with theme editor | Low | Section has no blocks and no content; safe to remove |

## Rollback Plan

All changes are in Liquid/JSON/JS files — revert via git. No database or settings changes. The empty section can be re-added to `index.json` if needed.

## Dependencies

- Commonst app optimization is **coordinated separately** — this change does not modify the app, but developer should async/defer its scripts for maximum TBT improvement

## Success Criteria

- [ ] Lighthouse desktop performance score >= 80
- [ ] TBT reduced by >= 40% (from 350ms to <= 210ms)
- [ ] FCP improved by >= 15% (from 1.7s to <= 1.45s)
- [ ] No render-blocking `<link rel="expect">` in `<head>`
- [ ] `carousel-component.js` removed from assets
- [ ] Empty section removed from home template
- [ ] All template types load and function correctly after changes
- [ ] `shopify theme check` passes with no new warnings
