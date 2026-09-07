import type { SaveManagementEntry } from '../persistence/saveSlots'
import type { SeedChoice } from '../world/seedLibrary'
import type { StartScreenChoice } from './createStartScreen'

/**
 * @domain ui-input
 * @system start-screen
 * @role Pure boot-loop decisions for the Start Screen (plan ui-input-011
 *  §1/§2/§9). `main.ts` keeps every side effect — IndexedDB reads/deletes,
 *  seed resolution, `createApp()` — this module only says *whether* the
 *  screen stays open and, if not, which world to build.
 */

/** Shape of `listSaveManagementEntries()` this module needs — a confirmed
 *  listing (possibly empty) or a storage failure (plan persistence-004 §4). */
export type BootSaveListing =
  | { ok: true, entries: readonly SaveManagementEntry[] }
  | { ok: false }

/**
 * Ordinary boot opens the Start Screen for *every* successful save-management
 * read, including a confirmed-empty one (plan ui-input-011 §1) — zero rows is
 * a valid screen state, not an instruction to create a world. Only a genuine
 * IndexedDB/list failure bypasses the screen, which keeps the
 * persistence-004 §4 distinction (`successful read + zero rows` ≠ `read
 * failure`) intact.
 */
export function shouldOpenStartScreen<T extends BootSaveListing>(listing: T): listing is T & { ok: true } {
  return listing.ok
}

/** What the boot loop does once a Start Screen choice has settled. `stay`
 *  means: mount the screen again with the current rows, create nothing. */
export type StartScreenAction =
  | { kind: 'stay' }
  | { kind: 'newGame', name: string, playerName: string, seedChoice: SeedChoice }
  | { kind: 'loadSave', id: string }

function hasHealthy(entries: readonly SaveManagementEntry[]): boolean {
  return entries.some((entry) => entry.status === 'ok')
}

/**
 * Boot-loop decision for a settled `StartScreenChoice`.
 *
 * `entries` are the rows as they stand *after* any delete has been applied,
 * and `activeId` the slot `Kontynuuj` targets. Deleting a row never creates a
 * world — least of all the final one (plan ui-input-011 §2); nor does a
 * `continue` with nothing healthy left to continue. `newGame` carries the
 * form's values verbatim: the seed intent stays unresolved here so
 * `resolveNewGameSeed()` (and any `SeedRecord` it materializes) still happens
 * only after the player confirms `Rozpocznij` (plan §6).
 * @domain ui-input
 */
export function resolveStartScreenAction(
  choice: StartScreenChoice,
  entries: readonly SaveManagementEntry[],
  activeId: string | null,
): StartScreenAction {
  if (choice.type === 'delete') return { kind: 'stay' }
  if (choice.type === 'new') {
    return { kind: 'newGame', name: choice.name, playerName: choice.playerName, seedChoice: choice.seedChoice }
  }
  const id = choice.type === 'load' ? choice.id : activeId
  if (!id || !hasHealthy(entries)) return { kind: 'stay' }
  return { kind: 'loadSave', id }
}
