import { createApp, ref } from 'vue'
import AssetBrowser from './ui/AssetBrowser.vue'
import { type AssetViewer, createViewer } from './viewer/createViewer'
import '../../ui-vue/tailwind.css'

const root = document.getElementById('asset-browser-root')
if (!root) throw new Error('#asset-browser-root missing')

const viewerRef = ref<AssetViewer | null>(null)

const app = createApp(AssetBrowser, { viewerRef })
app.mount(root)

// Viewer mounts once the Vue component exposes its viewport element.
const observer = new MutationObserver(() => {
  const host = document.getElementById('asset-browser-viewport')
  if (!host || viewerRef.value) return
  viewerRef.value = createViewer(host)
  window.addEventListener('resize', () => viewerRef.value?.resize())
  observer.disconnect()
})
observer.observe(root, { childList: true, subtree: true })
