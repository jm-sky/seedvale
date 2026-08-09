import type { App } from 'vue'

type StoreModule = typeof import('./store')

/** Every store function `createApp.ts`/vanilla code needs to call — add new
 *  screens' function names here as they migrate (plan 046). Kept as one
 *  list instead of per-function forwarders so a new screen doesn't need
 *  hand-written boilerplate in this file. */
const FORWARDED_FNS = [
  'openNpcDialogueMenu',
  'closeNpcDialogueMenu',
  'acceptNpcDialogueOffer',
  'isNpcDialogueMenuOpen',
  'openVillagers',
  'closeVillagers',
  'toggleVillagers',
  'refreshVillagers',
  'isVillagersOpen',
  'openInventory',
  'refreshInventory',
  'isInventoryOpen',
  'closeInventory',
] as const

export type VueUi = Pick<StoreModule, typeof FORWARDED_FNS[number]> & { dispose: () => void }

let mountedVueUi: VueUi | null = null

/** Used by `src/ui/createInventoryScreen.ts` — a thin compatibility adapter
 *  kept instead of wiring `createApp.ts` directly to the store (unlike the
 *  Villagers screen). Safe to call from anywhere: `open`/`refresh`/`close`
 *  are all called lazily at runtime, by which point `mountVueUi` has always
 *  already run and set this. */
export function getMountedVueUi(): VueUi | null {
  return mountedVueUi
}

/** Mounts the Vue + Tailwind UI overlay (plan 046) into a new `#vue-ui` div
 *  appended to `container`. Vue/`App.vue`/`store.ts`/Tailwind are all
 *  dynamically imported here (not at this module's top level, and not by
 *  `createApp.ts` or any other synchronously-loaded vanilla module — see
 *  `store.ts`'s own doc comment) so the extra runtime doesn't delay first
 *  paint. Calls made before the dynamic import resolves are queued and
 *  replayed in order once it does (in practice unreachable — the import
 *  starts before any of the game's own heavy async setup, which takes far
 *  longer than fetching this small chunk — but correct either way, unlike
 *  silently dropping early calls). */
export function mountVueUi(container: HTMLElement): VueUi {
  const root = document.createElement('div')
  root.id = 'vue-ui'
  container.appendChild(root)

  let app: App | null = null
  let disposed = false
  let impl: StoreModule | null = null
  const queue: Array<() => void> = []

  void Promise.all([
    import('vue'),
    import('./App.vue'),
    import('./store'),
    import('./tailwind.css'),
  ]).then(([{ createApp }, { default: RootUi }, store]) => {
    if (disposed) return
    impl = store
    app = createApp(RootUi)
    app.mount(root)
    for (const fn of queue) fn()
    queue.length = 0
  })

  const forwarded = Object.fromEntries(
    FORWARDED_FNS.map((name) => [
      name,
      (...args: unknown[]) => {
        if (impl) return (impl[name] as (...a: unknown[]) => unknown)(...args)
        queue.push(() => (impl![name] as (...a: unknown[]) => unknown)(...args))
        return undefined
      },
    ]),
  ) as Pick<StoreModule, typeof FORWARDED_FNS[number]>

  const api: VueUi = {
    ...forwarded,
    dispose() {
      disposed = true
      app?.unmount()
      if (mountedVueUi === api) mountedVueUi = null
      root.remove()
    },
  }

  mountedVueUi = api
  return api
}
