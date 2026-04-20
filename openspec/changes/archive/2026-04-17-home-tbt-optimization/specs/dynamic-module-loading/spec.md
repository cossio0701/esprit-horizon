# Dynamic Module Loading Specification

## Purpose

Loads heavy JavaScript modules on-demand when triggered by user interaction, rather than preloading them on every page.

## Requirements

### Requirement: Quick-Add On-Demand Loading

The system MUST load `product-form.js` and `variant-picker.js` dynamically when a quick-add interaction is triggered on a page where those scripts are not already loaded (e.g., home, collection). The system MUST NOT preload these scripts on templates that don't require them.

#### Scenario: Quick-add triggers dynamic import from home page

- GIVEN the current template is `index` (product-form.js and variant-picker.js are NOT loaded)
- AND product cards with quick-add buttons are present
- WHEN the user clicks a quick-add button
- THEN product-form.js and variant-picker.js are dynamically imported
- AND the quick-add modal renders correctly with full product form functionality

#### Scenario: Quick-add on product page uses existing scripts

- GIVEN the current template is `product` (product-form.js and variant-picker.js ARE already loaded)
- WHEN the user clicks a quick-add button
- THEN no additional dynamic import occurs
- AND the quick-add modal uses the already-loaded modules

### Requirement: Loading State During Dynamic Import

The system SHOULD display a loading indicator while dynamically importing quick-add scripts, preventing the user from perceiving a frozen state.

#### Scenario: Loading indicator shown during import

- GIVEN the user clicks quick-add on a page without preloaded scripts
- WHEN the dynamic import begins
- THEN a loading spinner or skeleton is shown
- AND the indicator is removed once the modal content renders

### Requirement: Color Siblings Script Scope

The system MUST load `color-siblings.js` on templates that display product cards: `index`, `collection`, `search`, and `product`.

#### Scenario: Home page includes color-siblings

- GIVEN the current template is `index`
- WHEN the page renders scripts
- THEN color-siblings.js is included in the output

#### Scenario: Cart page excludes color-siblings

- GIVEN the current template is `cart`
- WHEN the page renders scripts
- THEN color-siblings.js is NOT included
