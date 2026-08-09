import type { App } from 'vue'

export type VueUi = {
  dispose: () => void
}

/** Mounts the Vue + Tailwind UI overlay (plan 046) into a new `#vue-ui` div
 *  appended to `container`. Vue/`App.vue`/Tailwind are all dynamically
 *  imported here (not at this module's top level) so the extra runtime
 *  doesn't delay first paint of the game itself (canvas + first terrain
 *  chunk) — fetched as their own chunk in parallel instead. */
export function mountVueUi(container: HTMLElement): VueUi {
  const root = document.createElement('div')
  root.id = 'vue-ui'
  container.appendChild(root)

  let app: App | null = null
  let disposed = false

  void Promise.all([import('vue'), import('./App.vue'), import('./tailwind.css')]).then(
    ([{ createApp }, { default: RootUi }]) => {
      if (disposed) return
      app = createApp(RootUi)
      app.mount(root)
    },
  )

  return {
    dispose() {
      disposed = true
      app?.unmount()
      root.remove()
    },
  }
}
