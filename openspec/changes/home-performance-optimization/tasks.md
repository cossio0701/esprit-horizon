# Tasks: Home Performance Optimization

## Overview

Six deliverables across 3 execution phases. Each task is atomic (one file, one clear change) and verifiable.

**Total Tasks**: 15 implementation + 8 verification = 23

---

## Phase 1: Trivial Deletions (parallel, zero risk)

### DEL-1: Remove Render-Blocker

- [x] **T1.1**: Delete lines 15-21 (render-blocking `<link rel="expect">`) — `layout/theme.liquid`

### DEL-5: Delete Deprecated carousel-component.js

- [x] **T1.2**: Delete file `assets/carousel-component.js` — filesystem
- [x] **T1.3**: Verify no references remain (grep check) — `blocks/video.liquid` schema

### DEL-6: Remove Empty Section

- [x] **T1.4**: Remove `17677328072562cb5a` from sections object — `templates/index.json`
- [x] **T1.5**: Remove `17677328072562cb5a` from order array — `templates/index.json`

---

## Phase 2: Template Logic (parallel, independent files)

### DEL-2: Conditional JS Loading

- [x] **T2.1**: Wrap `show-more.js` (lines 198-202) in `{% if template.name == 'collection' or template.name == 'search' %}...{% endif %}` — `snippets/scripts.liquid`
- [x] **T2.2**: Wrap `media-gallery.js` (lines 233-237) in `{% if template == 'product' %}...{% endif %}` — `snippets/scripts.liquid`
- [x] **T2.3**: Wrap `gift-card-recipient-form.js` (lines 243-247) in `{% if template == 'product' %}...{% endif %}` — `snippets/scripts.liquid`

### DEL-3: Deduplicate Font Preloads

- [x] **T2.4**: Add `emitted_font_urls` tracking variable after line 1 — `snippets/fonts.liquid`
- [x] **T2.5**: Wrap body_font preload with URL dedup logic (resolve URL, check contains, emit, append) — `snippets/fonts.liquid`
- [x] **T2.6**: Wrap subheading_font preload with URL dedup logic — `snippets/fonts.liquid`
- [x] **T2.7**: Wrap heading_font preload with URL dedup logic — `snippets/fonts.liquid`
- [x] **T2.8**: Wrap accent_font preload with URL dedup logic — `snippets/fonts.liquid`

---

## Phase 3: Video Lazy Load (multi-file, most complex)

### DEL-4: Video Preload Schema Setting

- [x] **T3.1**: Add `preload` select setting to schema (after video_loop, options: auto/metadata/none, default: auto) — `blocks/video.liquid`
- [x] **T3.2**: Add translation key `t:settings.video_preload` for preload label — (use existing translation system)

### DEL-4: Snippet Preload Param

- [x] **T3.3**: Add `preload` param to `{%- doc -%}` block (param description) — `snippets/video.liquid`
- [x] **T3.4**: Add conditional manual `<video>` construction in hosted video branch (else at line 117) — `snippets/video.liquid`
  - When `preload` is set: build manual tag with `autoplay`, `loop`, `muted`, `controls`, `preload`, `poster`, `<source>` children
  - When `preload` is nil/"auto": use existing `video_tag` filter

### DEL-4: Pass Preload to Render Calls (4 render calls in blocks/video.liquid)

- [x] **T3.5**: Add `preload: block_settings.preload` to render call at lines 27-36 (desktop uploaded video) — `blocks/video.liquid`
- [x] **T3.6**: Add `preload: block_settings.preload` to render call at lines 38-49 (desktop URL video) — `blocks/video.liquid`
- [x] **T3.7**: Add `preload: block_settings.preload` to render call at lines 55-64 (mobile uploaded video) — `blocks/video.liquid`
- [x] **T3.8**: Add `preload: block_settings.preload` to render call at lines 66-77 (mobile URL video) — `blocks/video.liquid`

### DEL-4: Apply to Home Page Video

- [x] **T3.9**: Add `"preload": "none"` to `section_tmebwi.blocks.video_NnPw9Y.settings` — `templates/index.json`

---

## Verification

### DEL-1 Verification

- [ ] **TV.1**: View home page source — no `<link rel="expect">` in `<head>`
- [ ] **TV.2**: `critical.js` script (lines 48-53) still present in theme.liquid

### DEL-2 Verification

- [ ] **TV.3**: View home page source — no `show-more.js`, `media-gallery.js`, `gift-card-recipient-form.js` script tags
- [ ] **TV.4**: View product page source — `media-gallery.js`, `gift-card-recipient-form.js` script tags present
- [ ] **TV.5**: View collection page source — `show-more.js` script tag present, `media-gallery.js` absent

### DEL-3 Verification

- [ ] **TV.6**: View home page source — count `<link rel="preload" as="font">` links ≤ 2 (was 4)

### DEL-4 Verification

- [ ] **TV.7**: View home page source — `section_tmebwi` video has `preload="none"` attribute
- [ ] **TV.8**: DevTools Network tab — no early video fetch before scroll
- [ ] **TV.9**: Scroll test — video loads and plays when scrolled into view

### DEL-5 Verification

- [ ] **TV.10**: `grep -r "carousel-component\.js" .` returns zero results (excluding openspec docs)
- [ ] **TV.11**: Carousel still works on home page product carousels

### DEL-6 Verification

- [ ] **TV.12**: `jq '.order | length' templates/index.json` returns 8 (was 9)
- [ ] **TV.13**: `jq '.sections | has("17677328072562cb5a")' templates/index.json` returns false

### Final Verification

- [ ] **TV.14**: `shopify theme check` passes with no new warnings
- [ ] **TV.15**: Lighthouse desktop performance score ≥ 80
- [ ] **TV.16**: TBT reduced by ≥ 40% (from 350ms to ≤ 210ms)

---

## Dependencies

None. All phases can run in parallel. Order within phase minimizes context switching (same file grouped together).

---

## Estimated Time

| Phase | Tasks | Est. Time |
|-------|-------|-----------|
| Phase 1 | 5 tasks | ~10 min |
| Phase 2 | 8 tasks | ~15 min |
| Phase 3 | 9 tasks | ~20 min |
| Verification | 16 tasks | ~15 min |
| **Total** | **38 tasks** | **~60 min** |

---

## Notes

- Use `jq` for JSON edits in `templates/index.json` — safer than string replacement
- Preserve `{% # theme-check-disable %}` / `{% # theme-check-enable %}` comments in `fonts.liquid`
- Keep `critical.js` script block (lines 48-53) untouched — it's a different `blocking="render"` element
- `product-form.js`, `variant-picker.js`, `product-inventory.js` must remain unconditional (quick-add dependency)