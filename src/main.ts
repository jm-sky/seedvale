import './app/dialogueTimeControl'
import { createApp } from './app/createApp'
import { isModelTestMode } from './debug/debugMode'
import { BENCHMARK_FIXTURE } from './perf/benchmarkFixture'
import { benchmarkScenarioFromUrl, isPerfUrlEnabled } from './perf/flags'
import {
  beginNewSave,
  deleteSave,
  getActiveSaveId,
  hasUnreadableSaves,
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
  if (isModelTestMode()) {
    void createApp(container, undefined, { modelTest: true })
    return
  }

  // `?benchmark=<scenario>` boots through the deterministic fixture, not the
  // user's save — loading a save first and only overwriting time/position
  // inside benchmark.ts left the run dependent on whatever world/localStorage
  // state happened to be active (plan tools-001).
  const autoBenchmarkId = benchmarkScenarioFromUrl()
  if (autoBenchmarkId) {
    void createApp(container, undefined, { benchmarkFixture: BENCHMARK_FIXTURE })
    return
  }

  const slots = await listSaves()
  const unattended = isPerfUrlEnabled()
  if (unattended) {
    const save = await readSave()
    void createApp(container, save ?? undefined)
    return
  }

  if (slots.length === 0) {
    // A slot can exist in IndexedDB but not be listed (a newer app's save,
    // or one whose migration failed) — that must never be silently treated
    // as "no save exists" (persistence-003 §9). The record itself is never
    // at risk (writeSave()'s guard refuses to overwrite it either way), but
    // the player should know why their save didn't appear before a new
    // world starts.
    if (await hasUnreadableSaves()) {
      window.alert(
        'Znaleziono zapis gry, którego nie można wczytać w tej wersji (nowsza wersja zapisu lub nieudana migracja). '
        + 'Zapis pozostaje nienaruszony, ale nie zostanie teraz wczytany.',
      )
    }
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
        if (await hasUnreadableSaves()) {
          window.alert(
            'Znaleziono zapis gry, którego nie można wczytać w tej wersji (nowsza wersja zapisu lub nieudana migracja). '
            + 'Zapis pozostaje nienaruszony, ale nie zostanie teraz wczytany.',
          )
        }
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
