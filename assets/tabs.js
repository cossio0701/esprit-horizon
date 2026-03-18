(() => {
  if (window.__uiTabsLoaded) return
  window.__uiTabsLoaded = true

  const SELECTORS = {
    root: '[data-tabs]',
    tablist: '[data-tablist]',
    tab: '[data-tab]',
    panels: '.ui-tabs__panels',
    panel: '[data-panel]'
  }

  const stateMap = new WeakMap()

  function qa(root, selector) {
    return Array.from(root.querySelectorAll(selector))
  }

  function getDirectChildren(root, selector) {
    return Array.from(root.children).filter(child => child.matches(selector))
  }

  function getState(root) {
    if (!stateMap.has(root)) {
      stateMap.set(root, { activeIndex: 0 })
    }
    return stateMap.get(root)
  }

  function getCache(root) {
    const tablist = root.querySelector(SELECTORS.tablist)
    const panelsWrap = root.querySelector(SELECTORS.panels)

    const tabs = tablist ? getDirectChildren(tablist, SELECTORS.tab) : []
    const panels = panelsWrap ? getDirectChildren(panelsWrap, SELECTORS.panel) : []

    return { tabs, panels }
  }

  function buildTabs(root) {
    const tablist = root.querySelector(SELECTORS.tablist)
    const { panels } = getCache(root)

    if (!tablist) return

    tablist.innerHTML = ''

    panels.forEach((panel, index) => {
      const tab = document.createElement('button')
      const panelId = panel.getAttribute('data-panel-id') || panel.id
      const tabId = panel.getAttribute('data-tab-id') || `ui-tab-generated-${index}`
      const label = panel.getAttribute('data-tab-label') || `Tab ${index + 1}`

      tab.id = tabId
      tab.className = 'ui-tabs__tab'
      tab.type = 'button'
      tab.setAttribute('role', 'tab')
      tab.setAttribute('data-tab', '')
      tab.setAttribute('data-tab-controls', panelId)
      tab.setAttribute('aria-controls', panelId)
      tab.setAttribute('aria-selected', index === 0 ? 'true' : 'false')
      tab.textContent = label

      panel.setAttribute('aria-labelledby', tabId)
      tablist.appendChild(tab)
    })
  }

  function normalizeIndex(index, max) {
    if (max <= 0) return 0
    if (index < 0) return 0
    if (index >= max) return max - 1
    return index
  }

  function linkTabPanel(root, tab, index) {
    const panelId = tab.getAttribute('aria-controls')
    if (!panelId) return null
    return root.querySelector(`#${panelId}`)
  }

  function render(root) {
    const state = getState(root)
    const { tabs } = getCache(root)

    tabs.forEach((tab, index) => {
      const active = index === state.activeIndex
      const panel = linkTabPanel(root, tab, index)

      tab.dataset.state = active ? 'active' : 'inactive'
      tab.setAttribute('aria-selected', active)
      tab.setAttribute('tabindex', active ? '0' : '-1')

      if (panel) {
        panel.hidden = !active
        panel.dataset.state = active ? 'active' : 'inactive'
      }
    })
  }

  function dispatch(root, action) {
    const state = getState(root)
    const { tabs } = getCache(root)

    switch (action.type) {
      case 'SET_ACTIVE':
        state.activeIndex = normalizeIndex(action.index, tabs.length)
        render(root)
        return

      case 'NEXT':
        dispatch(root, {
          type: 'SET_ACTIVE',
          index: state.activeIndex + 1 >= tabs.length ? 0 : state.activeIndex + 1
        })
        return

      case 'PREV':
        dispatch(root, {
          type: 'SET_ACTIVE',
          index: state.activeIndex - 1 < 0 ? tabs.length - 1 : state.activeIndex - 1
        })
        return

      case 'FIRST':
        dispatch(root, { type: 'SET_ACTIVE', index: 0 })
        return

      case 'LAST':
        dispatch(root, { type: 'SET_ACTIVE', index: tabs.length - 1 })
        return
    }
  }

  function handleClick(event) {
    const target = event.target
    if (!(target instanceof Element)) return

    const tab = target.closest(SELECTORS.tab)
    if (!tab) return

    const root = tab.closest(SELECTORS.root)
    if (!root) return

    const { tabs } = getCache(root)
    const index = tabs.indexOf(tab)

    if (index < 0) return

    event.preventDefault()
    dispatch(root, { type: 'SET_ACTIVE', index })
  }

  function handleKeyDown(event) {
    const target = event.target
    if (!(target instanceof Element)) return

    const tab = target.closest(SELECTORS.tab)
    if (!tab) return

    const root = tab.closest(SELECTORS.root)
    if (!root) return

    const { tabs } = getCache(root)

    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault()
        dispatch(root, { type: 'NEXT' })
        tabs[getState(root).activeIndex]?.focus()
        break

      case 'ArrowLeft':
        event.preventDefault()
        dispatch(root, { type: 'PREV' })
        tabs[getState(root).activeIndex]?.focus()
        break

      case 'Home':
        event.preventDefault()
        dispatch(root, { type: 'FIRST' })
        tabs[getState(root).activeIndex]?.focus()
        break

      case 'End':
        event.preventDefault()
        dispatch(root, { type: 'LAST' })
        tabs[getState(root).activeIndex]?.focus()
        break
    }
  }

  function initOne(root) {
    if (!root.dataset.tabsUid) {
      root.dataset.tabsUid = crypto.randomUUID?.() || Math.random().toString(36).slice(2)
    }

    buildTabs(root)

    const state = getState(root)
    const { tabs } = getCache(root)

    if (!tabs.length) return

    const initial = Number.parseInt(root.dataset.tabsInitial || '0', 10)
    state.activeIndex = normalizeIndex(initial, tabs.length)

    render(root)
  }

  function initAll() {
    qa(document, SELECTORS.root).forEach(initOne)
  }

  document.addEventListener('click', handleClick)
  document.addEventListener('keydown', handleKeyDown)

  document.addEventListener('shopify:section:load', initAll)

  document.addEventListener('shopify:block:select', (event) => {
    const panel = event.target.closest(SELECTORS.panel)
    if (!panel) return

    const root = panel.closest(SELECTORS.root)
    if (!root) return

    const { panels } = getCache(root)
    const index = panels.indexOf(panel)

    if (index >= 0) {
      dispatch(root, { type: 'SET_ACTIVE', index })
    }
  })

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll)
  } else {
    initAll()
  }
})()
