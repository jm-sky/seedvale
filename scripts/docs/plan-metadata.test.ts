import { describe, expect, it } from 'vitest'
import { AVAILABLE_STATUSES, AVAILABLE_TYPES } from './config.js'
import { parsePlanHeader, validatePlanHeader } from './plan-metadata.js'

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
