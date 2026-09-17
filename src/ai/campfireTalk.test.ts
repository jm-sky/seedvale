import { describe, expect, it } from 'vitest'
import { resolveCampfireTalk } from './campfireTalk'

describe('resolveCampfireTalk', () => {
  it('resolves female→male to authored female-question / male-answer pairs only', () => {
    const talk = resolveCampfireTalk('female', 'male', () => 0)
    expect(talk).toBeDefined()
    expect(talk!.questionUrl).toContain('campfire_female_')
    expect(talk!.questionUrl).toContain('_question_')
    expect(talk!.answerUrl).toContain('campfire_male_')
    expect(talk!.answerUrl).toContain('_answer_')
  })

  it('resolves male→female to authored male-question / female-answer pairs only', () => {
    const talk = resolveCampfireTalk('male', 'female', () => 0)
    expect(talk).toBeDefined()
    expect(talk!.questionUrl).toContain('campfire_male_')
    expect(talk!.questionUrl).toContain('_question_')
    expect(talk!.answerUrl).toContain('campfire_female_')
    expect(talk!.answerUrl).toContain('_answer_')
  })

  it('returns undefined for same-gender directions with the current catalog', () => {
    expect(resolveCampfireTalk('male', 'male', () => 0)).toBeUndefined()
    expect(resolveCampfireTalk('female', 'female', () => 0)).toBeUndefined()
  })

  it('RNG 0 / near-1 select first / last compatible definitions', () => {
    const first = resolveCampfireTalk('female', 'male', () => 0)
    const last = resolveCampfireTalk('female', 'male', () => 0.999999)
    expect(first).toBeDefined()
    expect(last).toBeDefined()
    expect(first!.topic).toBe('weather')
    expect(last!.topic).toBe('road')
    expect(first!.questionUrl).not.toBe(last!.questionUrl)
  })

  it('always returns question and answer from one authored definition', () => {
    for (const roll of [0, 0.3, 0.6, 0.999]) {
      const talk = resolveCampfireTalk('male', 'female', () => roll)
      expect(talk).toBeDefined()
      // Matching variant suffix (01 with 01, 02 with 02) within the same topic.
      const qVariant = talk!.questionUrl.match(/_(\d+)\.mp3$/)?.[1]
      const aVariant = talk!.answerUrl.match(/_(\d+)\.mp3$/)?.[1]
      expect(qVariant).toBe(aVariant)
      const qTopic = talk!.questionUrl.match(/campfire_\w+_(\w+)_question/)?.[1]
      const aTopic = talk!.answerUrl.match(/campfire_\w+_(\w+)_answer/)?.[1]
      expect(qTopic).toBe(talk!.topic)
      expect(aTopic).toBe(talk!.topic)
    }
  })
})
