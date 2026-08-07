import { createApp } from './app/createApp'
import { clearSave, readSave } from './persistence/saveDb'
import { createStartScreen } from './ui/createStartScreen'

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) {
  throw new Error('#app not found')
}

async function boot(container: HTMLElement): Promise<void> {
  const save = await readSave()
  if (!save) {
    void createApp(container)
    return
  }

  const startScreen = createStartScreen(container, save.savedAt)
  const choice = await startScreen.choose()
  startScreen.dispose()

  if (choice === 'continue') {
    void createApp(container, save)
  } else {
    await clearSave()
    void createApp(container)
  }
}

void boot(root)
