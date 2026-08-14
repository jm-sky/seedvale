import './app/dialogueTimeControl'
import { createApp } from './app/createApp'
import { benchmarkScenarioFromUrl, isPerfUrlEnabled } from './perf/flags'
import { clearSave, readSave } from './persistence/saveDb'
import { createStartScreen } from './ui/createStartScreen'

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) {
  throw new Error('#app not found')
}

async function boot(container: HTMLElement): Promise<void> {
  const save = await readSave()
  // Unattended `?benchmark=` runs should not sit on the continue/new menu.
  const unattended = Boolean(benchmarkScenarioFromUrl() || isPerfUrlEnabled())
  if (save && !unattended) {
    const startScreen = createStartScreen(container, save.savedAt)
    const choice = await startScreen.choose()
    startScreen.dispose()

    if (choice === 'continue') {
      void createApp(container, save)
    } else {
      await clearSave()
      void createApp(container)
    }
    return
  }

  void createApp(container, save ?? undefined)
}

void boot(root)
