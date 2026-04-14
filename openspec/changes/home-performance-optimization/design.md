# Design: Home Performance Optimization

## Architecture Overview

Six independent deliverables targeting FCP (render-blocker removal), TBT (conditional JS, dead code deletion), and bandwidth (font dedup, video lazy load, empty section removal).

**Execution**: DEL-1, DEL-5, DEL-6 are trivial (delete-only). DEL-2 and DEL-3 are independent edits in separate files. DEL-4 is the most complex (multi-file: block schema + snippet logic + template JSON). All six can be implemented in parallel; no cross-DEL dependencies exist.

```
theme.liquid ──── DEL-1 (delete lines 15-21)
scripts.liquid ── DEL-2 (wrap 3 scripts in conditionals)
fonts.liquid ───── DEL-3 (add dedup tracking)
video.liquid ───── DEL-4 (manual <video> when preload set)
blocks/video.liquid ── DEL-4 (add preload setting + pass through)
templates/index.json ── DEL-4 (set preload='none') + DEL-6 (remove empty section)
assets/carousel-component.js ── DEL-5 (delete file)
```

## Architecture Decisions

### Decision: Video preload — schema setting vs automatic detection

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Schema `preload` setting in video block | Merchant controls per-instance; explicit | **Chosen** |
| Auto-detect below-fold via section position | Fragile, no Liquid access to position | Rejected |
| Always `preload="none"` for autoplay videos | Above-fold autoplay would suffer delayed start | Rejected |

**Rationale**: A schema setting gives merchants control and is the only robust approach — Liquid has no way to know if a section is above or below the fold. Default `"auto"` preserves existing behavior.

### Decision: Font dedup — Liquid string tracking

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `assign` with pipe-delimited URL string | Simple, works in Liquid | **Chosen** |
| Hash/array approach | Not available in Liquid | N/A |
| Hardcode known duplicates | Breaks if theme editor changes fonts | Rejected |

**Rationale**: Liquid's `contains` filter works on strings, making pipe-delimited tracking the simplest approach that handles all font configurations generically.

### Decision: Conditional JS scope

Per specs, only 3 scripts are safe to conditionalize. `product-form.js` and `variant-picker.js` stay unconditional (quick-add dependency).

| Script | Conditional | Reason |
|--------|------------|--------|
| `media-gallery.js` | `{% if template == 'product' %}` | Only product pages use media gallery |
| `gift-card-recipient-form.js` | `{% if template == 'product' %}` | Only product pages have gift cards |
| `show-more.js` | `{% if template.name == 'collection' or template.name == 'search' %}` | Only collection/search use show-more |

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `layout/theme.liquid` | Modify | Delete lines 15-21 (render-blocking `<link rel="expect">`) |
| `snippets/scripts.liquid` | Modify | Wrap 3 script tags in template conditionals |
| `snippets/fonts.liquid` | Modify | Add URL dedup logic with `assign` tracking |
| `snippets/video.liquid` | Modify | Accept `preload` param; build manual `<video>` when set |
| `blocks/video.liquid` | Modify | Add `preload` schema setting; pass to snippet |
| `templates/index.json` | Modify | Set `preload: 'none'` on section_tmebwi video; remove empty section |
| `assets/carousel-component.js` | Delete | 16KB dead code, superseded by `carousel.js` |

## DEL-1: Remove Render-Blocker

### Current State (theme.liquid lines 15-21)

```html
    {% comment %} This a way to wait... {% endcomment %}
    <link
      rel="expect"
      href="#MainContent"
      blocking="render"
      id="view-transition-render-blocker"
    >
```

### Target State

Delete lines 15-21 entirely. The `critical.js` script block (lines 48-53) MUST remain — it is a different `blocking="render"` element.

### Steps

1. Delete lines 15-21 of `layout/theme.liquid`

## DEL-2: Conditional JS Loading

### Current State (scripts.liquid)

Lines 193-247 have 3 scripts loaded unconditionally:

- `show-more.js` (lines 198-202)
- `media-gallery.js` (lines 233-237)
- `gift-card-recipient-form.js` (lines 243-247)

### Target State

Wrap each in a template conditional:

```liquid
{# After line 192 (product-inventory.js), replace show-more.js #}
{% if template.name == 'collection' or template.name == 'search' %}
<script
  src="{{ 'show-more.js' | asset_url }}"
  type="module"
  fetchpriority="low"
></script>
{% endif %}

{# After line 232 (anchored-popover.js or floating-panel.js... actually after media.js at 182), replace media-gallery.js #}
{% if template == 'product' %}
<script
  src="{{ 'media-gallery.js' | asset_url }}"
  type="module"
  fetchpriority="low"
></script>
{% endif %}

{# Replace gift-card-recipient-form.js #}
{% if template == 'product' %}
<script
  src="{{ 'gift-card-recipient-form.js' | asset_url }}"
  type="module"
  fetchpriority="low"
></script>
{% endif %}
```

**Important**: `product-form.js` (lines 163-167), `variant-picker.js` (lines 143-147), and `product-inventory.js` (lines 193-197) MUST remain unconditional — quick-add modal on home page needs them registered before morph runs.

### Steps

1. Wrap `show-more.js` (line 198-202) in `{% if template.name == 'collection' or template.name == 'search' %}...{% endif %}`
2. Wrap `media-gallery.js` (line 233-237) in `{% if template == 'product' %}...{% endif %}`
3. Wrap `gift-card-recipient-form.js` (line 243-247) in `{% if template == 'product' %}...{% endif %}`

## DEL-3: Deduplicate Font Preloads

### Current State (fonts.liquid)

4 sequential `{% unless system? %}` blocks emitting identical URLs when font settings resolve to same font file.

### Target State

Add a tracking variable `emitted_font_urls` and check before each emit:

```liquid
{% # theme-check-disable %}
{%- assign emitted_font_urls = '' -%}

{%- unless settings.type_body_font.system? -%}
  {%- assign body_url = settings.type_body_font | font_url -%}
  {%- unless emitted_font_urls contains body_url -%}
  <link rel="preload" as="font" href="{{ body_url }}" type="font/woff2" crossorigin fetchpriority="low">
  {%- assign emitted_font_urls = emitted_font_urls | append: body_url | append: '|' -%}
  {%- endunless -%}
{%- endunless -%}

{%- unless settings.type_subheading_font.system? -%}
  {%- assign subheading_url = settings.type_subheading_font | font_url -%}
  {%- unless emitted_font_urls contains subheading_url -%}
  <link rel="preload" as="font" href="{{ subheading_url }}" type="font/woff2" crossorigin fetchpriority="low">
  {%- assign emitted_font_urls = emitted_font_urls | append: subheading_url | append: '|' -%}
  {%- endunless -%}
{%- endunless -%}

{%- unless settings.type_heading_font.system? -%}
  {%- assign heading_url = settings.type_heading_font | font_url -%}
  {%- unless emitted_font_urls contains heading_url -%}
  <link rel="preload" as="font" href="{{ heading_url }}" type="font/woff2" crossorigin fetchpriority="low">
  {%- assign emitted_font_urls = emitted_font_urls | append: heading_url | append: '|' -%}
  {%- endunless -%}
{%- endunless -%}

{%- unless settings.type_accent_font.system? -%}
  {%- assign accent_url = settings.type_accent_font | font_url -%}
  {%- unless emitted_font_urls contains accent_url -%}
  <link rel="preload" as="font" href="{{ accent_url }}" type="font/woff2" crossorigin fetchpriority="low">
  {%- assign emitted_font_urls = emitted_font_urls | append: accent_url | append: '|' -%}
  {%- endunless -%}
{%- endunless -%}
{% # theme-check-enable %}
```

### Steps

1. Add `{%- assign emitted_font_urls = '' -%}` after line 1
2. For each of the 4 font blocks: resolve URL to a variable, check `contains` against tracker, emit only if new, append URL to tracker

## DEL-4: Lazy-Load Below-Fold Video

### Current State

- `snippets/video.liquid` line 118: `{{ video | video_tag: image_size: '2500x', autoplay: true, loop: video_loop, muted: true, controls: controls }}`
- `video_tag` filter does NOT support `preload` parameter
- `blocks/video.liquid` has no `preload` schema setting
- `section_tmebwi` in `index.json` (position 7) is below-fold autoplay MP4

### Target State

**`snippets/video.liquid`** — Add `preload` to docstring params. In the hosted video branch (line 117 `else`), replace `video_tag` with conditional manual construction:

```liquid
{% else %}
  {% if preload %}
    <video
      autoplay
      {% if video_loop %}loop{% endif %}
      muted
      {% if controls %}controls{% endif %}
      preload="{{ preload }}"
      {% if video.preview_image %}poster="{{ video.preview_image | image_url: width: 2500 }}"{% endif %}
    >
      {%- for source in video.sources -%}
        <source src="{{ source.url }}" type="{{ source.mime_type }}">
      {%- endfor -%}
    </video>
  {% else %}
    {{ video | video_tag: image_size: '2500x', autoplay: true, loop: video_loop, muted: true, controls: controls }}
  {% endif %}
{% endif %}
```

**`blocks/video.liquid`** — Add `preload` setting to schema and pass it through to all 4 `{% render 'video' %}` calls:

Schema addition (after `video_loop` setting):
```json
{
  "type": "select",
  "id": "preload",
  "label": "t:settings.video_preload",
  "options": [
    { "value": "auto", "label": "Auto" },
    { "value": "metadata", "label": "Metadata" },
    { "value": "none", "label": "None (lazy)" }
  ],
  "default": "auto",
  "info": "Use 'None' for below-fold autoplay videos"
}
```

Add `preload: block_settings.preload` to each `render 'video'` call in `blocks/video.liquid` (lines 27-36, 38-49, 55-64, 66-77). Only pass when value is not `"auto"`:

```liquid
{% render 'video',
  video: block_settings.video,
  ...
  preload: block_settings.preload
%}
```

In the snippet, treat `nil`/`"auto"` as "use default video_tag" and only manual-build when preload is `"none"` or `"metadata"`.

**`templates/index.json`** — Add `"preload": "none"` to `section_tmebwi > blocks > video_NnPw9Y > settings`.

### Steps

1. Add `preload` param to `snippets/video.liquid` docstring
2. Add conditional manual `<video>` construction in the hosted video branch
3. Add `preload` schema setting to `blocks/video.liquid`
4. Pass `preload` through in all 4 render calls
5. Set `"preload": "none"` in `templates/index.json` for the section_tmebwi video block

## DEL-5: Delete Deprecated carousel-component.js

### Steps

1. `rm assets/carousel-component.js`
2. Verify: `grep -r "carousel-component\.js" --include="*.liquid" --include="*.js" .` returns zero results (excluding openspec docs)

## DEL-6: Remove Empty Section

### Steps

Use `jq` to surgically edit `templates/index.json`:

```bash
jq 'del(.sections["17677328072562cb5a"]) | .order -= ["17677328072562cb5a"]' templates/index.json > /tmp/index.json && mv /tmp/index.json templates/index.json
```

This removes the empty `_blocks` section with no blocks/name and its entry from the order array (9 entries → 8).

## Execution Order

| Phase | DELs | Rationale |
|-------|------|-----------|
| Phase 1 (parallel) | DEL-1, DEL-5, DEL-6 | Trivial deletions, zero risk |
| Phase 2 (parallel) | DEL-2, DEL-3 | Independent files, template logic |
| Phase 3 | DEL-4 | Multi-file, most complex |

All phases can run in parallel if preferred — no actual dependencies exist.

## Testing Plan

| DEL | Verification | Method |
|-----|-------------|--------|
| DEL-1 | No `<link rel="expect">` in page source | View source of home page |
| DEL-2 | Home page source lacks media-gallery/gift-card/show-more scripts; product page has them; collection has show-more | View source on each template |
| DEL-3 | Home page has ≤2 font preload links (was 4) | View source, count `<link rel="preload" as="font">` |
| DEL-4 | section_tmebwi `<video>` has `preload="none"`; video plays when scrolled into view | DevTools Network tab (no early video fetch) + scroll test |
| DEL-5 | File absent, no grep references | `grep -r "carousel-component\.js" .` |
| DEL-6 | Home page has 8 sections in DOM | Inspect DOM / `jq '.order \| length' templates/index.json` |
| All | `shopify theme check` passes | CLI |
| All | Lighthouse desktop ≥ 80 | Chrome DevTools Lighthouse |
