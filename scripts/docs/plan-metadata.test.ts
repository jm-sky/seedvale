import { describe, expect, it } from 'vitest'
import { AVAILABLE_STATUSES, AVAILABLE_TYPES } from './config.js'
import {
  formatTokenList,
  inferType,
  normalizeTokenListFormatting,
  parsePlanHeader,
  repairPlanMetadata,
  validatePlanHeader,
} from './plan-metadata.js'

const VALID_HEADER = `# Plan: Example

**Created:** 2026-09-01
**Status:** \`planned\` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** -
**Domain:** \`npc\`
**Subdomains:** \`behavior\` \`goals\`
**Tags:** \`gameplay\` \`custom-open-tag\`
**Roadmap:** \`npc-ai\`
**Implemented at:** 2026-09-02 10:15

## Goal

Body content.
`

describe('parsePlanHeader', () => {
  it('extracts every field from a well-formed header', () => {
    const header = parsePlanHeader('npc-099-example.md', VALID_HEADER)

    expect(header).toMatchObject({
      created: '2026-09-01',
      status: 'planned',
      type: 'feature',
      priority: 'medium',
      effort: 'M',
      dependsOn: '-',
      domain: 'npc',
      subdomains: ['behavior', 'goals'],
      tags: ['gameplay', 'custom-open-tag'],
      roadmap: 'npc-ai',
      implementedAt: '2026-09-02 10:15',
    })
  })

  it('does not read fields from body content below the header', () => {
    const header = parsePlanHeader('x.md', '**Status:** `planned`\n\n## Goal\n\n**Type:** feature\n')
    expect(header.type).toBeUndefined()
  })
})

describe('validatePlanHeader', () => {
  const roadmapFiles = new Set(['economy-production', 'npc-ai'])

  it('accepts a fully valid header', () => {
    const header = parsePlanHeader('npc-099-example.md', VALID_HEADER)
    const issues = validatePlanHeader(header, { domainFromFilename: 'npc', roadmapFiles })
    expect(issues).toEqual([])
  })

  it('rejects a missing Type on a planned plan', () => {
    const content = VALID_HEADER.replace('**Type:** feature\n', '')
    const header = parsePlanHeader('npc-099-example.md', content)
    const issues = validatePlanHeader(header, { domainFromFilename: 'npc', roadmapFiles })
    expect(issues).toContainEqual(expect.objectContaining({ field: 'Type' }))
  })

  it('does not require Type on a done plan', () => {
    const content = VALID_HEADER
      .replace('**Type:** feature\n', '')
      .replace('`planned` 📋', '`done` ✅')
    const header = parsePlanHeader('npc-099-example.md', content)
    const issues = validatePlanHeader(header, { domainFromFilename: 'npc', roadmapFiles })
    expect(issues.filter(issue => issue.field === 'Type')).toEqual([])
  })

  it('rejects an invalid Type value', () => {
    const content = VALID_HEADER.replace('**Type:** feature', '**Type:** made-up')
    const header = parsePlanHeader('npc-099-example.md', content)
    const issues = validatePlanHeader(header, { domainFromFilename: 'npc', roadmapFiles })
    expect(issues).toContainEqual(expect.objectContaining({ field: 'Type' }))
  })

  it('accepts every closed Type value', () => {
    for (const type of AVAILABLE_TYPES) {
      const content = VALID_HEADER.replace('**Type:** feature', `**Type:** ${type}`)
      const header = parsePlanHeader('npc-099-example.md', content)
      const issues = validatePlanHeader(header, { domainFromFilename: 'npc', roadmapFiles })
      expect(issues.filter(issue => issue.field === 'Type')).toEqual([])
    }
  })

  it('accepts every closed Status value', () => {
    for (const status of AVAILABLE_STATUSES) {
      const content = VALID_HEADER.replace('`planned` 📋', `\`${status}\``)
      const header = parsePlanHeader('npc-099-example.md', content)
      const issues = validatePlanHeader(header, { domainFromFilename: 'npc', roadmapFiles })
      expect(issues.filter(issue => issue.field === 'Status')).toEqual([])
    }
  })

  it('rejects an invalid Domain value', () => {
    const content = VALID_HEADER.replace('**Domain:** `npc`', '**Domain:** `not-a-domain`')
    const header = parsePlanHeader('npc-099-example.md', content)
    const issues = validatePlanHeader(header, { domainFromFilename: 'npc', roadmapFiles })
    expect(issues).toContainEqual(expect.objectContaining({ field: 'Domain' }))
  })

  it('rejects a Domain that disagrees with the filename', () => {
    const header = parsePlanHeader('npc-099-example.md', VALID_HEADER)
    const issues = validatePlanHeader(header, { domainFromFilename: 'fauna', roadmapFiles })
    expect(issues).toContainEqual(expect.objectContaining({ field: 'Domain' }))
  })

  it('does not treat an unrecognized Subdomain/Tag as invalid (open vocabulary)', () => {
    const content = VALID_HEADER
      .replace('**Subdomains:** `behavior` `goals`', '**Subdomains:** `brand-new-subdomain`')
      .replace('**Tags:** `gameplay` `custom-open-tag`', '**Tags:** `brand-new-tag`')
    const header = parsePlanHeader('npc-099-example.md', content)
    const issues = validatePlanHeader(header, { domainFromFilename: 'npc', roadmapFiles })
    expect(issues).toEqual([])
  })

  it('accepts a missing optional Roadmap', () => {
    const content = VALID_HEADER.replace('**Roadmap:** `npc-ai`\n', '')
    const header = parsePlanHeader('npc-099-example.md', content)
    const issues = validatePlanHeader(header, { domainFromFilename: 'npc', roadmapFiles })
    expect(issues.filter(issue => issue.field === 'Roadmap')).toEqual([])
  })

  it('rejects a Roadmap that does not match a file in docs/roadmap/', () => {
    const content = VALID_HEADER.replace('**Roadmap:** `npc-ai`', '**Roadmap:** `does-not-exist`')
    const header = parsePlanHeader('npc-099-example.md', content)
    const issues = validatePlanHeader(header, { domainFromFilename: 'npc', roadmapFiles })
    expect(issues).toContainEqual(expect.objectContaining({ field: 'Roadmap' }))
  })

  it('accepts a valid Implemented at format', () => {
    const header = parsePlanHeader('npc-099-example.md', VALID_HEADER)
    const issues = validatePlanHeader(header, { domainFromFilename: 'npc', roadmapFiles })
    expect(issues.filter(issue => issue.field === 'Implemented at')).toEqual([])
  })

  it('rejects an invalid Implemented at format', () => {
    const content = VALID_HEADER.replace('2026-09-02 10:15', '2026-09-02T10:15:00Z')
    const header = parsePlanHeader('npc-099-example.md', content)
    const issues = validatePlanHeader(header, { domainFromFilename: 'npc', roadmapFiles })
    expect(issues).toContainEqual(expect.objectContaining({ field: 'Implemented at' }))
  })

  it('does not require Domain on a legacy plan', () => {
    const content = VALID_HEADER.replace('**Domain:** `npc`\n', '')
    const header = parsePlanHeader('2026-09-01--099--example.md', content)
    const issues = validatePlanHeader(header, { legacy: true, roadmapFiles })
    expect(issues.filter(issue => issue.field === 'Domain')).toEqual([])
  })

  it('rejects an invalid Created format', () => {
    const content = VALID_HEADER.replace('**Created:** 2026-09-01', '**Created:** Sept 1 2026')
    const header = parsePlanHeader('npc-099-example.md', content)
    const issues = validatePlanHeader(header, { domainFromFilename: 'npc', roadmapFiles })
    expect(issues).toContainEqual(expect.objectContaining({ field: 'Created' }))
  })
})

describe('formatTokenList', () => {
  it('renders tokens as space-separated backtick spans', () => {
    expect(formatTokenList(['a', 'b'])).toBe('`a` `b`')
  })
})

describe('normalizeTokenListFormatting', () => {
  it('rewrites comma-separated Tags to canonical backtick-space form', () => {
    const content = '**Tags:** items-player, fauna\n'
    const header = parsePlanHeader('x.md', content)
    const changes: Parameters<typeof normalizeTokenListFormatting>[2] = []

    const result = normalizeTokenListFormatting(content, header, changes)

    expect(result).toBe('**Tags:** `items-player` `fauna`\n')
    expect(changes).toHaveLength(1)
  })

  it('is a no-op when Tags are already canonical', () => {
    const content = '**Tags:** `items-player` `fauna`\n'
    const header = parsePlanHeader('x.md', content)
    const changes: Parameters<typeof normalizeTokenListFormatting>[2] = []

    const result = normalizeTokenListFormatting(content, header, changes)

    expect(result).toBe(content)
    expect(changes).toEqual([])
  })

  it('normalizes bracket-style Tags', () => {
    const content = '**Tags:** [items-player]\n'
    const header = parsePlanHeader('x.md', content)
    const changes: Parameters<typeof normalizeTokenListFormatting>[2] = []

    expect(normalizeTokenListFormatting(content, header, changes)).toBe('**Tags:** `items-player`\n')
  })
})

describe('inferType', () => {
  it('infers infrastructure for a tooling-flavoured title', () => {
    const header = parsePlanHeader('x.md', '# Plan: Weapon Browser — Observatory/Admin\n')
    expect(inferType(header, 'x.md')).toEqual({ type: 'infrastructure', source: 'title' })
  })

  it('infers fix from a filename fix keyword when no title is present', () => {
    const header = parsePlanHeader('npc-018-fix-stuck-navigation.md', '')
    expect(inferType(header, 'npc-018-fix-stuck-navigation.md')).toEqual({ type: 'fix', source: 'filename' })
  })

  it('infers optimization from a performance keyword', () => {
    const header = parsePlanHeader('world-012-terrain-performance.md', '')
    expect(inferType(header, 'world-012-terrain-performance.md')).toEqual({ type: 'optimization', source: 'filename' })
  })

  it('falls back to infrastructure for the tools domain when no keyword matches', () => {
    const header = parsePlanHeader('tools-011-plan-metadata-resilience.md', '')
    expect(inferType(header, 'tools-011-plan-metadata-resilience.md', 'tools')).toEqual({ type: 'infrastructure', source: 'filename' })
  })

  it('falls back to feature when no keyword or domain signal exists', () => {
    const header = parsePlanHeader('x.md', '# Plan: Riding Skill Effects\n')
    expect(inferType(header, 'x.md')).toEqual({ type: 'feature', source: 'default' })
  })
})

describe('repairPlanMetadata', () => {
  const INCOMPLETE_HEADER = `# Plan: Work Contracts

**Status:** \`planned\`
**Domain:** \`settlements\`
**Depends on:** 001

## Goal

Body content.
`

  // `Depends on: 001` only expands to `npc-001` when that plan actually
  // exists — see `RepairPlanMetadataOptions.existingPlanIds`. Real plans
  // also use bare numbers for pre-domain legacy global IDs, so an
  // unresolved bare ID must never be rewritten.
  const EXISTING_IDS = new Set(['fauna-003', 'npc-001', 'npc-002'])

  it('repairs a ChatGPT-incomplete plan in a single pass and reports every change', () => {
    const { header, repair } = repairPlanMetadata('npc-018-work-contracts.md', INCOMPLETE_HEADER, { existingPlanIds: EXISTING_IDS })

    expect(repair.changed).toBe(true)
    expect(header).toMatchObject({
      status: 'planned',
      type: 'feature',
      priority: 'medium',
      effort: 'S',
      dependsOn: 'npc-001',
      domain: 'npc',
    })

    const fields = repair.changes.map(change => change.field)
    expect(fields).toEqual(expect.arrayContaining(['Type', 'Priority', 'Effort', 'Depends on', 'Domain']))
  })

  it('resolves a conflicting Domain in favour of the filename', () => {
    const { header, repair } = repairPlanMetadata('npc-018-work-contracts.md', INCOMPLETE_HEADER)
    expect(header.domain).toBe('npc')
    expect(repair.changes).toContainEqual(expect.objectContaining({ field: 'Domain', from: 'settlements', to: 'npc', source: 'filename' }))
  })

  it('recognizes a field already present under non-canonical label casing instead of inserting a duplicate', () => {
    const content = '# Plan: X\n\n**Created:** 2026-09-01\n**Status:** `planned` 📋\n**Type:** feature\n**Priority:** medium · **Effort:** S\n**Depends on:** -\n**domain:** `npc`\n'
    const { content: repaired, header, repair } = repairPlanMetadata('npc-018-x.md', content)

    expect(header.domain).toBe('npc')
    expect(repair.changed).toBe(false)
    expect(repair.changes.find(c => c.field === 'Domain')).toBeUndefined()
    expect([...repaired.matchAll(/^\*\*domain:\*\*/gim)]).toHaveLength(1)
  })

  it('expands a bare local dependency ID that resolves to a real plan', () => {
    const { header } = repairPlanMetadata('npc-018-work-contracts.md', INCOMPLETE_HEADER, { existingPlanIds: EXISTING_IDS })
    expect(header.dependsOn).toBe('npc-001')
  })

  it('expands a list of bare local dependency IDs that resolve to real plans', () => {
    const content = INCOMPLETE_HEADER.replace('**Depends on:** 001', '**Depends on:** 001 002')
    const { header } = repairPlanMetadata('npc-018-work-contracts.md', content, { existingPlanIds: EXISTING_IDS })
    expect(header.dependsOn).toBe('npc-001 npc-002')
  })

  it('leaves a bare dependency ID untouched when no matching local plan exists (e.g. a legacy global ID)', () => {
    const { header, repair } = repairPlanMetadata('npc-018-work-contracts.md', INCOMPLETE_HEADER, { existingPlanIds: new Set(['npc-002']) })
    expect(header.dependsOn).toBe('001')
    expect(repair.changes.find(change => change.field === 'Depends on')).toBeUndefined()
  })

  it('leaves a bare dependency ID untouched when existingPlanIds is not supplied', () => {
    const { header, repair } = repairPlanMetadata('npc-018-work-contracts.md', INCOMPLETE_HEADER)
    expect(header.dependsOn).toBe('001')
    expect(repair.changes.find(change => change.field === 'Depends on')).toBeUndefined()
  })

  it('leaves explicit dependency IDs unchanged', () => {
    const content = INCOMPLETE_HEADER.replace('**Depends on:** 001', '**Depends on:** npc-001 fauna-003')
    const { header, repair } = repairPlanMetadata('npc-018-work-contracts.md', content, { existingPlanIds: EXISTING_IDS })
    expect(header.dependsOn).toBe('npc-001 fauna-003')
    expect(repair.changes.find(change => change.field === 'Depends on')).toBeUndefined()
  })

  it('normalizes mixed bare and explicit dependency IDs, leaving unresolved bare IDs alone', () => {
    const content = INCOMPLETE_HEADER.replace('**Depends on:** 001', '**Depends on:** 001 999 npc-002 fauna-003')
    const { header } = repairPlanMetadata('npc-018-work-contracts.md', content, { existingPlanIds: EXISTING_IDS })
    expect(header.dependsOn).toBe('npc-001 999 npc-002 fauna-003')
  })

  it('defaults a missing Depends on to "-" with a warning', () => {
    const content = INCOMPLETE_HEADER.replace('**Depends on:** 001\n', '')
    const { header, repair } = repairPlanMetadata('npc-018-work-contracts.md', content)
    expect(header.dependsOn).toBe('-')
    expect(repair.warnings.some(w => w.startsWith('Depends on:'))).toBe(true)
  })

  it('leaves "-" and "none" Depends on values untouched', () => {
    for (const value of ['-', 'none']) {
      const content = INCOMPLETE_HEADER.replace('**Depends on:** 001', `**Depends on:** ${value}`)
      const { repair } = repairPlanMetadata('npc-018-work-contracts.md', content)
      expect(repair.changes.find(change => change.field === 'Depends on')).toBeUndefined()
    }
  })

  it('does not infer Type for a non-planned plan missing it', () => {
    const content = INCOMPLETE_HEADER.replace('`planned`', '`done`')
    const { header, repair } = repairPlanMetadata('npc-018-work-contracts.md', content)
    expect(header.type).toBeUndefined()
    expect(repair.changes.find(change => change.field === 'Type')).toBeUndefined()
  })

  it('does not default missing Priority/Effort for a completed plan', () => {
    const content = INCOMPLETE_HEADER.replace('`planned`', '`done`')
    const { header, repair } = repairPlanMetadata('npc-018-work-contracts.md', content)
    expect(header.priority).toBeUndefined()
    expect(header.effort).toBeUndefined()
    expect(repair.changes.find(change => change.field === 'Priority')).toBeUndefined()
    expect(repair.changes.find(change => change.field === 'Effort')).toBeUndefined()
  })

  it('normalizes an unrecognized Status to the safe "planned" fallback with a warning', () => {
    const content = INCOMPLETE_HEADER.replace('`planned`', '`Ready`')
    const { header, repair } = repairPlanMetadata('npc-018-work-contracts.md', content)
    expect(header.status).toBe('planned')
    expect(repair.warnings.some(w => w.startsWith('Status:'))).toBe(true)
  })

  it('normalizes Status case/spacing without a warning', () => {
    const content = INCOMPLETE_HEADER.replace('`planned`', '`In Progress`')
    const { header, repair } = repairPlanMetadata('npc-018-work-contracts.md', content)
    expect(header.status).toBe('in progress')
    expect(repair.warnings.some(w => w.startsWith('Status:'))).toBe(false)
  })

  it('adds a missing Status icon without touching the value', () => {
    const content = '# Plan: X\n\n**Status:** `planned`\n**Domain:** `npc`\n**Depends on:** -\n**Priority:** medium\n**Effort:** S\n**Type:** feature\n'
    const { repair } = repairPlanMetadata('npc-018-x.md', content)
    expect(repair.changes).toContainEqual(expect.objectContaining({ field: 'Status', source: 'normalization' }))
  })

  it('replaces a stale/wrong Status icon in place', () => {
    const content = '# Plan: X\n\n**Status:** `verification needed` 📋\n**Domain:** `npc`\n**Depends on:** -\n**Priority:** medium\n**Effort:** S\n**Type:** feature\n'
    const { header, repair } = repairPlanMetadata('npc-018-x.md', content)
    expect(header.status).toBe('verification needed')
    expect(repair.changes).toContainEqual(expect.objectContaining({ field: 'Status', from: '📋', to: '🔍', source: 'normalization' }))
  })

  it('does not touch a correct Status icon even when trailing prose follows it', () => {
    const content = '# Plan: X\n\n**Status:** `verification needed` 🔍 — see [implementation notes](./x.md)\n**Domain:** `npc`\n**Depends on:** -\n**Priority:** medium\n**Effort:** S\n**Type:** feature\n'
    const { repair } = repairPlanMetadata('npc-018-x.md', content)
    expect(repair.changes.find(change => change.field === 'Status')).toBeUndefined()
  })

  it('inserts a missing Status icon before trailing prose without dropping it', () => {
    const content = '# Plan: X\n\n**Status:** `verification needed` — see [implementation notes](./x.md)\n**Domain:** `npc`\n**Depends on:** -\n**Priority:** medium\n**Effort:** S\n**Type:** feature\n'
    const { content: repaired, repair } = repairPlanMetadata('npc-018-x.md', content)
    expect(repair.changes).toContainEqual(expect.objectContaining({ field: 'Status', to: '🔍', source: 'normalization' }))
    expect(repaired).toContain('**Status:** `verification needed` 🔍 — see [implementation notes](./x.md)')
  })

  it('normalizes Priority/Effort casing', () => {
    const content = INCOMPLETE_HEADER
      .replace('**Domain:** `settlements`', '**Domain:** `settlements`\n**Priority:** High\n**Effort:** m')
    const { header, repair } = repairPlanMetadata('npc-018-work-contracts.md', content)
    expect(header.priority).toBe('high')
    expect(header.effort).toBe('M')
    expect(repair.changes).toContainEqual(expect.objectContaining({ field: 'Priority', from: 'High', to: 'high', source: 'normalization' }))
    expect(repair.changes).toContainEqual(expect.objectContaining({ field: 'Effort', from: 'm', to: 'M', source: 'normalization' }))
  })

  it('never fabricates a missing Created date', () => {
    const { header, repair } = repairPlanMetadata('npc-018-work-contracts.md', INCOMPLETE_HEADER)
    expect(header.created).toBeUndefined()
    expect(repair.warnings.some(w => w.startsWith('Created:'))).toBe(true)
    expect(repair.changes.find(change => change.field === 'Created')).toBeUndefined()
  })

  it('leaves an invalid Roadmap target as a warning, not a change', () => {
    const content = INCOMPLETE_HEADER.replace('**Domain:** `settlements`', '**Domain:** `settlements`\n**Roadmap:** `does-not-exist`')
    const roadmapFiles = new Set(['npc-ai'])
    const { repair } = repairPlanMetadata('npc-018-work-contracts.md', content, { roadmapFiles })
    expect(repair.warnings.some(w => w.startsWith('Roadmap:'))).toBe(true)
    expect(repair.changes.find(change => change.field === 'Roadmap')).toBeUndefined()
  })

  it('leaves an invalid Implemented at format as a warning, not a change', () => {
    const content = INCOMPLETE_HEADER.replace('**Domain:** `settlements`', '**Domain:** `settlements`\n**Implemented at:** 2026-09-02T10:15:00Z')
    const { repair } = repairPlanMetadata('npc-018-work-contracts.md', content)
    expect(repair.warnings.some(w => w.startsWith('Implemented at:'))).toBe(true)
  })

  it('does not change an already-valid plan', () => {
    const { repair } = repairPlanMetadata('npc-099-example.md', VALID_HEADER)
    expect(repair.changed).toBe(false)
    expect(repair.changes).toEqual([])
  })

  it('is idempotent for a broken plan, including local dependency expansion', () => {
    const first = repairPlanMetadata('npc-018-work-contracts.md', INCOMPLETE_HEADER, { existingPlanIds: EXISTING_IDS })
    const second = repairPlanMetadata('npc-018-work-contracts.md', first.content, { existingPlanIds: EXISTING_IDS })

    expect(second.content).toBe(first.content)
    expect(second.repair.changed).toBe(false)
  })

  it('is idempotent for an already-valid plan', () => {
    const first = repairPlanMetadata('npc-099-example.md', VALID_HEADER)
    const second = repairPlanMetadata('npc-099-example.md', first.content)

    expect(second.content).toBe(first.content)
    expect(second.repair.changed).toBe(false)
  })
})
