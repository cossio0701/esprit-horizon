(() => {
  if (window.__uiModalLoaded) return
  window.__uiModalLoaded = true

  const SELECTORS = {
    modal: '[data-modal]',
    trigger: '[data-modal-trigger]',
    overlay: '[data-modal-overlay]',
    dialog: '[data-modal-dialog]',
    close: '[data-modal-close]',
  }

  const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',')

  const states = new WeakMap()

  function getState(root) {
    if (!states.has(root)) {
      states.set(root, {
        isOpen: false,
        lastFocused: null,
        closeOnOverlay: root.dataset.modalCloseOverlay !== 'false',
        closeOnEsc: root.dataset.modalCloseEsc !== 'false',
      })
    }
    return states.get(root)
  }

  function q(root, sel) {
    return root.querySelector(sel)
  }

  function qa(root, sel) {
    return Array.from(root.querySelectorAll(sel))
  }

  function render(root) {
    const state = getState(root)
    const overlay = q(root, SELECTORS.overlay)

    if (overlay) overlay.hidden = !state.isOpen
    root.dataset.modalState = state.isOpen ? 'open' : 'closed'

    const triggers = document.querySelectorAll(
      `[data-modal-trigger="${root.id}"]`
    )

    triggers.forEach(trigger => {
      trigger.setAttribute(
        'aria-expanded',
        state.isOpen ? 'true' : 'false'
      )
    })
  }

  function trapFocus(root, e) {
    const dialog = q(root, SELECTORS.dialog)
    if (!dialog) return

    const focusables = qa(dialog, FOCUSABLE)
      .filter(el => el.offsetParent !== null)

    if (!focusables.length) return

    const first = focusables[0]
    const last = focusables[focusables.length - 1]

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    }

    if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  function dispatch(root, action) {
    const state = getState(root)
    const dialog = q(root, SELECTORS.dialog)

    switch (action.type) {
      case 'OPEN':
        if (state.isOpen) return
        state.isOpen = true
        state.lastFocused = document.activeElement
        render(root)
        requestAnimationFrame(() => dialog?.focus())
        break

      case 'CLOSE':
        if (!state.isOpen) return
        state.isOpen = false
        render(root)
        state.lastFocused?.focus?.()
        break

      case 'TOGGLE':
        dispatch(root, { type: state.isOpen ? 'CLOSE' : 'OPEN' })
        break
    }
  }

  function handleClick(e) {
    const trigger = e.target.closest(SELECTORS.trigger)

    if (trigger) {
      const id = trigger.dataset.modalTrigger
      const modal = document.getElementById(id)
      if (modal) dispatch(modal, { type: 'OPEN' })
      return
    }

    const close = e.target.closest(SELECTORS.close)
    if (close) {
      const modal = close.closest(SELECTORS.modal)
      dispatch(modal, { type: 'CLOSE' })
      return
    }

    const overlay = e.target.closest(SELECTORS.overlay)
    if (overlay) {
      const modal = overlay.closest(SELECTORS.modal)
      const state = getState(modal)

      if (state.closeOnOverlay && e.target === overlay) {
        dispatch(modal, { type: 'CLOSE' })
      }
    }
  }

  function handleKeydown(e) {
    const modal = document.querySelector(
      `${SELECTORS.modal}[data-modal-state="open"]`
    )
    if (!modal) return

    const state = getState(modal)

    if (e.key === 'Escape' && state.closeOnEsc) {
      dispatch(modal, { type: 'CLOSE' })
      return
    }

    if (e.key === 'Tab') {
      trapFocus(modal, e)
    }
  }

  document.addEventListener('click', handleClick)
  document.addEventListener('keydown', handleKeydown)

  qa(document, SELECTORS.modal).forEach(render)

  window.openModal = id => {
    const modal = document.getElementById(id)
    if (modal) dispatch(modal, { type: 'OPEN' })
  }

  window.closeModal = id => {
    const modal = document.getElementById(id)
    if (modal) dispatch(modal, { type: 'CLOSE' })
  }
})()
