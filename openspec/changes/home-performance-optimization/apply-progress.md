# Apply Progress: Home Performance Optimization

**Status**: All 15 implementation tasks complete ✅
**Mode**: Standard (no TDD)

## Completed Tasks

### Phase 1: Trivial Deletions
- [x] T1.1: Deleted render-blocking `<link rel="expect">` from `layout/theme.liquid` (lines 15-21)
- [x] T1.2: Deleted `assets/carousel-component.js`
- [x] T1.3: Verified zero references to `carousel-component.js` remain
- [x] T1.4: Removed `17677328072562cb5a` from sections object in `templates/index.json`
- [x] T1.5: Removed `17677328072562cb5a` from order array (9 → 8 entries)

### Phase 2: Template Logic
- [x] T2.1: Wrapped `show-more.js` in `{% if template.name == 'collection' or template.name == 'search' %}`
- [x] T2.2: Wrapped `media-gallery.js` in `{% if template == 'product' %}`
- [x] T2.3: Wrapped `gift-card-recipient-form.js` in `{% if template == 'product' %}`
- [x] T2.4: Added `emitted_font_urls` tracking variable
- [x] T2.5-T2.8: All 4 font blocks wrapped with URL dedup logic

### Phase 3: Video Lazy Load
- [x] T3.1: Added `preload` select setting to `blocks/video.liquid` schema
- [x] T3.2: Added `video_preload` translation key to `en.default.schema.json` and `es.schema.json`
- [x] T3.3: Added `preload` param to `snippets/video.liquid` docstring
- [x] T3.4: Added conditional manual `<video>` construction in hosted video branch
- [x] T3.5-T3.8: Added `preload: block_settings.preload` to all 4 render calls
- [x] T3.9: Added `"preload": "none"` to section_tmebwi video block in `templates/index.json`

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `layout/theme.liquid` | Modified | Removed render-blocking `<link rel="expect">` (7 lines deleted) |
| `snippets/scripts.liquid` | Modified | Wrapped 3 scripts in template conditionals |
| `snippets/fonts.liquid` | Modified | Rewrote with URL dedup tracking variable |
| `snippets/video.liquid` | Modified | Added preload param + manual video tag construction |
| `blocks/video.liquid` | Modified | Added preload schema setting + preload param to 4 render calls |
| `templates/index.json` | Modified | Removed empty section + added preload:"none" to video |
| `assets/carousel-component.js` | Deleted | 16KB deprecated file removed |
| `locales/en.default.schema.json` | Modified | Added video_preload translation |
| `locales/es.schema.json` | Modified | Added video_preload translation |

## Deviations from Design
None — implementation matches design exactly.

## Issues Found
None.
