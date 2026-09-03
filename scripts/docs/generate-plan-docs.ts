#!/usr/bin/env tsx

/**
 * Regenerate the plan-metadata-vocabulary sections of `docs/plans/README.md`,
 * `docs/plans/PLANNING.md` and `docs/plans/PLAN-METADATA.md` from
 * `scripts/docs/config.ts` — the single machine-readable source of truth for
 * the closed/recommended vocabularies (`docs/plans/PLAN-METADATA.md` §1).
 *
 * Sections are located by their exact Markdown heading text and their
 * content is replaced up to the next heading of equal or higher level —
 * `BEGIN/END GENERATED` HTML markers are intentionally not used (see the
 * plan's non-goals). Hand-written prose outside the designated headings is
 * left untouched, so this is safe to run as part of `docs:sync`.
 *
 * Usage:
 *   pnpm docs:generate-plan-docs
 *
 * @domain tools
 */

import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import {
  AVAILABLE_DOMAINS,
  AVAILABLE_TAGS,
  AVAILABLE_TYPES,
  EFFORT_DESCRIPTIONS,
  EFFORT_PENALTIES,
  OPTIONAL_PLAN_FIELDS,
  PLAN_METADATA_PATH,
  PLANNING_PATH,
  PLANS_README_PATH,
  PRIORITY_ICONS,
  PRIORITY_WEIGHTS,
  REQUIRED_PLAN_FIELDS,
  ROADMAP_DIR,
  STATUS_DESCRIPTIONS,
  STATUS_DISPLAY_ORDER,
  STATUS_ICONS,
  TYPE_DESCRIPTIONS,
} from './config.js'
import { listRoadmapFiles } from './plan-metadata.js'

const isFenceDelimiter = (line: string): boolean => /^```/.test(line.trim())

/**
 * Line indices where a fenced code block is "open" — a `#`-prefixed line
 * inside a fence (e.g. an illustrative `` ```md `` plan-header example) must
 * never be mistaken for a heading boundary.
 */
const fenceStateByLine = (lines: string[]): boolean[] => {
  const inFence: boolean[] = []
  let open = false

  for (const line of lines) {
    if (isFenceDelimiter(line)) {
      open = !open
      inFence.push(true) // the delimiter line itself is fence-owned
      continue
    }

    inFence.push(open)
  }

  return inFence
}

/**
 * Replace the content of a Markdown section, located by its exact heading
 * text, with `bodyLines`. The section spans from just after the heading to
 * the next heading of equal or higher level (or end of file) — headings
 * inside fenced code blocks are ignored. A trailing `---` separator
 * immediately before the next heading is preserved as-is (it belongs to the
 * document's section rhythm, not to either section's content). Throws if the
 * heading isn't found — a generator must never silently no-op.
 *
 * Exported for unit testing.
 */
export const replaceMarkdownSection = (
  content: string,
  heading: string,
  bodyLines: string[],
): string => {
  const lines = content.split('\n')
  const inFence = fenceStateByLine(lines)
  const headingIdx = lines.findIndex((line, i) => !inFence[i] && line.trim() === heading)

  if (headingIdx === -1) {
    throw new Error(`Heading "${heading}" not found`)
  }

  const level = heading.match(/^#+/)?.[0].length ?? 1
  let endIdx = lines.length

  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (inFence[i]) continue

    const match = lines[i].match(/^(#+)\s/)

    if (match && match[1].length <= level) {
      endIdx = i
      break
    }
  }

  let separatorIdx = endIdx

  for (let i = endIdx - 1; i > headingIdx; i--) {
    if (lines[i].trim() === '') continue
    if (lines[i].trim() === '---') separatorIdx = i
    break
  }

  const result = [
    ...lines.slice(0, headingIdx + 1),
    '',
    ...bodyLines,
    '',
    ...lines.slice(separatorIdx, endIdx),
    ...lines.slice(endIdx),
  ].join('\n')

  // Collapse any 3+ newline run created at the splice boundaries back to a
  // single blank line, rather than special-casing every adjacency above.
  return result.replace(/\n{3,}/g, '\n\n')
}

const domainTable = (columns: 'summary' | 'covers'): string[] => {
  const header = columns === 'summary'
    ? '| Domain | Summary | Subdomains |'
    : '| Domain | Covers | Subdomains |'

  const rows = Object.entries(AVAILABLE_DOMAINS).map(
    ([domain, { summary, subdomains }]) =>
      `| \`${domain}\` | ${summary} | ${subdomains.map(sub => `\`${sub}\``).join(', ')} |`,
  )

  return [header, '|---|---|---|', ...rows]
}

const buildReadmeMetadataReference = (): string[] => [
  'Generated from `scripts/docs/config.ts` by `pnpm docs:generate-plan-docs` — see `docs/plans/PLAN-METADATA.md` for the full contract.',
  '',
  `Status: ${STATUS_DISPLAY_ORDER.map(status => `\`${status}\` ${STATUS_ICONS[status]}`).join(' · ')}`,
  `Priority: ${Object.entries(PRIORITY_ICONS).map(([priority, icon]) => `${icon} ${priority}`).join(' · ')}`,
  `Effort: ${Object.entries(EFFORT_DESCRIPTIONS).map(([effort, desc]) => `\`${effort}\` ${desc}`).join(' · ')}`,
  `Type: ${AVAILABLE_TYPES.map(type => `\`${type}\``).join(' · ')}`,
  '',
  'Unless noted otherwise, `verification needed` means implementation has passed automated checks but still needs browser/manual verification.',
  '',
  '**Depends on** = implementation prerequisites (plan IDs). ~~done~~ is crossed out. Thematic overlap is not a dependency.',
]

const buildReadmePlanDomains = (): string[] => [
  'New plans declare a primary `Domain:` in frontmatter. Use optional `Tags:` only for genuinely secondary domains.',
  '',
  ...domainTable('summary'),
  '',
  '`Domain` means "where to look first". Use `Tags` sparingly.',
  '',
  '`Roadmap` is optional, and should point to a file in `docs/roadmap` folder.',
]

const buildPlanningDomains = (): string[] => [
  ...domainTable('covers'),
  '',
  'Use the existing domain that best owns the work. Do not create a new domain for a single plan.',
]

const buildPlanningMetadataContract = (): string[] => [
  'Every plan starts with:',
  '',
  '```md',
  '# Plan: <name>',
  '',
  '**Created:** YYYY-MM-DD',
  '**Status:** `planned` 📋',
  '**Type:** feature',
  '**Priority:** medium · **Effort:** S',
  '**Depends on:** ~~005~~ ~~008~~',
  '**Domain:** `npc`',
  '```',
  '',
  `Required fields: ${REQUIRED_PLAN_FIELDS.map(field => `\`${field}\``).join(', ')}.`,
  '',
  'Optional metadata may help AI preflight:',
  '',
  '```md',
  '**Subdomains:** `household` `logistics`',
  '**Tags:** `delivery` `inventory`',
  '**Roadmap:** `npc-ai.md`',
  '```',
  '',
  `Optional fields: ${OPTIONAL_PLAN_FIELDS.map(field => `\`${field}\``).join(', ')}.`,
  '',
  `Closed vocabularies — Status: ${STATUS_DISPLAY_ORDER.map(s => `\`${s}\``).join(', ')}; Type: ${AVAILABLE_TYPES.map(t => `\`${t}\``).join(', ')}; Priority: ${Object.keys(PRIORITY_WEIGHTS).map(p => `\`${p}\``).join(', ')}; Effort: ${Object.keys(EFFORT_PENALTIES).map(e => `\`${e}\``).join(', ')}.`,
  '',
  'Keep `Subdomains` and `Tags` short and relevant. They are hints for navigation/preflight, not a replacement for code recon.',
  'Optional `Roadmap` should point to a file in `docs/roadmap` folder. See `docs/plans/PLAN-METADATA.md` for the full contract, including per-field semantics and consumers.',
  '',
  'Write complete, correct metadata — don\'t rely on repair. `pnpm plans:sync` (and `pnpm docs:sync`) best-effort repairs missing/malformed/conflicting metadata in place (e.g. a filename-implied `Domain`, a `Depends on: 001` local ID resolved against the current domain) rather than failing the pipeline; see `docs/plans/PLAN-METADATA.md` §18 for exactly what it infers, defaults, or leaves as a warning.',
]

const buildTypeSection = (): string[] => [
  '### Allowed values',
  '',
  '`Type` is a required classification with this fixed vocabulary:',
  '',
  ...AVAILABLE_TYPES.map(type => `- \`${type}\``),
  '',
  '### Semantics',
  '',
  '| Type | Meaning |',
  '|---|---|',
  ...AVAILABLE_TYPES.map(type => `| \`${type}\` | ${TYPE_DESCRIPTIONS[type]} |`),
  '',
  '### `bug` vs `fix`',
  '',
  'Use `bug` when the current behaviour is wrong.',
  '',
  'Use `fix` when the current solution works but needs a deliberate correction or improvement.',
  '',
  '`gameplay` is **not** a Type. It is a cross-cutting concept and belongs in Tags.',
  '',
  '`research` is deliberately **not** a Type. Recon, investigation, and experiments should normally be represented by the plan itself, implementation notes, or an appropriate existing Type.',
]

const buildStatusSection = (): string[] => [
  '### Allowed values',
  '',
  ...STATUS_DISPLAY_ORDER.map(status => `- \`${status}\``),
  '',
  '### Lifecycle semantics',
  '',
  '| Status | Meaning |',
  '|---|---|',
  ...STATUS_DISPLAY_ORDER.map(status => `| \`${status}\` | ${STATUS_DESCRIPTIONS[status]} |`),
  '',
  '`verification needed` and `done` satisfy dependencies.',
  '',
  'Only `planned` plans are currently ranked by the recommendation generator.',
]

const buildPrioritySection = (): string[] => [
  'Allowed values:',
  '',
  ...Object.keys(PRIORITY_WEIGHTS).map(priority => `- \`${priority}\``),
  '',
  'Current recommendation weights:',
  '',
  '| Priority | Weight |',
  '|---|---:|',
  ...Object.entries(PRIORITY_WEIGHTS).map(([priority, weight]) => `| ${priority} | ${weight} |`),
  '',
  'Priority is a quantitative planning signal.',
]

const buildEffortSection = (): string[] => [
  'Allowed values:',
  '',
  ...Object.entries(EFFORT_DESCRIPTIONS).map(([effort, desc]) => `- \`${effort}\` — ${desc}`),
  '',
  'Current recommendation penalty:',
  '',
  '| Effort | Penalty |',
  '|---|---:|',
  ...Object.entries(EFFORT_PENALTIES).map(([effort, penalty]) => `| ${effort} | ${penalty} |`),
  '',
  'This naturally supports future **Quick Wins** recommendations.',
]

const buildDomainSection = (): string[] => [
  '### Canonical values',
  '',
  ...Object.keys(AVAILABLE_DOMAINS).map(domain => `- \`${domain}\``),
  '',
  'Domain is the primary ownership classification and a canonical grouping/filtering dimension.',
  '',
  'New plans use:',
  '',
  '```',
  '<domain>-<id>-<title>.md',
  '```',
  '',
  'Filename and `Domain:` must agree.',
]

const buildSubdomainsSection = (): string[] => [
  'Example:',
  '',
  '```md',
  '**Subdomains:** `household` `logistics`',
  '```',
  '',
  '### Value model',
  '',
  'Subdomains are **recommended vocabulary, not a global enum**.',
  '',
  'Recommended values should be documented per Domain and can be extended when the existing vocabulary does not describe the plan adequately.',
  '',
  'Examples:',
  '',
  '| Domain | Suggested Subdomains |',
  '|---|---|',
  ...Object.entries(AVAILABLE_DOMAINS).map(
    ([domain, { subdomains }]) => `| \`${domain}\` | ${subdomains.map(sub => `\`${sub}\``).join(', ')} |`,
  ),
  '',
  'These are starting recommendations, not a closed schema.',
]

const buildTagsSection = (): string[] => [
  'Example:',
  '',
  '```md',
  '**Tags:** `gameplay` `economy`',
  '```',
  '',
  'Tags are **global recommended vocabulary with an extensible/open model**.',
  '',
  'Recommended tags include:',
  '',
  ...AVAILABLE_TAGS.map(tag => `- \`${tag}\``),
  '',
  'Use a new tag when it represents a useful cross-cutting concept that cannot be expressed adequately by existing tags.',
  '',
  'Avoid tags that merely duplicate:',
  '',
  '- Type',
  '- Domain',
  '- Status',
  '- Priority',
  '- Effort',
  '- Roadmap',
]

const buildRoadmapSection = async (): Promise<string[]> => {
  const roadmapFiles = [...(await listRoadmapFiles())].sort()

  return [
    'Example:',
    '',
    '```md',
    '**Roadmap:** `npc-ai.md`',
    '```',
    '',
    'Roadmap is **optional**.',
    '',
    `The value points to a file in \`${ROADMAP_DIR}/\`.`,
    '',
    '### Semantics',
    '',
    'Roadmap identifies the higher-level development direction or initiative to which the plan contributes.',
    '',
    'It is also a useful **grouping/filtering dimension**:',
    '',
    '- one Roadmap can contain plans from multiple Domains;',
    '- one Domain can contain plans belonging to multiple Roadmaps;',
    '- a plan should normally reference at most one Roadmap.',
    '',
    'This creates two independent grouping axes:',
    '',
    '```',
    'Domain  = architectural/system area',
    'Roadmap = strategic development direction',
    '```',
    '',
    'Roadmap is not another priority system.',
    '',
    '### Currently available roadmaps',
    '',
    ...roadmapFiles.map(file => `- \`${file}\``),
  ]
}

const main = async (): Promise<void> => {
  const readmeContent = await readFile(PLANS_README_PATH, 'utf8')
  let nextReadme = replaceMarkdownSection(readmeContent, '## Metadata reference', buildReadmeMetadataReference())
  nextReadme = replaceMarkdownSection(nextReadme, '## Plan domains', buildReadmePlanDomains())

  const planningContent = await readFile(PLANNING_PATH, 'utf8')
  let nextPlanning = replaceMarkdownSection(planningContent, '## Domains', buildPlanningDomains())
  nextPlanning = replaceMarkdownSection(nextPlanning, '## Plan Metadata', buildPlanningMetadataContract())

  const metadataContent = await readFile(PLAN_METADATA_PATH, 'utf8')
  let nextMetadata = replaceMarkdownSection(metadataContent, '## 3. Type', buildTypeSection())
  nextMetadata = replaceMarkdownSection(nextMetadata, '## 4. Status', buildStatusSection())
  nextMetadata = replaceMarkdownSection(nextMetadata, '## 5. Priority', buildPrioritySection())
  nextMetadata = replaceMarkdownSection(nextMetadata, '## 6. Effort', buildEffortSection())
  nextMetadata = replaceMarkdownSection(nextMetadata, '## 8. Domain', buildDomainSection())
  nextMetadata = replaceMarkdownSection(nextMetadata, '## 9. Subdomains', buildSubdomainsSection())
  nextMetadata = replaceMarkdownSection(nextMetadata, '## 10. Tags', buildTagsSection())
  nextMetadata = replaceMarkdownSection(nextMetadata, '## 11. Roadmap', await buildRoadmapSection())

  const writes: Array<[string, string, string]> = [
    [PLANS_README_PATH, readmeContent, nextReadme],
    [PLANNING_PATH, planningContent, nextPlanning],
    [PLAN_METADATA_PATH, metadataContent, nextMetadata],
  ]

  for (const [path, before, after] of writes) {
    if (before === after) {
      console.log(`${path} already up to date`)
      continue
    }

    await writeFile(path, after)
    console.log(`Updated ${path}`)
  }
}

// Guard so importing `replaceMarkdownSection` for tests doesn't also run
// `main()` (which writes the real README/PLANNING/PLAN-METADATA files) as a
// side effect.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
