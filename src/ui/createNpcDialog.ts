import { getMountedVueUi } from '../ui-vue/mount'

export type NpcDialogHandlers = { onClose?: () => void }
export type NpcDialogOffer = { onAccept: () => void; onDecline: () => void }
export type NpcDialog = {
  setPrompt: (text: string | null, highlighted?: boolean) => void
  open: (name: string, line: string, offer?: NpcDialogOffer) => void
  isOffer: () => boolean
  accept: () => void
  close: () => void
  isOpen: () => boolean
  dispose: () => void
}

/** Compatibility facade for the legacy flavor-text dialog. Quest/dialogue
 * offers now belong to the dedicated Vue NPC dialogue menu. */
export function createNpcDialog(_parent: HTMLElement, handlers: NpcDialogHandlers = {}): NpcDialog {
  let disposed = false
  let currentOffer: NpcDialogOffer | null = null
  const getUi = () => getMountedVueUi()
  const close = () => {
    if (disposed) return
    getUi()?.closeFlavorDialog()
    const offer = currentOffer
    currentOffer = null
    offer?.onDecline()
    handlers.onClose?.()
  }
  return {
    setPrompt: (text, highlighted) => { if (!disposed) getUi()?.setFlavorPrompt(text, highlighted) },
    open: (name, line, offer) => { if (!disposed) { currentOffer = offer ?? null; getUi()?.openFlavorDialog(name, line) } },
    isOffer: () => !disposed && currentOffer !== null && (getUi()?.isFlavorDialogOpen() ?? false),
    accept: () => { if (!disposed && currentOffer) { const offer = currentOffer; currentOffer = null; getUi()?.closeFlavorDialog(); offer.onAccept(); handlers.onClose?.() } },
    close,
    isOpen: () => !disposed && (getUi()?.isFlavorDialogOpen() ?? false),
    dispose: () => { if (!disposed) { disposed = true; currentOffer = null; getUi()?.closeFlavorDialog() } },
  }
}
