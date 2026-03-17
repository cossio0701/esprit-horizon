import { sectionRenderer } from '@theme/section-renderer';
import { Component } from '@theme/component';
import { FilterUpdateEvent, ThemeEvents } from '@theme/events';
import { debounce, formatMoney, startViewTransition } from '@theme/utilities';

/**
 * Search query parameter.
 * @type {string}
 */
const SEARCH_QUERY = 'q';

/**
 * Handles the main facets form functionality
 *
 * @typedef {Object} FacetsFormRefs
 * @property {HTMLFormElement} facetsForm - The main facets form element
 * @property {HTMLElement | undefined} facetStatus - The facet status element
 *
 * @extends {Component<FacetsFormRefs>}
 */
class FacetsFormComponent extends Component {
  requiredRefs = ['facetsForm'];

  /**
   * Creates URL parameters from form data
   * @param {FormData} [formData] - Optional form data to use instead of the main form
   * @returns {URLSearchParams} The processed URL parameters
   */
  createURLParameters(formData = new FormData(this.refs.facetsForm)) {
    let newParameters = new URLSearchParams(/** @type any */ (formData));

    if (newParameters.get('filter.v.price.gte') === '') newParameters.delete('filter.v.price.gte');
    if (newParameters.get('filter.v.price.lte') === '') newParameters.delete('filter.v.price.lte');

    newParameters.delete('page');

    const searchQuery = this.#getSearchQuery();
    if (searchQuery) newParameters.set(SEARCH_QUERY, searchQuery);

    return newParameters;
  }

  /**
   * Gets the search query parameter from the current URL
   * @returns {string} The search query
   */
  #getSearchQuery() {
    const url = new URL(window.location.href);
    return url.searchParams.get(SEARCH_QUERY) ?? '';
  }

  get sectionId() {
    const id = this.getAttribute('section-id');
    if (!id) throw new Error('Section ID is required');
    return id;
  }

  /**
   * Updates the URL hash with current filter parameters
   */
  #updateURLHash() {
    const url = new URL(window.location.href);
    const urlParameters = this.createURLParameters();

    url.search = '';
    for (const [param, value] of urlParameters.entries()) {
      url.searchParams.append(param, value);
    }

    history.pushState({ urlParameters: urlParameters.toString() }, '', url.toString());
  }

  /**
   * Updates filters and renders the section
   */
  updateFilters = () => {
    this.#updateURLHash();
    this.dispatchEvent(new FilterUpdateEvent(this.createURLParameters()));
    this.#updateSection();
  };

  /**
   * Updates the section
   */
  #updateSection() {
    const viewTransition = !this.closest('dialog');

    if (viewTransition) {
      startViewTransition(() => sectionRenderer.renderSection(this.sectionId), ['product-grid']);
    } else {
      sectionRenderer.renderSection(this.sectionId);
    }
  }

  /**
   * Updates filters based on a provided URL
   * @param {string} url - The URL to update filters with
   */
  updateFiltersByURL(url) {
    history.pushState('', '', url);
    this.dispatchEvent(new FilterUpdateEvent(this.createURLParameters()));
    this.#updateSection();
  }
}

if (!customElements.get('facets-form-component')) {
  customElements.define('facets-form-component', FacetsFormComponent);
}

/**
 * @typedef {Object} FacetInputsRefs
 * @property {HTMLInputElement[]} facetInputs - The facet input elements
 */

/**
 * Handles individual facet input functionality
 * @extends {Component<FacetInputsRefs>}
 */
class FacetInputsComponent extends Component {
  get sectionId() {
    const id = this.closest('.shopify-section')?.id;
    if (!id) throw new Error('FacetInputs component must be a child of a section');
    return id;
  }

  /**
   * Updates filters and the selected facet summary
   */
  updateFilters() {
    const facetsForm = this.closest('facets-form-component');

    if (!(facetsForm instanceof FacetsFormComponent)) return;

    facetsForm.updateFilters();
    this.#updateSelectedFacetSummary();
  }

  /**
   * Handles keydown events for the facets form
   * @param {KeyboardEvent} event - The keydown event
   */
  handleKeyDown(event) {
    if (!(event.target instanceof HTMLElement)) return;
    const closestInput = event.target.querySelector('input');

    if (!(closestInput instanceof HTMLInputElement)) return;

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      closestInput.checked = !closestInput.checked;
      this.updateFilters();
    }
  }

  /**
   * Handles mouseover events on facet labels
   * @param {MouseEvent} event - The mouseover event
   */
  prefetchPage = debounce((event) => {
    if (!(event.target instanceof HTMLElement)) return;

    const form = this.closest('form');
    if (!form) return;

    const formData = new FormData(form);
    const inputElement = event.target.querySelector('input');

    if (!(inputElement instanceof HTMLInputElement)) return;

    if (!inputElement.checked) formData.append(inputElement.name, inputElement.value);

    const facetsForm = this.closest('facets-form-component');
    if (!(facetsForm instanceof FacetsFormComponent)) return;

    const urlParameters = facetsForm.createURLParameters(formData);

    const url = new URL(window.location.pathname, window.location.origin);

    for (const [key, value] of urlParameters) url.searchParams.append(key, value);

    if (inputElement.checked) url.searchParams.delete(inputElement.name, inputElement.value);

    sectionRenderer.getSectionHTML(this.sectionId, true, url);
  }, 200);

  cancelPrefetchPage = () => this.prefetchPage.cancel();

  /**
   * Updates the selected facet summary
   */
  #updateSelectedFacetSummary() {
    if (!this.refs.facetInputs) return;

    const checkedInputElements = this.refs.facetInputs.filter((input) => input.checked);
    const details = this.closest('details');
    const statusComponent = details?.querySelector('facet-status-component');

    if (!(statusComponent instanceof FacetStatusComponent)) return;

    statusComponent.updateListSummary(checkedInputElements);
  }
}

if (!customElements.get('facet-inputs-component')) {
  customElements.define('facet-inputs-component', FacetInputsComponent);
}

function getCurrencyDecimals(currency = '') {
  return CURRENCY_DECIMALS[currency.toUpperCase()] ?? DEFAULT_CURRENCY_DECIMALS;
}

function normalizeNumericString(value) {
  const raw = String(value ?? '').trim().replace(/\s/g, '').replace(/'/g, '');
  if (raw === '') return '';

  const hasComma = raw.includes(',');
  const hasDot = raw.includes('.');

  if (hasComma && hasDot) {
    return raw.lastIndexOf(',') > raw.lastIndexOf('.')
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw.replace(/,/g, '');
  }

  if (hasComma) return raw.replace(',', '.');
  return raw;
}

function parseLocalizedNumber(value, fallback = NaN) {
  const normalized = normalizeNumericString(value);
  if (normalized === '') return fallback;

  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseMinorUnits(value, fallback, currency = '') {
  const parsed = parseLocalizedNumber(value, NaN);
  if (Number.isNaN(parsed)) return fallback;

  return Math.round(parsed * Math.pow(10, getCurrencyDecimals(currency)));
}

function formatMoneyFromTemplate(template, moneyValue, currency = '') {
  const safeTemplate = template || '{{amount}}';
  const minorUnitPrecision = getCurrencyDecimals(currency);

  return safeTemplate.replace(/{{\s*(\w+)\s*}}/g, (_, placeholder) => {
    if (typeof placeholder !== 'string') return '';
    if (placeholder === 'currency') return currency;

    let thousandsSeparator = ',';
    let decimalSeparator = '.';
    let precision = minorUnitPrecision;

    if (placeholder === 'amount') {
      // Check first since it's the most common, use defaults.
    } else if (placeholder === 'amount_no_decimals') {
      precision = 0;
    } else if (placeholder === 'amount_with_comma_separator') {
      thousandsSeparator = '.';
      decimalSeparator = ',';
    } else if (placeholder === 'amount_no_decimals_with_comma_separator') {
      // Weirdly, this is correct. It uses amount_with_comma_separator's
      // behaviour but removes decimals, resulting in an unintuitive
      // output that can't possibly include commas, despite the name.
      thousandsSeparator = '.';
      precision = 0;
    } else if (placeholder === 'amount_no_decimals_with_space_separator') {
      thousandsSeparator = ' ';
      precision = 0;
    } else if (placeholder === 'amount_with_space_separator') {
      thousandsSeparator = ' ';
      decimalSeparator = ',';
    } else if (placeholder === 'amount_with_period_and_space_separator') {
      thousandsSeparator = ' ';
      decimalSeparator = '.';
    } else if (placeholder === 'amount_with_apostrophe_separator') {
      thousandsSeparator = "'";
      decimalSeparator = '.';
    }

    return formatMinorUnitsValue(moneyValue, thousandsSeparator, decimalSeparator, precision, minorUnitPrecision);
  });
}

function formatMinorUnitsValue(moneyValue, thousandsSeparator, decimalSeparator, displayPrecision, minorUnitPrecision) {
  const roundedNumber = (moneyValue / Math.pow(10, minorUnitPrecision)).toFixed(displayPrecision);

  let [a, b] = roundedNumber.split('.');
  if (!a) a = '0';
  if (!b) b = '';

  a = a.replace(/\d(?=(\d\d\d)+(?!\d))/g, (digit) => digit + thousandsSeparator);

  return displayPrecision <= 0 ? a : a + decimalSeparator + b.padEnd(displayPrecision, '0');
}

/**
 * @typedef {Object} PriceFacetRefs
 * @property {HTMLInputElement} minInput - The minimum price input
 * @property {HTMLInputElement} maxInput - The maximum price input
 */

/**
 * Handles price facet functionality
 * @extends {Component<PriceFacetRefs>}
 */
class PriceFacetComponent extends Component {
  connectedCallback() {
    super.connectedCallback();
    this.refs.minRange?.addEventListener('input', this.#onRangeInput);
    this.refs.maxRange?.addEventListener('input', this.#onRangeInput);
    this.refs.minRange?.addEventListener('change', this.#onRangeChange);
    this.refs.maxRange?.addEventListener('change', this.#onRangeChange);
    this.addEventListener('keydown', this.#onKeyDown);
    this.#syncSliderUI(this.#getDomain());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.refs.minRange?.removeEventListener('input', this.#onRangeInput);
    this.refs.maxRange?.removeEventListener('input', this.#onRangeInput);
    this.refs.minRange?.removeEventListener('change', this.#onRangeChange);
    this.refs.maxRange?.removeEventListener('change', this.#onRangeChange);
    this.removeEventListener('keydown', this.#onKeyDown);
  }

  /**
   * Handles keydown events to restrict input to valid characters
   * @param {KeyboardEvent} event - The keydown event
   */
  #onKeyDown = (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.type === 'range') return;
    if (event.metaKey) return;

    const pattern = /[0-9]|\.|,|'| |Tab|Backspace|Enter|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Delete|Escape/;
    if (!event.key.match(pattern)) event.preventDefault();
  };

  #onRangeInput = () => {
    this.#syncSliderUI(this.#getDomain());
  };

  #onRangeChange = () => {
    this.updatePriceFilterAndResults();
  };

  /**
   * Updates price filter and results
   */
  updatePriceFilterAndResults() {
    const { minInput, maxInput } = this.refs;
    const domain = this.#getDomain();

    this.#syncHiddenInputsFromRanges(domain);
    this.#adjustToValidValues(minInput);
    this.#adjustToValidValues(maxInput);

    const facetsForm = this.closest('facets-form-component');
    if (!(facetsForm instanceof FacetsFormComponent)) return;

    this.#setMinAndMaxValues(domain);
    this.#syncRangesFromHiddenInputs(domain);
    this.#syncSliderUI(domain);
    facetsForm.updateFilters();
    this.#updateSummary();
  }

  /**
   * Adjusts input values to be within valid range
   * @param {HTMLInputElement} input - The input element to adjust
   */
  #adjustToValidValues(input) {
    if (!(input instanceof HTMLInputElement) || input.value.trim() === '') return;

    const value = parseLocalizedNumber(input.value, NaN);
    const min = parseLocalizedNumber(input.getAttribute('data-min') ?? '', NaN);
    const max = parseLocalizedNumber(input.getAttribute('data-max') ?? '', NaN);
    if (Number.isNaN(value) || Number.isNaN(min) || Number.isNaN(max)) return;

    if (value < min) input.value = min.toString();
    if (value > max) input.value = max.toString();
  }

  /**
   * Sets min and max values for the inputs
   */
  #setMinAndMaxValues(domain) {
    const { minInput, maxInput } = this.refs;
    const { rangeMin, rangeMax } = domain;

    this.#setInputAttribute(minInput, 'data-max', maxInput.value || this.#formatInputValue(rangeMax));
    this.#setInputAttribute(maxInput, 'data-min', minInput.value || this.#formatInputValue(rangeMin));
  }

  /**
   * Updates the price summary
   */
  #updateSummary() {
    const { minInput, maxInput } = this.refs;
    const details = this.closest('details');
    const statusComponent = details?.querySelector('facet-status-component');

    if (!(statusComponent instanceof FacetStatusComponent)) return;

    statusComponent?.updatePriceSummary(minInput, maxInput);
  }

  #syncHiddenInputsFromRanges(domain) {
    const minInput = this.refs.minInput;
    const maxInput = this.refs.maxInput;
    if (
      !(minInput instanceof HTMLInputElement) ||
      !(maxInput instanceof HTMLInputElement)
    ) {
      return;
    }

    const { rangeMin, rangeMax } = domain;
    const values = this.#readRangeValues(domain);
    this.#writeRangeValues(values);

    minInput.value = values.minValue <= rangeMin ? '' : this.#formatInputValue(values.minValue);
    maxInput.value = values.maxValue >= rangeMax ? '' : this.#formatInputValue(values.maxValue);
  }

  #syncRangesFromHiddenInputs(domain) {
    const minInput = this.refs.minInput;
    const maxInput = this.refs.maxInput;
    if (
      !(minInput instanceof HTMLInputElement) ||
      !(maxInput instanceof HTMLInputElement)
    ) {
      return;
    }

    const { rangeMin, rangeMax } = domain;
    const values = this.#normalizeRangeValues(
      minInput.value ? this.#parseInputValue(minInput.value, rangeMin) : rangeMin,
      maxInput.value ? this.#parseInputValue(maxInput.value, rangeMax) : rangeMax,
      domain,
    );

    this.#writeRangeValues(values);
  }

  #syncSliderUI(domain) {
    const minLabel = this.refs.minLabel;
    const maxLabel = this.refs.maxLabel;
    const activeRange = this.refs.activeRange;
    if (
      !(minLabel instanceof HTMLElement) ||
      !(maxLabel instanceof HTMLElement) ||
      !(activeRange instanceof HTMLElement)
    ) {
      return;
    }

    const { rangeMin, rangeSpan } = domain;
    const values = this.#readRangeValues(domain);
    this.#writeRangeValues(values);

    minLabel.textContent = this.#formatDisplayMoney(this.#toMinorUnits(values.minValue));
    maxLabel.textContent = this.#formatDisplayMoney(this.#toMinorUnits(values.maxValue));

    const start = ((values.minValue - rangeMin) / rangeSpan) * 100;
    const end = ((values.maxValue - rangeMin) / rangeSpan) * 100;

    activeRange.style.left = `${start}%`;
    activeRange.style.width = `${Math.max(end - start, 0)}%`;
  }

  #getDomain() {
    const rangeMin = parseLocalizedNumber(this.dataset.rangeMin || '0', NaN);
    const rangeMax = parseLocalizedNumber(this.dataset.rangeMax || String(rangeMin), NaN);
    const safeMin = Number.isNaN(rangeMin) ? 0 : rangeMin;
    const safeMax = Number.isNaN(rangeMax) ? safeMin : Math.max(rangeMax, safeMin);
    const rangeSpan = Math.max(safeMax - safeMin, 1);

    return { rangeMin: safeMin, rangeMax: safeMax, rangeSpan };
  }

  #normalizeRangeValues(minCandidate, maxCandidate, domain) {
    const { rangeMin, rangeMax } = domain;
    let minValue = this.#clampToDomain(minCandidate, rangeMin, rangeMax);
    let maxValue = this.#clampToDomain(maxCandidate, rangeMin, rangeMax);

    if (minValue > maxValue) {
      [minValue, maxValue] = [maxValue, minValue];
    }

    return { minValue, maxValue };
  }

  #clampToDomain(value, rangeMin, rangeMax) {
    if (Number.isNaN(value)) return rangeMin;
    return Math.min(Math.max(value, rangeMin), rangeMax);
  }

  #readRangeValues(domain) {
    const minRange = this.refs.minRange;
    const maxRange = this.refs.maxRange;
    if (!(minRange instanceof HTMLInputElement) || !(maxRange instanceof HTMLInputElement)) {
      return { minValue: domain.rangeMin, maxValue: domain.rangeMax };
    }

    const values = this.#normalizeRangeValues(
      parseLocalizedNumber(minRange.value || String(domain.rangeMin), domain.rangeMin),
      parseLocalizedNumber(maxRange.value || String(domain.rangeMax), domain.rangeMax),
      domain,
    );

    return values;
  }

  #writeRangeValues({ minValue, maxValue }) {
    const minRange = this.refs.minRange;
    const maxRange = this.refs.maxRange;
    if (!(minRange instanceof HTMLInputElement) || !(maxRange instanceof HTMLInputElement)) return;

    const minString = this.#formatRangeValue(minValue);
    const maxString = this.#formatRangeValue(maxValue);
    if (minRange.value !== minString) minRange.value = minString;
    if (maxRange.value !== maxString) maxRange.value = maxString;
  }

  #setInputAttribute(input, attribute, value) {
    if (!(input instanceof HTMLInputElement)) return;
    if (input.getAttribute(attribute) === value) return;
    input.setAttribute(attribute, value);
  }

  #parseInputValue(value, fallback) {
    const parsed = parseLocalizedNumber(value, NaN);
    if (Number.isNaN(parsed)) return fallback;

    return parsed;
  }

  #formatRangeValue(value) {
    if (Number.isInteger(value)) return value.toString();

    const decimals = this.#currencyDecimals();
    return value.toFixed(decimals);
  }

  #formatInputValue(value) {
    return this.#formatRangeValue(value);
  }

  #minorUnitFactor() {
    const factor = parseInt(this.dataset.minorUnitFactor || '100', 10);
    return Number.isNaN(factor) ? 100 : Math.max(factor, 1);
  }

  #toMinorUnits(value) {
    return Math.round(value * this.#minorUnitFactor());
  }

  #toRangeUnits(value) {
    return value / this.#minorUnitFactor();
  }

  #formatDisplayMoney(cents) {
    const template = this.dataset.moneyFormat || '{{amount}}';
    const currency = this.dataset.currency || '';

    return formatMoneyFromTemplate(template, cents, currency);
  }

  #currencyDecimals() {
    return getCurrencyDecimals(this.dataset.currency || '');
  }
}

if (!customElements.get('price-facet-component')) {
  customElements.define('price-facet-component', PriceFacetComponent);
}

/**
 * Handles clearing of facet filters
 * @extends {Component}
 */
class FacetClearComponent extends Component {
  requiredRefs = ['clearButton'];

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('keyup', this.#handleKeyUp);
    document.addEventListener(ThemeEvents.FilterUpdate, this.#handleFilterUpdate);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener(ThemeEvents.FilterUpdate, this.#handleFilterUpdate);
  }

  /**
   * Clears the filter
   * @param {Event} event - The click event
   */
  clearFilter(event) {
    if (!(event.target instanceof HTMLElement)) return;

    if (event instanceof KeyboardEvent) {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }
      event.preventDefault();
    }

    const container = event.target.closest('facet-inputs-component, price-facet-component');
    container?.querySelectorAll('[type="checkbox"]:checked, input').forEach((input) => {
      if (input instanceof HTMLInputElement) {
        input.checked = false;
        input.value = '';
      }
    });

    const details = event.target.closest('details');
    const statusComponent = details?.querySelector('facet-status-component');

    if (!(statusComponent instanceof FacetStatusComponent)) return;

    statusComponent.clearSummary();

    const facetsForm = this.closest('facets-form-component');
    if (!(facetsForm instanceof FacetsFormComponent)) return;

    facetsForm.updateFilters();
  }

  /**
   * Handles keyup events
   * @param {KeyboardEvent} event - The keyup event
   */
  #handleKeyUp = (event) => {
    if (event.metaKey) return;
    if (event.key === 'Enter') this.clearFilter(event);
  };

  /**
   * Toggle clear button visibility when filters are applied. Happens before the
   * Section Rendering Request resolves.
   *
   * @param {FilterUpdateEvent} event
   */
  #handleFilterUpdate = (event) => {
    const { clearButton } = this.refs;
    if (clearButton instanceof Element) {
      clearButton.classList.toggle('facets__clear--active', event.shouldShowClearAll());
    }
  };
}

if (!customElements.get('facet-clear-component')) {
  customElements.define('facet-clear-component', FacetClearComponent);
}

/**
 * @typedef {Object} FacetRemoveComponentRefs
 * @property {HTMLInputElement | undefined} clearButton - The button to clear filters
 */

/**
 * Handles removal of individual facet filters
 * @extends {Component<FacetRemoveComponentRefs>}
 */
class FacetRemoveComponent extends Component {
  connectedCallback() {
    super.connectedCallback();
    document.addEventListener(ThemeEvents.FilterUpdate, this.#handleFilterUpdate);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener(ThemeEvents.FilterUpdate, this.#handleFilterUpdate);
  }

  /**
   * Removes the filter
   * @param {Object} data - The data object
   * @param {string} data.form - The form to remove the filter from
   * @param {Event} event - The click event
   */
  removeFilter({ form }, event) {
    if (event instanceof KeyboardEvent) {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }
      event.preventDefault();
    }

    const url = this.dataset.url;
    if (!url) return;

    const facetsForm = form ? document.getElementById(form) : this.closest('facets-form-component');

    if (!(facetsForm instanceof FacetsFormComponent)) return;

    facetsForm.updateFiltersByURL(url);
  }

  /**
   * Toggle clear button visibility when filters are applied. Happens before the
   * Section Rendering Request resolves.
   *
   * @param {FilterUpdateEvent} event
   */
  #handleFilterUpdate = (event) => {
    const { clearButton } = this.refs;
    if (clearButton instanceof Element) {
      clearButton.classList.toggle('active', event.shouldShowClearAll());
    }
  };
}

if (!customElements.get('facet-remove-component')) {
  customElements.define('facet-remove-component', FacetRemoveComponent);
}

/**
 * Handles sorting filter functionality
 *
 * @typedef {Object} SortingFilterRefs
 * @property {HTMLDetailsElement} details - The details element
 * @property {HTMLElement} summary - The summary element
 * @property {HTMLElement} listbox - The listbox element
 *
 * @extends {Component}
 */
class SortingFilterComponent extends Component {
  requiredRefs = ['details', 'summary', 'listbox'];

  /**
   * Handles keyboard navigation in the sorting dropdown
   * @param {KeyboardEvent} event - The keyboard event
   */
  handleKeyDown = (event) => {
    const { listbox } = this.refs;
    if (!(listbox instanceof Element)) return;

    const options = Array.from(listbox.querySelectorAll('[role="option"]'));
    const currentFocused = options.find((option) => option instanceof HTMLElement && option.tabIndex === 0);
    let newFocusIndex = currentFocused ? options.indexOf(currentFocused) : 0;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        newFocusIndex = Math.min(newFocusIndex + 1, options.length - 1);
        this.#moveFocus(options, newFocusIndex);
        break;

      case 'ArrowUp':
        event.preventDefault();
        newFocusIndex = Math.max(newFocusIndex - 1, 0);
        this.#moveFocus(options, newFocusIndex);
        break;

      case 'Enter':
      case ' ':
        if (event.target instanceof Element) {
          const targetOption = event.target.closest('[role="option"]');
          if (targetOption) {
            event.preventDefault();
            this.#selectOption(targetOption);
          }
        }
        break;

      case 'Escape':
        event.preventDefault();
        this.#closeDropdown();
        break;
    }
  };

  /**
   * Handles details toggle event
   */
  handleToggle = () => {
    const { details, summary, listbox } = this.refs;
    if (!(details instanceof HTMLDetailsElement) || !(summary instanceof HTMLElement)) return;

    const isOpen = details.open;
    summary.setAttribute('aria-expanded', isOpen.toString());

    if (isOpen && listbox instanceof Element) {
      // Move focus to selected option when dropdown opens
      const selectedOption = listbox.querySelector('[aria-selected="true"]');
      if (selectedOption instanceof HTMLElement) {
        selectedOption.focus();
      }
    }
  };

  /**
   * Moves focus between options
   * @param {Element[]} options - The option elements
   * @param {number} newIndex - The index of the option to focus
   */
  #moveFocus(options, newIndex) {
    // Remove tabindex from all options
    options.forEach((option) => {
      if (option instanceof HTMLElement) {
        option.tabIndex = -1;
      }
    });

    // Set tabindex and focus on new option
    const targetOption = options[newIndex];
    if (targetOption instanceof HTMLElement) {
      targetOption.tabIndex = 0;
      targetOption.focus();
    }
  }

  /**
   * Selects an option and triggers form submission
   * @param {Element} option - The option element to select
   */
  #selectOption(option) {
    const input = option.querySelector('input[type="radio"]');
    if (input instanceof HTMLInputElement && option instanceof HTMLElement) {
      // Update aria-selected states
      this.querySelectorAll('[role="option"]').forEach((opt) => {
        opt.setAttribute('aria-selected', 'false');
      });
      option.setAttribute('aria-selected', 'true');

      // Trigger click on the input to ensure normal form behavior
      input.click();

      // Close dropdown and return focus (handles tabIndex reset)
      this.#closeDropdown();
    }
  }

  /**
   * Closes the dropdown and returns focus to summary
   */
  #closeDropdown() {
    const { details, summary } = this.refs;
    if (details instanceof HTMLDetailsElement) {
      // Reset focus to match the actual selected option
      const options = this.querySelectorAll('[role="option"]');
      const selectedOption = this.querySelector('[aria-selected="true"]');

      options.forEach((opt) => {
        if (opt instanceof HTMLElement) {
          opt.tabIndex = -1;
        }
      });

      if (selectedOption instanceof HTMLElement) {
        selectedOption.tabIndex = 0;
      }

      details.open = false;
      if (summary instanceof HTMLElement) {
        summary.focus();
      }
    }
  }

  /**
   * Updates filter and sorting
   * @param {Event} event - The change event
   */
  updateFilterAndSorting(event) {
    const facetsForm =
      this.closest('facets-form-component') || this.closest('.shopify-section')?.querySelector('facets-form-component');

    if (!(facetsForm instanceof FacetsFormComponent)) return;
    const isMobile = window.innerWidth < 750;

    const shouldDisable = this.dataset.shouldUseSelectOnMobile === 'true';

    // Because we have a select element on mobile and a bunch of radio buttons on desktop,
    // we need to disable the input during "form-submission" to prevent duplicate entries.
    if (shouldDisable) {
      if (isMobile) {
        const inputs = this.querySelectorAll('input[name="sort_by"]');
        inputs.forEach((input) => {
          if (!(input instanceof HTMLInputElement)) return;
          input.disabled = true;
        });
      } else {
        const selectElement = this.querySelector('select[name="sort_by"]');
        if (!(selectElement instanceof HTMLSelectElement)) return;
        selectElement.disabled = true;
      }
    }

    facetsForm.updateFilters();
    this.updateFacetStatus(event);

    // Re-enable the input after the form-submission
    if (shouldDisable) {
      if (isMobile) {
        const inputs = this.querySelectorAll('input[name="sort_by"]');
        inputs.forEach((input) => {
          if (!(input instanceof HTMLInputElement)) return;
          input.disabled = false;
        });
      } else {
        const selectElement = this.querySelector('select[name="sort_by"]');
        if (!(selectElement instanceof HTMLSelectElement)) return;
        selectElement.disabled = false;
      }
    }

    // Close the details element when a value is selected
    const { details } = this.refs;
    if (!(details instanceof HTMLDetailsElement)) return;
    details.open = false;
  }

  /**
   * Updates the facet status
   * @param {Event} event - The change event
   */
  updateFacetStatus(event) {
    if (!(event.target instanceof HTMLSelectElement)) return;

    const details = this.querySelector('details');
    if (!details) return;

    const facetStatus = details.querySelector('facet-status-component');
    if (!(facetStatus instanceof FacetStatusComponent)) return;

    facetStatus.textContent =
      event.target.value !== details.dataset.defaultSortBy ? event.target.dataset.optionName ?? '' : '';
  }
}

if (!customElements.get('sorting-filter-component')) {
  customElements.define('sorting-filter-component', SortingFilterComponent);
}

/**
 * @typedef {Object} FacetStatusRefs
 * @property {HTMLElement} facetStatus - The facet status element
 */

/**
 * Handles facet status display
 * @extends {Component<FacetStatusRefs>}
 */
class FacetStatusComponent extends Component {
  /**
   * Updates the list summary
   * @param {HTMLInputElement[]} checkedInputElements - The checked input elements
   */
  updateListSummary(checkedInputElements) {
    const checkedInputElementsCount = checkedInputElements.length;

    this.getAttribute('facet-type') === 'swatches'
      ? this.#updateSwatchSummary(checkedInputElements, checkedInputElementsCount)
      : this.#updateBubbleSummary(checkedInputElements, checkedInputElementsCount);
  }

  /**
   * Updates the swatch summary
   * @param {HTMLInputElement[]} checkedInputElements - The checked input elements
   * @param {number} checkedInputElementsCount - The number of checked inputs
   */
  #updateSwatchSummary(checkedInputElements, checkedInputElementsCount) {
    const { facetStatus } = this.refs;
    facetStatus.classList.remove('bubble', 'facets__bubble');

    if (checkedInputElementsCount === 0) {
      facetStatus.innerHTML = '';
      return;
    }

    if (checkedInputElementsCount > 3) {
      facetStatus.innerHTML = checkedInputElementsCount.toString();
      facetStatus.classList.add('bubble', 'facets__bubble');
      return;
    }

    facetStatus.innerHTML = Array.from(checkedInputElements)
      .map((inputElement) => {
        const swatch = inputElement.parentElement?.querySelector('span.swatch');
        return swatch?.outerHTML ?? '';
      })
      .join('');
  }

  /**
   * Updates the bubble summary
   * @param {HTMLInputElement[]} checkedInputElements - The checked input elements
   * @param {number} checkedInputElementsCount - The number of checked inputs
   */
  #updateBubbleSummary(checkedInputElements, checkedInputElementsCount) {
    const { facetStatus } = this.refs;
    const filterStyle = this.dataset.filterStyle;

    facetStatus.classList.remove('bubble', 'facets__bubble');

    if (checkedInputElementsCount === 0) {
      facetStatus.innerHTML = '';
      return;
    }

    if (filterStyle === 'horizontal' && checkedInputElementsCount === 1) {
      facetStatus.innerHTML = checkedInputElements[0]?.dataset.label ?? '';
      return;
    }

    facetStatus.innerHTML = checkedInputElementsCount.toString();
    facetStatus.classList.add('bubble', 'facets__bubble');
  }

  /**
   * Updates the price summary
   * @param {HTMLInputElement} minInput - The minimum price input
   * @param {HTMLInputElement} maxInput - The maximum price input
   */
  updatePriceSummary(minInput, maxInput) {
    const minInputValue = minInput.value;
    const maxInputValue = maxInput.value;
    const { facetStatus } = this.refs;
    const currency = facetStatus.dataset.currency || '';
    const rangeMin = parseInt(facetStatus.dataset.rangeMin || '0', 10);
    const rangeMax = parseInt(facetStatus.dataset.rangeMax || String(rangeMin), 10);
    const safeRangeMin = Number.isNaN(rangeMin) ? 0 : rangeMin;
    const safeRangeMax = Number.isNaN(rangeMax) ? safeRangeMin : Math.max(rangeMax, safeRangeMin);

    if (!minInputValue && !maxInputValue) {
      facetStatus.innerHTML = '';
      return;
    }

    const minInputNum = minInputValue
      ? parseMinorUnits(minInputValue, safeRangeMin, currency)
      : safeRangeMin;
    const maxInputNum = maxInputValue
      ? parseMinorUnits(maxInputValue, safeRangeMax, currency)
      : safeRangeMax;

    facetStatus.innerHTML = `${this.#formatMoney(minInputNum)}–${this.#formatMoney(maxInputNum)}`;
  }

  /**
   * Formats money, replicated the implementation of the `money` liquid filters
   * @param {number} moneyValue - The money value
   * @returns {string} The formatted money value
   */
  #formatMoney(moneyValue) {
    if (!(this.refs.moneyFormat instanceof HTMLTemplateElement)) return '';

    const template = this.refs.moneyFormat.content.textContent || '{{amount}}';
    const currency = this.refs.facetStatus.dataset.currency || '';
    return formatMoneyFromTemplate(template, moneyValue, currency);
  }

  /**
   * Clears the summary
   */
  clearSummary() {
    this.refs.facetStatus.innerHTML = '';
  }
}

if (!customElements.get('facet-status-component')) {
  customElements.define('facet-status-component', FacetStatusComponent);
}

/**
 * Default currency decimals used in most currenies
 * @constant {number}
 */
const DEFAULT_CURRENCY_DECIMALS = 2;

/**
 * Decimal precision for currencies that have a non-default precision
 * @type {Record<string, number>}
 */
const CURRENCY_DECIMALS = {
  BHD: 3,
  BIF: 0,
  BYR: 0,
  CLF: 4,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  IQD: 3,
  ISK: 0,
  JOD: 3,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  KWD: 3,
  LYD: 3,
  MRO: 5,
  OMR: 3,
  PYG: 0,
  RWF: 0,
  TND: 3,
  UGX: 0,
  UYI: 0,
  UYW: 4,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XAG: 0,
  XAU: 0,
  XBA: 0,
  XBB: 0,
  XBC: 0,
  XBD: 0,
  XDR: 0,
  XOF: 0,
  XPD: 0,
  XPF: 0,
  XPT: 0,
  XSU: 0,
  XTS: 0,
  XUA: 0,
};
