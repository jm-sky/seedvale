import type { TreeGrowthStage } from '../world/treeLifecycle'

const LIVING_TREE_FLAVOR = [
  'Stare, sękate drzewo.',
  'Liście szumią na wietrze.',
  'Kora pachnie żywicą.',
] as const

const SAPLING_FLAVOR = [
  'Młode drzewko ledwo wystaje z ziemi.',
  'Delikatne listki drżą na wietrze.',
  'Sadzonka wygląda na zdrową.',
] as const

const YOUNG_FLAVOR = [
  'Młode drzewo dopiero nabiera kształtu.',
  'Gałęzie są jeszcze cienkie i giętkie.',
  'Korona dopiero się zagęszcza.',
] as const

const LIMBED_FLAVOR = [
  'Pień stoi ogołocony z gałęzi.',
  'Został sam pień — bez korony.',
  'Widać świeże ślady siekiery na pniu.',
] as const

const FELLED_FLAVOR = [
  'Pień leży obok niskiego pniaka.',
  'Kłoda leży na ziemi, pniak sterczy obok.',
  'Drzewo zostało ścięte — zostało tylko do porąbania.',
] as const

const HARVESTED_FLAVOR = [
  'Został sam niski pień.',
  'Pniak — z drzewa prawie nic nie zostało.',
  'Tylko pień wystaje z ziemi.',
] as const

function pickFrom(pool: readonly string[]): string {
  return pool[Math.floor(Math.random() * pool.length)]!
}

/** Flavor line + speaker label for tree inspection, keyed by lifecycle stage. */
export function treeInspectionFlavor(stage: TreeGrowthStage | undefined): {
  speakerName: string
  line: string
} {
  switch (stage) {
    case 'felled':
      return { speakerName: 'Pień', line: pickFrom(FELLED_FLAVOR) }
    case 'harvested':
      return { speakerName: 'Pień', line: pickFrom(HARVESTED_FLAVOR) }
    case 'limbed':
      return { speakerName: 'Pień', line: pickFrom(LIMBED_FLAVOR) }
    case 'sapling':
      return { speakerName: 'Drzewko', line: pickFrom(SAPLING_FLAVOR) }
    case 'young':
      return { speakerName: 'Drzewo', line: pickFrom(YOUNG_FLAVOR) }
    case 'mature':
    case undefined:
    default:
      return { speakerName: 'Drzewo', line: pickFrom(LIVING_TREE_FLAVOR) }
  }
}

/** Inspection branch chance only makes sense while the tree still has a living crown. */
export function treeInspectionCanYieldBranch(stage: TreeGrowthStage | undefined): boolean {
  return stage === undefined || stage === 'sapling' || stage === 'young' || stage === 'mature'
}
