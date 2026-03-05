(() => {
  const SELECTORS = {
    root: '[data-sg-root]',
    trigger: '[data-sg-trigger]',
    overlay: '[data-sg-overlay]',
    dialog: '[data-sg-dialog]',
    close: '[data-sg-close]',

    // Category tabs (may exist OR be generated)
    catTabs: '[data-sg-category-tabs]',
    catTab: '[data-sg-cat-tab]',

    // Category panels
    category: '[data-sg-category]',

    // Sub tabs/panels inside each category
    subTab: '[data-sg-subtab]',
    subPanel: '[data-sg-subpanel]',

    // Unit toggles inside each category
    unitBtn: '[data-sg-unit]',
    tableImg: '[data-sg-table]',
    tableWrap: '[data-sg-table-wrap]',

    // Lazy images
    lazyImg: 'img[data-sg-src]',
  }

  const FOCUSABLE = [
    'a[href]',
    'area[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'iframe',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]',
  ].join(',')

  const state = new WeakMap()

  const qsa = (el, sel) => Array.from(el.querySelectorAll(sel))
  const qs = (el, sel) => el.querySelector(sel)

  function loadLazyWithin(container) {
    if (!container) return
    qsa(container, SELECTORS.lazyImg).forEach((img) => {
      const src = img.getAttribute('data-sg-src')
      if (!src) return
      if (!img.getAttribute('src')) img.setAttribute('src', src)
      img.removeAttribute('data-sg-src')
    })
  }

  function setAriaExpanded(root, expanded) {
    const trigger = qs(root, SELECTORS.trigger)
    if (trigger) trigger.setAttribute('aria-expanded', expanded ? 'true' : 'false')
  }

  function ensureIdsForCategory(root) {
    // Ensure categories have a stable cat-id attribute
    const categories = qsa(root, SELECTORS.category)
    categories.forEach((cat, idx) => {
      if (!cat.getAttribute('data-sg-cat-id')) {
        // fallback id
        cat.setAttribute('data-sg-cat-id', String(idx))
      }
      // Ensure category has a title used to build tabs
      if (!cat.getAttribute('data-title')) {
        const t = cat.getAttribute('data-sg-title') || cat.getAttribute('aria-label') || `Category ${idx + 1}`
        cat.setAttribute('data-title', t)
      }
    })
  }

  function buildCategoryTabsIfMissing(root) {
    const tabsWrap = qs(root, SELECTORS.catTabs)
    if (!tabsWrap) return

    // If tabs already exist (Liquid rendered), don't rebuild
    if (qs(tabsWrap, SELECTORS.catTab)) return

    const categories = qsa(root, SELECTORS.category)
    if (!categories.length) return

    // Create tabs from categories
    categories.forEach((cat, idx) => {
      const catId = cat.getAttribute('data-sg-cat-id') || String(idx)
      const title = cat.getAttribute('data-title') || `Category ${idx + 1}`

      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'sg__categoryTab'
      btn.setAttribute('role', 'tab')
      btn.setAttribute('data-sg-cat-tab', '')
      btn.setAttribute('data-sg-cat-id', catId)
      btn.textContent = title

      tabsWrap.appendChild(btn)
    })
  }

  function getInitialCatId(root) {
    const activePanel = qs(root, `${SELECTORS.category}.is-active`)
    if (activePanel) return activePanel.getAttribute('data-sg-cat-id')

    const activeTab = qs(root, `${SELECTORS.catTab}.is-active`)
    if (activeTab) return activeTab.getAttribute('data-sg-cat-id')

    const firstPanel = qs(root, SELECTORS.category)
    if (firstPanel) return firstPanel.getAttribute('data-sg-cat-id')

    return null
  }

  function activateCategory(root, catId) {
    if (catId == null) return

    const tabs = qsa(root, SELECTORS.catTab)
    const panels = qsa(root, SELECTORS.category)

    // Tabs state
    tabs.forEach((tab) => {
      const active = tab.getAttribute('data-sg-cat-id') === catId
      tab.classList.toggle('is-active', active)
      tab.setAttribute('aria-selected', active ? 'true' : 'false')
      tab.setAttribute('tabindex', active ? '0' : '-1')
    })

    // Panels state
    panels.forEach((panel) => {
      const active = panel.getAttribute('data-sg-cat-id') === catId
      panel.classList.toggle('is-active', active)
      panel.hidden = !active

      if (active) {
        // Ensure at least one subpanel active
        ensureInitialSubState(panel)
        // Ensure unit default
        ensureInitialUnitState(panel)
        // Lazy load visible
        loadLazyWithin(panel)
        const activeSub = qs(panel, `${SELECTORS.subPanel}.is-active`)
        loadLazyWithin(activeSub || panel)
      }
    })
  }

  function ensureInitialSubState(categoryEl) {
    const subPanels = qsa(categoryEl, SELECTORS.subPanel)
    if (!subPanels.length) return

    const hasActive = !!qs(categoryEl, `${SELECTORS.subPanel}.is-active`)
    if (!hasActive) {
      // pick first subpanel
      subPanels.forEach((p, idx) => {
        const active = idx === 0
        p.classList.toggle('is-active', active)
        p.hidden = !active
      })
      const subTabs = qsa(categoryEl, SELECTORS.subTab)
      subTabs.forEach((t, idx) => {
        const active = idx === 0
        t.classList.toggle('is-active', active)
        t.setAttribute('aria-selected', active ? 'true' : 'false')
        t.setAttribute('tabindex', active ? '0' : '-1')
      })
    } else {
      // keep consistent hidden flags
      subPanels.forEach((p) => {
        const active = p.classList.contains('is-active')
        p.hidden = !active
      })
    }
  }

  function activateSubTab(categoryEl, target) {
    const tabs = qsa(categoryEl, SELECTORS.subTab)
    const panels = qsa(categoryEl, SELECTORS.subPanel)

    tabs.forEach((t) => {
      const active = t.getAttribute('data-sg-subtab-target') === target || t.getAttribute('data-sg-subtab') === target
      t.classList.toggle('is-active', active)
      t.setAttribute('aria-selected', active ? 'true' : 'false')
      t.setAttribute('tabindex', active ? '0' : '-1')
    })

    panels.forEach((p) => {
      const active = p.getAttribute('data-sg-subpanel') === target
      p.classList.toggle('is-active', active)
      p.hidden = !active
      if (active) loadLazyWithin(p)
    })
  }

  function ensureInitialUnitState(categoryEl) {
    const btns = qsa(categoryEl, SELECTORS.unitBtn)
    const imgs = qsa(categoryEl, SELECTORS.tableImg)
    if (!btns.length && !imgs.length) return

    const hasActiveBtn = btns.some((b) => b.classList.contains('is-active'))
    const activeBtnUnit = btns.find((b) => b.classList.contains('is-active'))?.getAttribute('data-sg-unit')
    const hasCmImg = imgs.some((img) => img.getAttribute('data-sg-table') === 'cm')
    const firstImgUnit = imgs[0]?.getAttribute('data-sg-table')
    const defaultUnit = activeBtnUnit || (hasCmImg ? 'cm' : firstImgUnit) || 'cm'

    setUnits(categoryEl, defaultUnit)
  }

  function setUnits(categoryEl, unit) {
    const btns = qsa(categoryEl, SELECTORS.unitBtn)
    btns.forEach((b) => {
      const active = b.getAttribute('data-sg-unit') === unit
      b.classList.toggle('is-active', active)
      b.setAttribute('aria-pressed', active ? 'true' : 'false')
    })

    const imgs = qsa(categoryEl, SELECTORS.tableImg)
    imgs.forEach((img) => {
      const active = img.getAttribute('data-sg-table') === unit
      img.classList.toggle('is-active', active)
      img.hidden = !active
      if (active) {
        loadLazyWithin(img.closest(SELECTORS.tableWrap) || categoryEl)
      }
    })
  }

  function openModal(root) {
    const overlay = qs(root, SELECTORS.overlay)
    const dialog = qs(root, SELECTORS.dialog)
    if (!overlay || !dialog) return

    const prev = document.activeElement
    state.set(root, { prevFocus: prev, trapHandler: null })

    overlay.hidden = false
    overlay.classList.add('is-open')
    dialog.classList.add('is-open')
    setAriaExpanded(root, true)

    // Ensure initial category is properly activated
    const initCatId = getInitialCatId(root)
    if (initCatId != null) activateCategory(root, initCatId)

    requestAnimationFrame(() => {
      // Focus dialog for accessibility
      dialog.focus()
      trapFocus(root, dialog)
    })
  }

  function closeModal(root) {
    const overlay = qs(root, SELECTORS.overlay)
    const dialog = qs(root, SELECTORS.dialog)
    if (!overlay || !dialog) return

    overlay.classList.remove('is-open')
    dialog.classList.remove('is-open')
    overlay.hidden = true
    setAriaExpanded(root, false)

    // Remove trap handler
    const info = state.get(root)
    if (info?.trapHandler) document.removeEventListener('keydown', info.trapHandler)

    if (info?.prevFocus && typeof info.prevFocus.focus === 'function') {
      info.prevFocus.focus()
    }
    state.delete(root)
  }

  function trapFocus(root, dialog) {
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeModal(root)
        return
      }

      if (e.key !== 'Tab') return

      const focusables = qsa(dialog, FOCUSABLE).filter((el) => el.offsetParent !== null)
      if (!focusables.length) return

      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement

      if (e.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    const info = state.get(root) || {}
    if (info.trapHandler) document.removeEventListener('keydown', info.trapHandler)
    info.trapHandler = handler
    state.set(root, info)
    document.addEventListener('keydown', handler)
  }

  function onRootClick(e) {
    const target = e.target instanceof Element ? e.target : e.target?.parentElement
    if (!target) return

    const root = target.closest(SELECTORS.root)
    if (!root) return

    const trigger = target.closest(SELECTORS.trigger)
    if (trigger) {
      e.preventDefault()
      openModal(root)
      return
    }

    const closeBtn = target.closest(SELECTORS.close)
    if (closeBtn) {
      e.preventDefault()
      closeModal(root)
      return
    }

    const overlay = target.closest(SELECTORS.overlay)
    if (overlay && target === overlay) {
      e.preventDefault()
      closeModal(root)
      return
    }

    const catTab = target.closest(SELECTORS.catTab)
    if (catTab) {
      e.preventDefault()
      activateCategory(root, catTab.getAttribute('data-sg-cat-id'))
      return
    }

    const subTab = target.closest(SELECTORS.subTab)
    if (subTab) {
      const categoryEl = target.closest(SELECTORS.category)
      if (!categoryEl) return
      e.preventDefault()

      // Accept either data-sg-subtab-target (your current markup) or data-sg-subtab (my simplified)
      const target = subTab.getAttribute('data-sg-subtab-target') || subTab.getAttribute('data-sg-subtab')
      if (!target) return
      activateSubTab(categoryEl, target)
      return
    }

    const unitBtn = target.closest(SELECTORS.unitBtn)
    if (unitBtn) {
      const categoryEl = target.closest(SELECTORS.category)
      if (!categoryEl) return
      e.preventDefault()
      setUnits(categoryEl, unitBtn.getAttribute('data-sg-unit'))
      return
    }
  }

  function onRootKeyDown(e) {
    const target = e.target instanceof Element ? e.target : e.target?.parentElement
    if (!target) return

    const root = target.closest(SELECTORS.root)
    if (!root) return

    const overlay = qs(root, SELECTORS.overlay)
    const isOpen = overlay && overlay.hidden === false

    // Category tab keyboard nav
    const activeCatTab = target.closest(SELECTORS.catTab)
    if (
      activeCatTab &&
      (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End')
    ) {
      const tabs = qsa(root, SELECTORS.catTab)
      const currentIndex = tabs.indexOf(activeCatTab)
      if (currentIndex === -1) return

      let nextIndex = currentIndex
      if (e.key === 'ArrowLeft') nextIndex = Math.max(0, currentIndex - 1)
      if (e.key === 'ArrowRight') nextIndex = Math.min(tabs.length - 1, currentIndex + 1)
      if (e.key === 'Home') nextIndex = 0
      if (e.key === 'End') nextIndex = tabs.length - 1

      e.preventDefault()
      const next = tabs[nextIndex]
      if (!next) return
      next.focus()
      activateCategory(root, next.getAttribute('data-sg-cat-id'))
      return
    }

    // Subtab keyboard nav
    const activeSubTab = target.closest(SELECTORS.subTab)
    if (
      activeSubTab &&
      (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End')
    ) {
      const categoryEl = target.closest(SELECTORS.category)
      if (!categoryEl) return

      const tabs = qsa(categoryEl, SELECTORS.subTab)
      const currentIndex = tabs.indexOf(activeSubTab)
      if (currentIndex === -1) return

      let nextIndex = currentIndex
      if (e.key === 'ArrowLeft') nextIndex = Math.max(0, currentIndex - 1)
      if (e.key === 'ArrowRight') nextIndex = Math.min(tabs.length - 1, currentIndex + 1)
      if (e.key === 'Home') nextIndex = 0
      if (e.key === 'End') nextIndex = tabs.length - 1

      e.preventDefault()
      const next = tabs[nextIndex]
      if (!next) return
      next.focus()

      const target = next.getAttribute('data-sg-subtab-target') || next.getAttribute('data-sg-subtab')
      if (!target) return
      activateSubTab(categoryEl, target)
      return
    }

    if (isOpen && e.key === 'Escape') {
      e.preventDefault()
      closeModal(root)
    }
  }

  function initOne(root) {
    if (!root.dataset.sgBound) {
      const trigger = qs(root, SELECTORS.trigger)
      const closeBtn = qs(root, SELECTORS.close)
      const overlay = qs(root, SELECTORS.overlay)

      if (trigger) {
        trigger.addEventListener('click', (e) => {
          e.preventDefault()
          openModal(root)
        })
      }

      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          closeModal(root)
        })
      }

      if (overlay) {
        overlay.addEventListener('click', (e) => {
          if (e.target !== overlay) return
          e.preventDefault()
          closeModal(root)
        })
      }

      root.dataset.sgBound = 'true'
    }

    ensureIdsForCategory(root)
    buildCategoryTabsIfMissing(root)

    // Make tabs accessible after build/ensure
    const tabsWrap = qs(root, SELECTORS.catTabs)
    if (tabsWrap) tabsWrap.setAttribute('role', 'tablist')

    const tabs = qsa(root, SELECTORS.catTab)
    const hasMultipleCategories = tabs.length > 1
    root.classList.toggle('sg--single-category', !hasMultipleCategories)
    if (tabsWrap) tabsWrap.hidden = !hasMultipleCategories

    tabs.forEach((tab, i) => {
      if (!tab.getAttribute('role')) tab.setAttribute('role', 'tab')
      if (!tab.hasAttribute('tabindex')) tab.setAttribute('tabindex', i === 0 ? '0' : '-1')
      if (!tab.hasAttribute('aria-selected')) tab.setAttribute('aria-selected', i === 0 ? 'true' : 'false')
    })

    // Ensure initial active category
    const initCatId = getInitialCatId(root)
    if (initCatId != null) activateCategory(root, initCatId)
    else {
      // If there are categories but no id, force first visible
      const first = qs(root, SELECTORS.category)
      if (first) {
        first.hidden = false
        first.classList.add('is-active')
      }
    }

    // Default: hide IN tables unless active
    qsa(root, SELECTORS.category).forEach((cat) => {
      ensureInitialSubState(cat)
      ensureInitialUnitState(cat)
    })
  }

  function initAll() {
    qsa(document, SELECTORS.root).forEach(initOne)
  }

  document.addEventListener('click', onRootClick)
  document.addEventListener('keydown', onRootKeyDown)

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll)
  } else {
    initAll()
  }
})()
