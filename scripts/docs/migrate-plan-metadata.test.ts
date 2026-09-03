import { describe, expect, it } from 'vitest'
import { formatTokenList, normalizeTokenListFormatting, proposeType } from './migrate-plan-metadata.js'
import { parsePlanHeader } from './plan-metadata.js'

describe('formatTokenList', () => {
  it('renders tokens as space-separated backtick spans', () => {
    expect(formatTokenList(['a', 'b'])).toBe('`a` `b`')
  })
})

describe('normalizeTokenListFormatting', () => {
  it('rewrites comma-separated Tags to canonical backtick-space form', () => {
    const content = '**Tags:** items-player, fauna\n'
    const header = parsePlanHeader('x.md', content)
    const changes: string[] = []

    const result = normalizeTokenListFormatting(content, header, changes)

    expect(result).toBe('**Tags:** `items-player` `fauna`\n')
    expect(changes).toHaveLength(1)
  })

  it('is a no-op when Tags are already canonical', () => {
    const content = '**Tags:** `items-player` `fauna`\n'
    const header = parsePlanHeader('x.md', content)
    const changes: string[] = []

    const result = normalizeTokenListFormatting(content, header, changes)

    expect(result).toBe(content)
    expect(changes).toEqual([])
  })

  it('normalizes bracket-style Tags', () => {
    const content = '**Tags:** [items-player]\n'
    const header = parsePlanHeader('x.md', content)
    const changes: string[] = []

    expect(normalizeTokenListFormatting(content, header, changes)).toBe('**Tags:** `items-player`\n')
  })
})

describe('proposeType', () => {
  it('proposes infrastructure for a tooling-flavoured title', () => {
    const header = parsePlanHeader('x.md', '# Plan: Weapon Browser — Observatory/Admin\n')
    expect(proposeType(header)).toEqual({ type: 'infrastructure', confident: true })
  })

  it('returns undefined when no confident keyword signal exists', () => {
    const header = parsePlanHeader('x.md', '# Plan: Riding Skill Effects\n')
    expect(proposeType(header)).toBeUndefined()
  })
})
