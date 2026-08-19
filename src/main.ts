import './app/dialogueTimeControl'
import { createApp } from './app/createApp'
import { benchmarkScenarioFromUrl, isPerfUrlEnabled } from './perf/flags'
import {
  beginNewSave,
  deleteSave,
  getActiveSaveId,
  listSaves,
  readSave,
  setActiveSaveId,
} from './persistence/saveDb'
import { pickActiveSaveId } from './persistence/saveSlots'
import { createStartScreen } from './ui/createStartScreen'

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) {
  throw new Error('#app not found')
}

async function boot(container: HTMLElement): Promise<void> {
  const slots = await listSaves()
  const unattended = Boolean(benchmarkScenarioFromUrl() || isPerfUrlEnabled())
  if (unattended) {
    const save = await readSave()
    void createApp(container, save ?? undefined)
    return
  }

  if (slots.length === 0) {
    void createApp(container)
    return
  }

  let currentSlots = slots
  for (;;) {
    const activeId = pickActiveSaveId(getActiveSaveId(), currentSlots)
    const startScreen = createStartScreen(container, currentSlots, activeId)
    const choice = await startScreen.choose()
    startScreen.dispose()

    if (choice.type === 'delete') {
      await deleteSave(choice.id)
      currentSlots = await listSaves()
      if (currentSlots.length === 0) {
        void createApp(container, undefined, { newGame: true })
        return
      }
      continue
    }

    if (choice.type === 'new') {
      beginNewSave(choice.name)
      void createApp(container, undefined, { newGame: true })
      return
    }

    const loadId = choice.type === 'load' ? choice.id : activeId
    if (!loadId) {
      void createApp(container, undefined, { newGame: true })
      return
    }
    setActiveSaveId(loadId)
    const save = await readSave(loadId)
    void createApp(container, save ?? undefined)
    return
  }
}

void boot(root)
