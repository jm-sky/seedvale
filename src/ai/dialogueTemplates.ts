import type { FamilyMemberRef, FamilyRelation, VillageSize } from '../settlement/families'
import type { FoodSourceType } from '../settlement/settlementGenerator'
import type { SettlementTerrain } from '../shared/SettlementName'
import type { NaturalResource, ResourceType } from '../terrain/naturalResources'
import type { Role } from './characters'
import type { Personality } from './dialogue'
import type { NeedId } from './Needs'
import type { CurrentActivity, CurrentActivityKind } from './NpcAgent'

/**
 * New topics for the NPC dialogue menu (`docs/plans/archive/2026-08-09--048--npc-dialogues-v2.md`)
 * — deliberately a separate module from `dialogue.ts` (needs-based flavor
 * lines, reused as-is for the "help" topic) rather than an extension of it.
 * Every function here is pure: plain data in, a ready-to-show Polish
 * sentence out — no `NpcAgent`/`QuestManager` access, so callers (the Vue
 * menu) own fetching the actual data and any side effects (`QuestManager
 * .onInteract`, in particular, is NOT called from here — see the plan's
 * "help" decision).
 *
 * Role/relation/village labels are *not* gendered (e.g. "Jestem drwalem"
 * for every gender, "dziecko" instead of "syn"/"córka") and family names
 * are used in nominative case ("mam rodzinę: żona Anna") rather than
 * correctly declined per name — both are accepted simplifications for v1
 * flavor text, not a claim of grammatical correctness.
 */

function pick(pool: readonly string[]): string {
  return pool[Math.floor(Math.random() * pool.length)]!
}

function capitalize(text: string): string {
  return text.length > 0 ? text[0]!.toUpperCase() + text.slice(1) : text
}

function formatHour(hour: number): string {
  const h = Math.floor(hour) % 24
  const m = Math.round((hour - Math.floor(hour)) * 60) % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// --- "Powiedz coś o sobie." ---

/** Instrumental case, lowercase — every template says "Jestem {rola}". */
const ROLE_LABEL: Record<Role, string> = {
  woodcutter: 'drwalem',
  farmer: 'rolnikiem',
  guard: 'strażnikiem',
  trader: 'kupcem',
  miner: 'górnikiem',
  fisher: 'rybakiem',
  hunter: 'myśliwym',
}

const RELATION_LABEL: Record<FamilyRelation, string> = {
  husband: 'mąż',
  wife: 'żona',
  child: 'dziecko',
  single: '',
}

/** "" for a `single` member (no family to mention) — callers check for that. */
export function familyPhrase(familyMembers: readonly FamilyMemberRef[]): string {
  if (familyMembers.length === 0) return ''
  return familyMembers.map((m) => `${RELATION_LABEL[m.relation]} ${m.name}`).join(', ')
}

export function aboutSelfLine(
  displayName: string,
  role: Role,
  familyMembers: readonly FamilyMemberRef[],
  archetype: Personality,
): string {
  const roleWord = ROLE_LABEL[role]
  const family = familyPhrase(familyMembers)
  const familyClause = family ? ` Mam rodzinę: ${family}.` : ''
  switch (archetype) {
    case 'calm':
      return `Jestem ${displayName}. Jestem ${roleWord}.${familyClause}`
    case 'cheerful':
      return `Nazywam się ${displayName}. Jestem ${roleWord} i bardzo to lubię!${familyClause}`
    case 'curious':
      return `Jestem ${displayName}. Jestem ${roleWord}, a Ty? Skąd tu jesteś?${familyClause}`
    case 'grumpy':
      return `${displayName}. Jestem ${roleWord}. Co jeszcze chcesz wiedzieć?${familyClause}`
  }
}

// --- "Co teraz robisz?" ---

const ACTIVITY_LABEL: Record<Exclude<CurrentActivityKind, 'need'>, string> = {
  sleep: 'śpię',
  work: 'pracuję',
  eat: 'jem',
  wander: 'przechadzam się po okolicy',
  talking: 'akurat z Tobą rozmawiam',
  idle: 'nic szczególnego nie robię',
  combat: 'walczę',
}

const NEED_ACTIVITY_LABEL: Record<NeedId, string> = {
  water: 'idę po wodę',
  waterDuty: 'napełniam beczkę z wodą',
  food: 'szukam jedzenia',
  wood: 'zajmuję się drewnem',
  idle: 'nic szczególnego nie robię',
}

export function currentActivityLine(activity: CurrentActivity, archetype: Personality): string {
  const base = activity.kind === 'need' ? NEED_ACTIVITY_LABEL[activity.need ?? 'idle'] : ACTIVITY_LABEL[activity.kind]
  const until = activity.endHour !== undefined ? ` Powinienem skończyć koło ${formatHour(activity.endHour)}.` : ''
  switch (archetype) {
    case 'calm':
      return `${capitalize(base)}, bez pośpiechu.${until}`
    case 'cheerful':
      return `${capitalize(base)}!${until}`
    case 'curious':
      return `${capitalize(base)} — a Ty co porabiasz?${until}`
    case 'grumpy':
      return `${capitalize(base)}. A co?${until}`
  }
}

// --- "Powiedz coś o wiosce." ---

const SIZE_LABEL: Record<VillageSize, string> = {
  SM: 'mała',
  MD: 'średnia',
  LG: 'spora',
  XL: 'wielka',
  OUTPOST: 'samotna',
}

const TERRAIN_LABEL: Record<SettlementTerrain, string> = {
  ocean: 'blisko morza',
  mountain: 'w górach',
  swamp: 'na bagnach',
  desert: 'na pustkowiu',
  forest: 'wśród lasów',
}

const FOOD_SOURCE_LABEL: Record<FoodSourceType, string> = {
  field: 'pola uprawne',
  fishing: 'rybołówstwo',
  foraging: 'zbieractwo',
  garden: 'ogrody',
}

const RESOURCE_LABEL: Record<ResourceType, string> = {
  clay: 'glinę',
  coal: 'węgiel',
  fertile_soil: 'żyzną ziemię',
  fish: 'ryby',
  gold: 'złoto',
  herbs: 'zioła',
  iron: 'żelazo',
  resin: 'żywicę',
  salt: 'sól',
}

export function aboutVillageLine(
  name: string,
  size: VillageSize,
  terrain: SettlementTerrain,
  foodSourceType: FoodSourceType,
  dominantResource: NaturalResource | null,
  archetype: Personality,
): string {
  const sizeWord = SIZE_LABEL[size]
  const terrainWord = TERRAIN_LABEL[terrain]
  const foodWord = FOOD_SOURCE_LABEL[foodSourceType]
  const resourceClause = dominantResource ? ` Mamy tu sporo: ${RESOURCE_LABEL[dominantResource.type]}.` : ''
  switch (archetype) {
    case 'calm':
      return `To ${name}, ${terrainWord}. ${capitalize(sizeWord)} osada.${resourceClause}`
    case 'cheerful':
      return `To ${name}! ${capitalize(sizeWord)} osada, ${terrainWord}. Żyjemy głównie z: ${foodWord}.${resourceClause}`
    case 'curious':
      return `Mieszkamy w ${name}, ${terrainWord}. Ciekawe miejsce, prawda?${resourceClause}`
    case 'grumpy':
      return `${name}. ${capitalize(terrainWord)}, jak widać.${resourceClause}`
  }
}

// --- "Nic, miłego dnia!" ---

const GOODBYE: Record<Personality, readonly string[]> = {
  cheerful: ['Trzymaj się! Miło było pogadać.', 'Do zobaczenia!'],
  calm: ['Bywaj.', 'Miłego dnia.'],
  grumpy: ['No to na razie.', 'Spadam do roboty.'],
  curious: ['Do zobaczenia — mam nadzieję, że jeszcze pogadamy!', 'Trzymaj się, ciekawe co dalej.'],
}

export function goodbyeLine(archetype: Personality): string {
  return pick(GOODBYE[archetype])
}
