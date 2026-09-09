import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  closeFlavorDialog,
  configureFlavorDialog,
  isFlavorDialogOpen,
  openFlavorDialog,
} from './store'

describe('FlavorDialog lifecycle', () => {
  const onOpen = vi.fn()
  const onClose = vi.fn()

  afterEach(() => {
    closeFlavorDialog()
    configureFlavorDialog({})
    onOpen.mockClear()
    onClose.mockClear()
  })

  it('calls onOpen once when transitioning closed → open', () => {
    configureFlavorDialog({ onOpen, onClose })
    openFlavorDialog('Title', 'Line')
    expect(isFlavorDialogOpen()).toBe(true)
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose when closing an open dialog', () => {
    configureFlavorDialog({ onOpen, onClose })
    openFlavorDialog('Title', 'Line')
    closeFlavorDialog()
    expect(isFlavorDialogOpen()).toBe(false)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onOpen when replacing content on an already-open dialog', () => {
    configureFlavorDialog({ onOpen, onClose })
    openFlavorDialog('First', 'Line')
    openFlavorDialog('Second', 'Line')
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('calls onOpen again after a close→open chain (synchronous handoff)', () => {
    configureFlavorDialog({ onOpen, onClose })
    openFlavorDialog('First', 'Line')
    closeFlavorDialog()
    openFlavorDialog('Second', 'Line', [{ label: 'Next', enabled: true, reasonLabel: '', run: () => {} }])
    expect(onOpen).toHaveBeenCalledTimes(2)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(isFlavorDialogOpen()).toBe(true)
  })
})

describe('FlavorDialog pointer-lock restore scheduling', () => {
  it('defers restore until after a synchronous close→open chain', async () => {
    let dialogOpen = false
    let restoreCount = 0

    const tryRestore = (): void => {
      queueMicrotask(() => {
        if (dialogOpen) return
        restoreCount += 1
      })
    }

    dialogOpen = true
    dialogOpen = false
    tryRestore()
    dialogOpen = true

    await Promise.resolve()
    expect(restoreCount).toBe(0)

    dialogOpen = false
    tryRestore()
    await Promise.resolve()
    expect(restoreCount).toBe(1)
  })
})
