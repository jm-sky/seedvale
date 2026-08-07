export type LoadingScreen = {
  /** Fades out and removes the overlay — call once the first real frame has rendered. */
  hide: () => void
}

/**
 * Covers the canvas while the world's initial chunks + settlement/fauna GLTF assets
 * load — without it, that startup work (worth several seconds, especially cold-cache)
 * shows nothing but the page's plain sky-blue background.
 */
export function createLoadingScreen(parent: HTMLElement): LoadingScreen {
  const root = document.createElement('div')
  root.className = 'seedvale-loading'
  root.innerHTML = `
    <div class="seedvale-loading__spinner"></div>
    <div class="seedvale-loading__text">Budowanie świata…</div>
  `
  parent.appendChild(root)

  return {
    hide() {
      root.classList.add('seedvale-loading--hidden')
      root.addEventListener('transitionend', () => root.remove(), { once: true })
    },
  }
}
