import type { NpcGender } from './characters'

/**
 * Campfire spoken conversation pairs (plan npc-045) — presentation-only
 * metadata for compatible question/answer exchanges under
 * `public/sounds/voices/`. Selection is pure and authored: never synthesize
 * filenames or probe the filesystem/network at runtime.
 *
 * Topics (`weather` / `work` / `road`) do not affect simulation state.
 */

export type CampfireTalkTopic = 'weather' | 'work' | 'road'

export type CampfireTalk = {
  topic: CampfireTalkTopic
  questionUrl: string
  answerUrl: string
  answerDelaySec: number
}

type CampfireTalkDefinition = CampfireTalk & {
  questionerGender: NpcGender
  responderGender: NpcGender
}

const VOICES = '/sounds/voices'

/** Complete authored opposite-gender exchanges only — current POC has no
 *  same-gender Cartesian set. `answerDelaySec` ≈ question clip length so the
 *  responder can start after the question without a completion callback. */
const CAMPFIRE_TALKS: readonly CampfireTalkDefinition[] = [
  {
    topic: 'weather',
    questionerGender: 'female',
    responderGender: 'male',
    questionUrl: `${VOICES}/campfire_female_weather_question_01.mp3`,
    answerUrl: `${VOICES}/campfire_male_weather_answer_01.mp3`,
    answerDelaySec: 1.0,
  },
  {
    topic: 'weather',
    questionerGender: 'male',
    responderGender: 'female',
    questionUrl: `${VOICES}/campfire_male_weather_question_02.mp3`,
    answerUrl: `${VOICES}/campfire_female_weather_answer_02.mp3`,
    answerDelaySec: 1.5,
  },
  {
    topic: 'work',
    questionerGender: 'male',
    responderGender: 'female',
    questionUrl: `${VOICES}/campfire_male_work_question_01.mp3`,
    answerUrl: `${VOICES}/campfire_female_work_answer_01.mp3`,
    answerDelaySec: 0.9,
  },
  {
    topic: 'work',
    questionerGender: 'female',
    responderGender: 'male',
    questionUrl: `${VOICES}/campfire_female_work_question_02.mp3`,
    answerUrl: `${VOICES}/campfire_male_work_answer_02.mp3`,
    answerDelaySec: 2.9,
  },
  {
    topic: 'road',
    questionerGender: 'female',
    responderGender: 'male',
    questionUrl: `${VOICES}/campfire_female_road_question_01.mp3`,
    answerUrl: `${VOICES}/campfire_male_road_answer_01.mp3`,
    answerDelaySec: 4.4,
  },
  {
    topic: 'road',
    questionerGender: 'male',
    responderGender: 'female',
    questionUrl: `${VOICES}/campfire_male_road_question_02.mp3`,
    answerUrl: `${VOICES}/campfire_female_road_answer_02.mp3`,
    answerDelaySec: 2.3,
  },
]

/**
 * Pick one complete compatible campfire exchange for the two speaker genders.
 *
 * @domain npc
 */
export function resolveCampfireTalk(
  questionerGender: NpcGender,
  responderGender: NpcGender,
  rng: () => number = Math.random,
): CampfireTalk | undefined {
  const pool = CAMPFIRE_TALKS.filter(
    (def) => def.questionerGender === questionerGender && def.responderGender === responderGender,
  )
  if (pool.length === 0) return undefined
  const index = Math.min(pool.length - 1, Math.floor(rng() * pool.length))
  const chosen = pool[index]!
  return {
    topic: chosen.topic,
    questionUrl: chosen.questionUrl,
    answerUrl: chosen.answerUrl,
    answerDelaySec: chosen.answerDelaySec,
  }
}
