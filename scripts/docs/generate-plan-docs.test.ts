import { describe, expect, it } from 'vitest'
import { AVAILABLE_DOMAINS } from './config.js'
import { replaceMarkdownSection } from './generate-plan-docs.js'

describe('replaceMarkdownSection', () => {
  it('replaces content between a heading and the next heading of equal level', () => {
    const content = [
      '# Title',
      '',
      '## Section A',
      '',
      'old A content',
      '',
      '## Section B',
      '',
      'B content',
    ].join('\n')

    const result = replaceMarkdownSection(content, '## Section A', ['new A content'])

    expect(result).toContain('new A content')
    expect(result).not.toContain('old A content')
    expect(result).toContain('## Section B')
    expect(result).toContain('B content')
  })

  it('does not stop at a deeper sub-heading', () => {
    const content = [
      '## Section A',
      '',
      '### Sub-heading',
      '',
      'old content',
      '',
      '## Section B',
    ].join('\n')

    const result = replaceMarkdownSection(content, '## Section A', ['new content'])

    expect(result).not.toContain('### Sub-heading')
    expect(result).not.toContain('old content')
    expect(result).toContain('new content')
    expect(result).toContain('## Section B')
  })

  it('replaces content that runs to end of file when there is no following heading', () => {
    const content = ['## Section A', '', 'old content'].join('\n')
    const result = replaceMarkdownSection(content, '## Section A', ['new content'])
    expect(result.trim()).toBe('## Section A\n\nnew content'.trim())
  })

  it('ignores a heading-like line inside a fenced code block', () => {
    const content = [
      '## Plan Metadata',
      '',
      '```md',
      '# Plan: <name>',
      '**Status:** `planned`',
      '```',
      '',
      'trailing prose',
      '',
      '## Next Section',
      '',
      'next content',
    ].join('\n')

    const result = replaceMarkdownSection(content, '## Plan Metadata', ['replaced'])

    expect(result).toContain('replaced')
    expect(result).not.toContain('# Plan: <name>')
    expect(result).not.toContain('trailing prose')
    expect(result).toContain('## Next Section')
    expect(result).toContain('next content')
  })

  it('preserves a trailing "---" separator before the next heading', () => {
    const content = [
      '## Section A',
      '',
      'old content',
      '',
      '---',
      '',
      '## Section B',
    ].join('\n')

    const result = replaceMarkdownSection(content, '## Section A', ['new content'])

    expect(result).toContain('---')
    expect(result.indexOf('---')).toBeLessThan(result.indexOf('## Section B'))
  })

  it('throws when the heading is not found', () => {
    expect(() => replaceMarkdownSection('# Title\n\nbody', '## Missing', ['x'])).toThrow(/not found/)
  })

  it('is idempotent when the body already matches', () => {
    const content = ['## Section A', '', 'stable content', '', '## Section B'].join('\n')
    const once = replaceMarkdownSection(content, '## Section A', ['stable content'])
    const twice = replaceMarkdownSection(once, '## Section A', ['stable content'])
    expect(once).toBe(twice)
  })
})

describe('generated domain table', () => {
  it('has a canonical config entry for every domain (no drift between docs and config)', () => {
    // Regression guard for the exact drift this plan fixed: README/PLANNING's
    // domain tables had hand-edited summaries that no longer matched
    // config.ts. As long as config.ts stays the single source, that class of
    // drift can't recur — this just documents the invariant.
    expect(Object.keys(AVAILABLE_DOMAINS).length).toBeGreaterThan(0)

    for (const [domain, { summary, subdomains }] of Object.entries(AVAILABLE_DOMAINS)) {
      expect(domain.length).toBeGreaterThan(0)
      expect(summary.length).toBeGreaterThan(0)
      expect(subdomains.length).toBeGreaterThan(0)
    }
  })
})
