import './app/dialogueTimeControl'
import { createApp } from './app/createApp'
import { createWorldConfig } from './config/worldConfig'
import { isModelTestMode } from './debug/debugMode'
import { BENCHMARK_FIXTURE } from './perf/benchmarkFixture'
import { benchmarkScenarioFromUrl, isPerfUrlEnabled } from './perf/flags'
import {
  beginNewSave,
  deleteSave,
  getActiveSaveId,
  listSaveManagementEntries,
  readSave,
  type SaveManagementEntry,
  setActiveSaveId,
} from './persistence/saveDb'
import { pickActiveSaveId, type SaveSlotInfo } from './persistence/saveSlots'
import { createStartScreen } from './ui/createStartScreen'
import { rawSampleParamsFromWorld } from './world/map/mapProjection'
import { ensureSeedRecordsForSeeds, listSeedRecords, resolveNewGameSeed, touchSeedLastUsed } from './world/seedLibrary'

/** Healthy subset of a save-management listing — the only rows `Continue`/
 *  `pickActiveSaveId` can ever target (plan persistence-004 §5). */
function healthyEntries(entries: readonly SaveManagementEntry[]): SaveSlotInfo[] {
  return entries.filter((e): e is SaveSlotInfo & { status: 'ok' } => e.status === 'ok')
}

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

  const unattended = isPerfUrlEnabled()
  if (unattended) {
    const save = await readSave()
    void createApp(container, save ?? undefined)
    return
  }

  const initialManagement = await listSaveManagementEntries()
  if (!initialManagement.ok) {
    // A genuine IndexedDB failure must never look like "confirmed zero
    // saves" (plan persistence-004 §4) — any real saves are untouched either
    // way (`writeSave()`'s own integrity guard doesn't depend on how boot
    // got here), but the player should know before a new world starts.
    window.alert(
      'Nie udało się odczytać zapisów gry (błąd IndexedDB). Jeśli zapisy istnieją, pozostają nienaruszone.',
    )
    void createApp(container)
    return
  }

  if (initialManagement.entries.length === 0) {
    // Totally fresh install, no save at all yet (plan world-015 §3/notes §4)
    // — `createApp(container)` below resolves its own seed exactly the way
    // `createWorldConfig()` does here (no `initialSave`, no `newGame`), so
    // this backfills a minimal `SeedRecord` for that same number without
    // opening any management UI or generating a world twice.
    void ensureSeedRecordsForSeeds([createWorldConfig().seed])
    void createApp(container)
    return
  }

  // Lazy backfill (plan §3/§13) for every healthy save's seed — a save
  // written before the Seed Library existed gets a minimal record here,
  // never a world scan; user metadata on an existing record is untouched.
  await ensureSeedRecordsForSeeds(healthyEntries(initialManagement.entries).map((slot) => slot.seed))
  const seeds = await listSeedRecords()

  // A slot can exist in IndexedDB but not be listed among healthy ones (a
  // newer app's save, one whose migration failed, or genuinely malformed
  // data) — that must never be silently treated as "no save exists"
  // (persistence-003 §9) or hidden from the player (persistence-004 §5): an
  // unhealthy entry stays visible/deletable in the picker below rather than
  // behind a one-shot alert, even when there is no healthy slot to continue.
  let currentEntries = initialManagement.entries
  for (;;) {
    const activeId = pickActiveSaveId(getActiveSaveId(), healthyEntries(currentEntries))
    const startScreen = createStartScreen(container, currentEntries, activeId, seeds)
    const choice = await startScreen.choose()
    startScreen.dispose()

    if (choice.type === 'delete') {
      await deleteSave(choice.id)
      const next = await listSaveManagementEntries()
      currentEntries = next.ok ? next.entries : currentEntries.filter((e) => e.id !== choice.id)
      if (currentEntries.length === 0) {
        void createApp(container, undefined, { newGame: true })
        return
      }
      continue
    }

    if (choice.type === 'new') {
      beginNewSave(choice.name)
      const seed = await resolveNewGameSeed(choice.seedChoice, (s) => rawSampleParamsFromWorld({ ...createWorldConfig(), seed: s }))
      void createApp(container, undefined, { newGame: true, seed })
      return
    }

    const loadId = choice.type === 'load' ? choice.id : activeId
    if (!loadId) {
      void createApp(container, undefined, { newGame: true })
      return
    }
    setActiveSaveId(loadId)
    const save = await readSave(loadId)
    if (save) void touchSeedLastUsed(save.config.seed)
    void createApp(container, save ?? undefined)
    return
  }
}

void boot(root)
