import type { NeedId } from './Needs'

export type Personality = 'calm' | 'cheerful' | 'curious' | 'grumpy'

/** Deterministic pool — assigned by index (like NPC_NAMES), not randomized per session. */
export const NPC_PERSONALITIES: readonly Personality[] = [
  'cheerful',
  'calm',
  'grumpy',
  'curious',
]

/** Dimensional personality (OCEAN), 0-1 each. Source of truth for an NPC's
 *  personality — the discrete `Personality` archetype above is now derived
 *  from it via `nearestArchetype()`, only to pick a dialogue-line bucket. */
export type BigFivePersonality = {
  openness: number
  conscientiousness: number
  extraversion: number
  agreeableness: number
  neuroticism: number
}

/** Anchor OCEAN point per archetype — chosen to reproduce each archetype's
 *  existing PAUSE_PARAMS/dialogue feel once run through the formulas below. */
const ARCHETYPE_OCEAN: Record<Personality, BigFivePersonality> = {
  cheerful: { openness: 0.6, conscientiousness: 0.5, extraversion: 0.8, agreeableness: 0.7, neuroticism: 0.2 },
  calm: { openness: 0.5, conscientiousness: 0.6, extraversion: 0.4, agreeableness: 0.6, neuroticism: 0.25 },
  grumpy: { openness: 0.3, conscientiousness: 0.5, extraversion: 0.2, agreeableness: 0.3, neuroticism: 0.75 },
  curious: { openness: 0.9, conscientiousness: 0.4, extraversion: 0.65, agreeableness: 0.55, neuroticism: 0.35 },
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t)
}

/** Cheap deterministic hash → [-1, 1], same sin-based pattern as
 *  `terrainTintNoise` in biomeColors.ts. Used to spread each NPC's OCEAN
 *  point around its archetype anchor, so 8 NPCs sharing an archetype don't
 *  all react identically. */
function jitter01(treeIndex: number, dim: number): number {
  const n = Math.sin(treeIndex * 12.9898 + dim * 78.233) * 43758.5453
  return (n - Math.floor(n)) * 2 - 1
}

const JITTER_AMOUNT = 0.15

/** Deterministic OCEAN point for an NPC — archetype anchor (cycled by index,
 *  like the old `NPC_PERSONALITIES` lookup) plus small per-NPC jitter. */
export function personalityForIndex(treeIndex: number): BigFivePersonality {
  const archetype = NPC_PERSONALITIES[treeIndex % NPC_PERSONALITIES.length]!
  const base = ARCHETYPE_OCEAN[archetype]
  return {
    openness: clamp01(base.openness + jitter01(treeIndex, 0) * JITTER_AMOUNT),
    conscientiousness: clamp01(base.conscientiousness + jitter01(treeIndex, 1) * JITTER_AMOUNT),
    extraversion: clamp01(base.extraversion + jitter01(treeIndex, 2) * JITTER_AMOUNT),
    agreeableness: clamp01(base.agreeableness + jitter01(treeIndex, 3) * JITTER_AMOUNT),
    neuroticism: clamp01(base.neuroticism + jitter01(treeIndex, 4) * JITTER_AMOUNT),
  }
}

function oceanDistanceSq(a: BigFivePersonality, b: BigFivePersonality): number {
  return (
    (a.openness - b.openness) ** 2 +
    (a.conscientiousness - b.conscientiousness) ** 2 +
    (a.extraversion - b.extraversion) ** 2 +
    (a.agreeableness - b.agreeableness) ** 2 +
    (a.neuroticism - b.neuroticism) ** 2
  )
}

/** Nearest archetype in OCEAN space — the translation layer that lets
 *  `BANK` (below) stay keyed by discrete `Personality` without a rewrite. */
export function nearestArchetype(p: BigFivePersonality): Personality {
  let best: Personality = 'calm'
  let bestDist = Infinity
  for (const archetype of NPC_PERSONALITIES) {
    const dist = oceanDistanceSq(p, ARCHETYPE_OCEAN[archetype])
    if (dist < bestDist) {
      bestDist = dist
      best = archetype
    }
  }
  return best
}

export type PausePersonalityParams = {
  triggerDistance: number
  lookDurationRange: [number, number]
  cooldownRange: [number, number]
}

/** How close the player must get to make an NPC stop and look, how long it
 *  holds the look, and how long before it can trigger again — computed
 *  directly from raw OCEAN dimensions (continuous), not from the archetype
 *  bucket. Post-reaction cooldown is deliberately long so a lingering
 *  player is acknowledged once, then ignored for a while rather than
 *  re-triggering every few seconds. */
export function pausePersonalityParams(p: BigFivePersonality): PausePersonalityParams {
  const triggerDistance = lerp(2, 5, 0.5 * p.extraversion + 0.5 * p.openness)
  const lookMin = lerp(1.5, 3, p.openness)
  const lookMax = lookMin + lerp(1, 3, 1 - p.neuroticism)
  // ~10–40s depending on personality (was ~2–12s — too spammy when the
  // player stays nearby after the first "Hmm?").
  const cooldownMin = lerp(10, 25, p.neuroticism)
  const cooldownMax = cooldownMin + lerp(5, 15, 1 - p.extraversion)
  return {
    triggerDistance,
    lookDurationRange: [lookMin, lookMax],
    cooldownRange: [cooldownMin, cooldownMax],
  }
}

type Bucket = 'doing' | 'seeking'

type PersonalityLines = Record<Personality, Record<Bucket, string[]>>

const NEUTRAL: Record<Bucket, string[]> = {
  seeking: ['Mam coś do zrobienia.'],
  doing: ['Zaraz kończę.'],
}

const BANK: Record<NeedId, PersonalityLines> = {
  water: {
    cheerful: {
      seeking: [
        'Lecę po wodę do studni, zaraz wracam!',
        'Ale pragnienie — kurs na studnię!',
      ],
      doing: ['Ach, nareszcie woda ze studni!', 'Pyszna, zimna woda.'],
    },
    calm: {
      seeking: ['Idę po wodę, nie ma pośpiechu.', 'Studnia czeka.'],
      doing: ['Dobra, chłodna woda.', 'Teraz lepiej.'],
    },
    grumpy: {
      seeking: ['Znowu ta studnia...', 'Muszę się napić, inaczej nie wytrzymam.'],
      doing: ['No, w końcu.', 'Chociaż tyle.'],
    },
    curious: {
      seeking: [
        'Ciekawe, ile razy dziennie chodzę do tej studni...',
        'Znowu po wodę — a Ty skąd pijesz?',
      ],
      doing: [
        'Zastanawiam się, jak głęboka jest ta studnia.',
        'Smaczna woda, nie sądzisz?',
      ],
    },
  },
  food: {
    cheerful: {
      seeking: ['Zgłodniałem! Do ogrodu po coś dobrego.', 'Czas na przekąskę!'],
      doing: ['Pycha, prosto z ogrodu!', 'Nic tak nie smakuje jak świeże warzywa.'],
    },
    calm: {
      seeking: ['Idę coś zjeść.', 'Ogród niedaleko, zjem spokojnie.'],
      doing: ['Smacznego.', 'Właśnie to mi było potrzebne.'],
    },
    grumpy: {
      seeking: ['Burczy mi w brzuchu, trzeba iść.', 'Znowu głodny...'],
      doing: ['No, trochę lepiej.', 'Chociaż tyle mam z tego dnia.'],
    },
    curious: {
      seeking: ['Ciekawe, co dziś urosło w ogrodzie.', 'Idę sprawdzić ogród.'],
      doing: ['O, to nawet niezłe.', 'Zastanawiam się, kto to zasadził.'],
    },
  },
  wood: {
    cheerful: {
      seeking: ['Lecę po drewno!', 'Trochę ruchu przy drzewach mi się przyda.'],
      doing: ['Ciach, ciach — leci drewienko!', 'Stos rośnie w oczach.'],
    },
    calm: {
      seeking: ['Idę zająć się drewnem.', 'Czas na drewno, bez pośpiechu.'],
      doing: ['Powolutku, ale skutecznie.', 'Jedno polano na raz.'],
    },
    grumpy: {
      seeking: ['Znowu drewno...', 'Ktoś musi to robić.'],
      doing: ['Ciężka robota.', 'Ręce mnie bolą od tego.'],
    },
    curious: {
      seeking: [
        'Ciekawe, ile drewna zużywamy w tygodniu.',
        'Idę po drewno — a Ty rąbałeś kiedyś drzewo?',
      ],
      doing: ['Ładny słój ma to drzewo.', 'Zastanawiam się, na co pójdzie to drewno.'],
    },
  },
  idle: {
    cheerful: {
      seeking: ['Piękny dzień w Seedvale, prawda?', 'Nic pilnego — miło Cię widzieć!'],
      doing: ['Uwielbiam takie chwile.', 'Wszystko w porządku, dzięki że pytasz!'],
    },
    calm: {
      seeking: ['Wszystko w porządku, dziękuję.', 'Odpoczywam chwilę.'],
      doing: ['Spokojnie mija dzień.', 'Nic się nie dzieje, i dobrze.'],
    },
    grumpy: {
      seeking: ['Czego chcesz?', 'Nie mam teraz nic do roboty, i dobrze.'],
      doing: ['Zostaw mnie w spokoju na chwilę.', 'Odpoczywam, jeśli można.'],
    },
    curious: {
      seeking: ['Widziałeś już całą osadę?', 'Co słychać za tymi wzgórzami?'],
      doing: ['Zawsze się zastanawiam, co jest dalej za lasem.', 'Ciekawe czasy.'],
    },
  },
}

/** Random pick from need/personality/bucket, falling back to a neutral line if that
 *  combination has no dedicated variants yet — keeps the matrix safe to extend piecemeal. */
export function pickDialogueLine(
  personality: Personality,
  need: NeedId,
  busy: boolean,
): string {
  const bucket: Bucket = busy ? 'doing' : 'seeking'
  const lines = BANK[need]?.[personality]?.[bucket]
  const pool = lines && lines.length > 0 ? lines : NEUTRAL[bucket]
  return pool[Math.floor(Math.random() * pool.length)]!
}
