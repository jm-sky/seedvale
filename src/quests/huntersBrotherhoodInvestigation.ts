import type { PreySpawner } from '../fauna/AnimalSpawner'
import type { HabitatPressureCondition, HabitatPressureKind, HabitatPressureSnapshot } from '../fauna/habitatPressure'
import type { QuestDef, QuestHabitatPressureObservation } from './quests'
import { HABITAT_PRESSURE_STRAINED_AT, HABITAT_PRESSURE_TIE_ORDER } from '../fauna/habitatPressure'
import {
  HUNTERS_BROTHERHOOD_JOINED_OUTCOME,
  type HuntersBrotherhoodBinding,
  huntersBrotherhoodIntroductionQuestId,
} from './huntersBrotherhoodIntroduction'

const HUNTERS_BROTHERHOOD_INVESTIGATION_PREFIX = 'hunters-brotherhood-investigation:'

/** Single story outcome regardless of diagnosed pressure kind — see
 *  `deriveBrotherhoodHabitatDiagnosis`; the diagnosis is investigation
 *  data, never a family of terminal outcomes. */
export const HUNTERS_BROTHERHOOD_INVESTIGATION_COMPLETE_OUTCOME = 'brotherhood_investigation_complete'

/**
 * Stable investigation quest id — encodes the chosen habitat so an
 * accepted quest's identity (and any persisted progress referencing it)
 * survives a `WorldBundle` rebuild that reconstructs the same binding and
 * candidate set (plan quests-progression-049).
 *
 * @domain quests-progression
 */
export function huntersBrotherhoodInvestigationQuestId(
  homeSettlementId: string,
  inviterNpcId: string,
  spawnerId: string,
): string {
  return `${HUNTERS_BROTHERHOOD_INVESTIGATION_PREFIX}${homeSettlementId}:${inviterNpcId}:${spawnerId}`
}

/**
 * Bounded deer-thicket candidate set for one Brotherhood binding — only
 * the two bound settlements' thickets, never a world scan.
 *
 * @domain quests-progression
 */
export function huntingGroundCandidateSpawners(
  binding: HuntersBrotherhoodBinding,
  spawners: readonly PreySpawner[],
): readonly PreySpawner[] {
  const settlementPrefixes = [
    `${binding.homeSettlementId}:`,
    `${binding.secondSettlementId}:`,
  ]
  return spawners.filter((spawner) => (
    spawner.type === 'thicket'
    && spawner.kind === 'deer'
    && settlementPrefixes.some((prefix) => spawner.id.startsWith(prefix))
  ))
}

function severityRank(condition: HabitatPressureCondition): number {
  return condition === 'critical' ? 2 : condition === 'strained' ? 1 : 0
}

function maxComponentPressure(snapshot: HabitatPressureSnapshot): number {
  return Math.max(
    snapshot.population.pressure,
    snapshot.mortality.pressure,
    snapshot.predators.pressure,
    snapshot.food.pressure,
  )
}

export type HuntingGroundCandidate = {
  spawnerId: string
  snapshot: HabitatPressureSnapshot
}

/**
 * Deterministic candidate order: `critical` before `strained`, then
 * stronger max component pressure, then a stable `spawnerId` tie-break —
 * never iteration order (plan quests-progression-049).
 *
 * @domain quests-progression
 */
export function rankHuntingGroundCandidates(
  candidates: readonly HuntingGroundCandidate[],
): readonly HuntingGroundCandidate[] {
  return [...candidates].sort((a, b) => (
    severityRank(b.snapshot.condition) - severityRank(a.snapshot.condition)
    || maxComponentPressure(b.snapshot) - maxComponentPressure(a.snapshot)
    || (a.spawnerId < b.spawnerId ? -1 : a.spawnerId > b.spawnerId ? 1 : 0)
  ))
}

/**
 * Picks one real, currently-unhealthy deer thicket from the Brotherhood's
 * bounded candidate set, or `undefined` when none qualifies — a healthy
 * habitat is never a V1 investigation target (plan quests-progression-049).
 *
 * @domain quests-progression
 */
export function selectHuntingGroundSpawnerId(
  binding: HuntersBrotherhoodBinding,
  spawners: readonly PreySpawner[],
  getHabitatPressure: (spawnerId: string, nowDays: number) => HabitatPressureSnapshot | null,
  nowDays: number,
): string | undefined {
  const candidates: HuntingGroundCandidate[] = []
  for (const spawner of huntingGroundCandidateSpawners(binding, spawners)) {
    const snapshot = getHabitatPressure(spawner.id, nowDays)
    if (!snapshot || snapshot.condition === 'healthy') continue
    candidates.push({ spawnerId: spawner.id, snapshot })
  }
  if (candidates.length === 0) return undefined
  return rankHuntingGroundCandidates(candidates)[0]!.spawnerId
}

export type BrotherhoodHabitatDiagnosis = {
  condition: HabitatPressureCondition
  primary: HabitatPressureKind | null
  observedPressures: readonly HabitatPressureKind[]
}

/**
 * Narrative diagnosis from a live `fauna-031` snapshot — reuses its
 * significance threshold/tie order rather than authoring a second one.
 * `primary` mirrors `dominantPressure`; `observedPressures` are every
 * component pressure meeting the same significance bar, in tie order
 * (plan quests-progression-049).
 *
 * @domain quests-progression
 */
export function deriveBrotherhoodHabitatDiagnosis(snapshot: HabitatPressureSnapshot): BrotherhoodHabitatDiagnosis {
  const values: Record<HabitatPressureKind, number> = {
    mortality: snapshot.mortality.pressure,
    'population-loss': snapshot.population.pressure,
    predators: snapshot.predators.pressure,
    'food-shortage': snapshot.food.pressure,
  }
  const observedPressures = HABITAT_PRESSURE_TIE_ORDER.filter((kind) => values[kind] >= HABITAT_PRESSURE_STRAINED_AT)
  return {
    condition: snapshot.condition,
    primary: snapshot.dominantPressure,
    observedPressures,
  }
}

/**
 * Turns a live snapshot into the compact, persistable observation quest
 * progress stores — never the full snapshot itself (plan
 * quests-progression-049).
 *
 * @domain quests-progression
 */
export function habitatPressureObservationFromSnapshot(
  snapshot: HabitatPressureSnapshot,
): QuestHabitatPressureObservation {
  const diagnosis = deriveBrotherhoodHabitatDiagnosis(snapshot)
  return {
    type: 'habitat_pressure',
    habitatId: snapshot.habitatId,
    condition: diagnosis.condition,
    primary: diagnosis.primary,
    observedPressures: diagnosis.observedPressures,
  }
}

/** Neutral, non-accusatory phrasing per symptom — mortality/predators/food
 *  are stated as observed facts, never as proven causes (plan
 *  quests-progression-049's mortality-semantics constraint). */
const PRESSURE_OBSERVATION_LABELS: Record<HabitatPressureKind, string> = {
  'population-loss': 'stado wyraźnie się skurczyło',
  mortality: 'ostatnio padło sporo zwierząt',
  predators: 'w okolicy kręcą się drapieżniki',
  'food-shortage': 'zwierzynie brakuje tu pożywienia',
}

/**
 * One centralized significance-to-text rule for the investigation report —
 * the only place that turns a diagnosis into dialogue, so no per-quest
 * threshold gets re-authored elsewhere (plan quests-progression-049).
 *
 * @domain quests-progression
 */
export function describeBrotherhoodHabitatDiagnosis(diagnosis: BrotherhoodHabitatDiagnosis): string {
  if (diagnosis.condition === 'healthy') {
    return 'Sytuacja się ustabilizowała — zagajnik wygląda teraz spokojnie, zwierzyna wróciła.'
  }
  const secondary = diagnosis.observedPressures.filter((kind) => kind !== diagnosis.primary)
  const symptoms = diagnosis.primary
    ? [PRESSURE_OBSERVATION_LABELS[diagnosis.primary], ...secondary.map((kind) => PRESSURE_OBSERVATION_LABELS[kind])]
    : ['coś tu wyraźnie nie gra, choć trudno wskazać jedną wyraźną przyczynę']
  const severity = diagnosis.condition === 'critical' ? 'Stan jest poważny' : 'Widać wyraźne napięcie'
  return `${severity}: ${symptoms.join(', ')}. To, co za tym stoi, zostaje niepewne — nie oskarżam nikogo bez dowodów.`
}

function describeInvestigationReport(
  binding: HuntersBrotherhoodBinding,
  observation: QuestHabitatPressureObservation | undefined,
): string {
  if (!observation) {
    return `${binding.masterName} kiwa głową. — Dobrze, że tam byłeś. Rozejrzę się sam, kiedy będę mógł.`
  }
  const diagnosis: BrotherhoodHabitatDiagnosis = {
    condition: observation.condition,
    primary: observation.primary,
    observedPressures: observation.observedPressures,
  }
  return `${binding.masterName} słucha uważnie. — ${describeBrotherhoodHabitatDiagnosis(diagnosis)}`
}

function materializeHuntersBrotherhoodInvestigationQuest(
  binding: HuntersBrotherhoodBinding,
  spawnerId: string,
): QuestDef {
  const master = { npcId: binding.masterNpcId }
  return {
    id: huntersBrotherhoodInvestigationQuestId(binding.homeSettlementId, binding.inviterNpcId, spawnerId),
    title: 'Niepokojące łowisko',
    description:
      `${binding.masterName} niepokoi się o jeden z zagajników, gdzie zwykle żerują sarny. `
      + 'Prosi, żebyś tam poszedł i sam zobaczył, co się dzieje.',
    giverName: binding.masterName,
    giver: master,
    settlementId: binding.homeSettlementId,
    availability: {
      prerequisites: [{
        type: 'quest_outcome',
        questId: huntersBrotherhoodIntroductionQuestId(binding.homeSettlementId, binding.inviterNpcId),
        outcomeIds: [HUNTERS_BROTHERHOOD_JOINED_OUTCOME],
      }],
    },
    offer: { exposure: 'story' },
    offerLine:
      'Jeden z naszych zagajników sprawia ostatnio kłopot — coś tam jest nie tak ze zwierzyną. '
      + 'Pójdź, obejrzyj to na miejscu i powiedz mi, co naprawdę widziałeś.',
    stages: [
      {
        objective: { type: 'interact_spawner', spawnerType: 'thicket', spawnerId },
        description: 'Obejrzyj wskazany zagajnik i to, co dzieje się z tamtejszą zwierzyną.',
        reminderLine: 'Byłeś już przy tym zagajniku, o którym mówiłem?',
        progressLine: 'Przyglądasz się uważnie zagajnikowi — stadu, śladom, temu, co jest, a czego brakuje.',
      },
    ],
    reportPromptLine: 'No i? Co tam znalazłeś?',
    reportPlayerLine: 'Obejrzałem to miejsce dokładnie. Oto, co widziałem.',
    reportLine: 'Dziękuję. Dobrze wiedzieć, jak jest naprawdę.',
    outcomes: [
      {
        id: HUNTERS_BROTHERHOOD_INVESTIGATION_COMPLETE_OUTCOME,
        state: 'complete',
        resolveResultText: (observation) => describeInvestigationReport(binding, observation),
        consequences: {
          relations: [{ npc: master, delta: 1 }],
          social: { reputation: { competence: 2, trust: 2 }, renown: 2 },
        },
      },
    ],
  }
}

export type HuntersBrotherhoodInvestigationInput = {
  binding: HuntersBrotherhoodBinding
  spawners: readonly PreySpawner[]
  getHabitatPressure: (spawnerId: string, nowDays: number) => HabitatPressureSnapshot | null
  nowDays: number
}

/**
 * Materializes the hunting-ground investigation quest for one resolved
 * Brotherhood binding, or `undefined` when no bound-settlement deer
 * thicket currently has a meaningful problem — the quest must not be
 * fabricated to advance the story (plan quests-progression-049).
 *
 * @domain quests-progression
 */
export function buildHuntersBrotherhoodInvestigationQuest(
  input: HuntersBrotherhoodInvestigationInput,
): QuestDef | undefined {
  const spawnerId = selectHuntingGroundSpawnerId(
    input.binding,
    input.spawners,
    input.getHabitatPressure,
    input.nowDays,
  )
  if (!spawnerId) return undefined
  return materializeHuntersBrotherhoodInvestigationQuest(input.binding, spawnerId)
}
