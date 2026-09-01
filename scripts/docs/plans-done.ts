import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  LEGACY_PLAN_ID_RE,
  PLAN_ID_RE,
  PLANS_DIR,
  PLANS_DONE_PATH,
  ROOT_DIR,
} from './config.js'
import { isPlanFile, relativePath } from './utils.js'

const STATUS = /^\*\*Status:\*\*\s*`([^`]+)`/m
const DOMAIN = /^\*\*Domain:\*\*\s*`([^`]+)`/m
const VERIFICATION_MAX_AGE_DAYS = 7

type DoneRecord = {
  plan: string
  domain: string
  opened: string[]
  verificationNeeded: string | null
  done: string | null
}

type Event = {
  commit: string
  date: string
}

const git = (...args: string[]): string =>
  execFileSync('git', args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()

const planId = (file: string): string => file.replace(/\.md$/, '')

const getStatus = (content: string): string | null =>
  content.match(STATUS)?.[1]?.trim().toLowerCase() ?? null

const getDomain = (content: string): string =>
  content.match(DOMAIN)?.[1]?.trim() ?? ''

const isRecentVerification = (date: string): boolean => {
  const age = Date.now() - new Date(date).getTime()

  return (
    age <=
    VERIFICATION_MAX_AGE_DAYS *
      24 *
      60 *
      60 *
      1000
  )
}

const isPlanRecentVerification = (plan: DoneRecord | undefined): boolean => {
  return !!(plan?.verificationNeeded && isRecentVerification(plan.verificationNeeded))
}

/**
 * Return plan files currently present in docs/plans.
 *
 * @domain tools
 */
const getCurrentPlanFiles = async (): Promise<string[]> => {
  const output = git(
    'ls-files',
    'docs/plans/*.md',
  )

  return output
    ? output
        .split('\n')
        .filter(isPlanFile)
        .map(file => file.replace(/^docs\/plans\//, ''))
    : []
}

const getGitCommits = (
  file: string,
): string[] => {
  const output = git(
    'log',
    '--follow',
    '--format=%H',
    '--',
    `docs/plans/${file}`,
  )

  return output
    ? output.split('\n').reverse()
    : []
}

const getFileAtCommit = (
  path: string,
  commit: string,
): string | null => {
  try {
    return git(
      'show',
      `${commit}:${relativePath(resolve(ROOT_DIR, path))}`,
    )
  } catch {
    return null
  }
}

const getCommitDate = (
  commit: string,
): string =>
  git(
    'show',
    '-s',
    '--format=%aI',
    commit,
  )
    .replace('T', ' ')
    .slice(0, 19)

/**
 * Find the first verification-needed and done lifecycle transitions.
 *
 * @domain tools
 */
const getStatusEvents = (
  file: string,
): {
  verificationNeeded: Event | null
  done: Event | null
} => {
  const commits = getGitCommits(file)

  let previousStatus: string | null = null
  let verificationNeeded: Event | null = null
  let done: Event | null = null

  for (const commit of commits) {
    const content = getFileAtCommit(
      resolve(PLANS_DIR, file),
      commit,
    )

    if (!content) continue

    const status = getStatus(content)

    if (
      status === 'verification needed' &&
      previousStatus !== status &&
      !verificationNeeded
    ) {
      verificationNeeded = {
        commit,
        date: getCommitDate(commit),
      }
    }

    if (
      status === 'done' &&
      previousStatus !== status &&
      !done
    ) {
      done = {
        commit,
        date: getCommitDate(commit),
      }
    }

    previousStatus = status
  }

  return {
    verificationNeeded,
    done,
  }
}

const getPlanAliases = (
  id: string,
): Set<string> => {
  const aliases = new Set<string>([id])

  const modern = id.match(PLAN_ID_RE)

  if (modern) {
    aliases.add(
      `${modern[1]}-${modern[2]}`,
    )
    aliases.add(modern[2])
  }

  const legacy = id.match(LEGACY_PLAN_ID_RE)

  if (legacy) {
    aliases.add(legacy[1])
  }

  return aliases
}

const dependencyMatches = (
  dependency: string,
  planId: string,
): boolean =>
  [...getPlanAliases(planId)].some(
    alias =>
      alias.toLowerCase() ===
      dependency.toLowerCase(),
  )

type PlannedRow = {
  file: string
  depends: string
}

/**
 * Parse only the Planned section of README.md.
 *
 * @domain tools
 */
const getPlannedRows = (
  readme: string,
): PlannedRow[] => {
  const lines = readme.split('\n')

  const start = lines.findIndex(
    line => line.trim() === '## Planned',
  )

  if (start === -1) {
    throw new Error(
      'Cannot find "## Planned" section in README.md',
    )
  }

  const end = lines.findIndex(
    (line, index) =>
      index > start &&
      /^##\s/.test(line),
  )

  const rows: PlannedRow[] = []

  for (
    const line of lines.slice(
      start + 1,
      end === -1
        ? lines.length
        : end,
    )
  ) {
    if (!line.trim().startsWith('|')) {
      continue
    }

    const columns = line
      .split('|')
      .slice(1, -1)
      .map(value => value.trim())

    if (
      columns.length < 5 ||
      columns[0] === 'File'
    ) {
      continue
    }

    const fileMatch =
      columns[0].match(
        /`([^`]+\.md)`/,
      )

    if (!fileMatch) continue

    rows.push({
      file: fileMatch[1],
      depends: columns[4],
    })
  }

  return rows
}

const extractDependencies = (
  value: string,
): string[] =>
  value.match(
    /[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*/g,
  ) ?? []

/**
 * Find Planned plans that depended on a completed plan
 * at the exact commit where it became done.
 *
 * @domain tools
 */
const getOpenedPlans = (
  completedPlanId: string,
  doneCommit: string,
): string[] => {
  const readme = getFileAtCommit(
    'docs/plans/README.md',
    doneCommit,
  )

  if (!readme) {
    return []
  }

  return getPlannedRows(readme)
    .filter(row =>
      extractDependencies(
        row.depends,
      ).some(dependency =>
        dependencyMatches(
          dependency,
          completedPlanId,
        ),
      ),
    )
    .map(row =>
      planId(row.file),
    )
}

const parseDone = async (): Promise<
  DoneRecord[]
> => {
  try {
    const content = await readFile(PLANS_DONE_PATH, 'utf8')

    const records = content
      .split('\n')
      .filter(line =>
        line.trim().startsWith('|'),
      )
      .map(line =>
        line
          .split('|')
          .slice(1, -1)
          .map(value => value.trim()),
      )
      .filter(
        columns =>
          columns.length === 5 &&
          columns[0] !== 'Plan' &&
          !columns.every(column => /^[-:]+$/.test(column)),
      )
      .map(columns => ({
        plan: columns[0],
        verificationNeeded: columns[1] === '—' ? null : columns[1],
        done: columns[2] === '—' ? null : columns[2],
        domain: columns[3].replaceAll('`', ''),
        opened: columns[4] === '—' ? [] : columns[4].split(',').map(value => value.trim()),
      }))

    return [...new Map(records.map(record => [record.plan, record])).values()]
  } catch {
    return []
  }
}

const updateRecord = (
  records: DoneRecord[],
  next: DoneRecord,
): DoneRecord[] => {
  const index =
    records.findIndex(
      record =>
        record.plan === next.plan,
    )

  if (index === -1) {
    return [...records, next]
  }

  const result = [...records]
  const existing = result[index]

  result[index] = {
    plan: existing.plan,
    domain:
      existing.domain ||
      next.domain,
    opened:
      existing.opened.length > 0
        ? existing.opened
        : next.opened,
    verificationNeeded:
      existing.verificationNeeded ??
      next.verificationNeeded,
    done:
      existing.done ??
      next.done,
  }

  return result
}

const escapeRegExp = (
  value: string,
): string =>
  value.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  )

/**
 * Mark the completed dependency in current Planned files.
 *
 * @domain tools
 */
const markDependencies = async (
  completedPlanId: string,
  openedPlans: string[],
): Promise<void> => {
  const aliases =
    getPlanAliases(
      completedPlanId,
    )

  for (const id of openedPlans) {
    const path = resolve(
      PLANS_DIR,
      `${id}.md`,
    )

    let content: string

    try {
      content =
        await readFile(
          path,
          'utf8',
        )
    } catch {
      continue
    }

    let updated = content

    for (const alias of aliases) {
      const escaped =
        escapeRegExp(alias)

      const pattern = new RegExp(
        `^(\\*\\*Depends on:\\*\\*.*?)(?<!~~)(?<![A-Za-z0-9-])${escaped}(?![A-Za-z0-9-])(?!~~)(.*)$`,
        'gim',
      )

      updated = updated.replace(
        pattern,
        `$1~~${alias}~~$2`,
      )
    }

    if (updated !== content) {
      await writeFile(
        path,
        updated,
        'utf8',
      )

      console.log(
        `Marked ${completedPlanId} dependency as done in ${id}.md`,
      )
    }
  }
}

const generateDone = (
  records: DoneRecord[],
): string => {
  const sorted =
    [...records].sort(
      (a, b) =>
        (
          b.done ??
          b.verificationNeeded ??
          ''
        ).localeCompare(
          a.done ??
          a.verificationNeeded ??
          '',
        ),
    )

  const map = sorted.map(record => {
    const title: string = `\`${record.plan.replaceAll('`', '')}\``
    const domain: string = record.domain ? `\`${record.domain}\`` : '—'
    const opened: string = record.opened.length ? record.opened.join(', ') : '—'
    const verificationNeeded: string = record.verificationNeeded ?? '—'
    const done: string = record.done ?? '—'

    return `| ${title.padEnd(70)} | ${verificationNeeded.padEnd(19)} | ${done.padEnd(19)} | ${domain.padEnd(10)} | ${opened.padEnd(10)} |`
  })

  return [
    '# Completed Plans',
    '',
    '> Automatically generated from plan history and Git. Do not edit manually.',
    '',
    '| Plan                                                                   | To verification     | Done                | Domain | Opened |',
    '|------------------------------------------------------------------------|---------------------|---------------------|--------|--------|',
    ...map,
    '',
  ].join('\n')
}

const main = async (): Promise<void> => {
  const existing = await parseDone()

  const existingByPlan =
    new Map(
      existing.map(record => [
        record.plan,
        record,
      ]),
    )

  const planFiles = await getCurrentPlanFiles()

  let records = existing

  /*
   * Every current plan file is a candidate, but plans already
   * recorded as Done are never scanned again.
   *
   * This is the incremental checkpoint.
   */
  for (const file of planFiles) {
    const id = planId(file)
    const existing = existingByPlan.get(id)

    if (existing?.done) {
      continue
    }

    // Verification needed starsze niż 7 dni → nie reewaluujemy
    if (isPlanRecentVerification(existing)) {
      continue
    }

    const content =
      await readFile(
        resolve(PLANS_DIR, file),
        'utf8',
      )

    const events =
      getStatusEvents(file)

    if (
      !events.verificationNeeded &&
      !events.done
    ) {
      continue
    }

    const opened =
      events.done
        ? getOpenedPlans(
            id,
            events.done.commit,
          )
        : []

    records =
      updateRecord(
        records,
        {
          plan: id,
          domain:
            getDomain(content),
          opened,
          verificationNeeded:
            events
              .verificationNeeded
              ?.date ?? null,
          done:
            events.done?.date ??
            null,
        },
      )

    if (events.done) {
      await markDependencies(
        id,
        opened,
      )
    }
  }

  await writeFile(
    PLANS_DONE_PATH,
    generateDone(records),
    'utf8',
  )

  console.log(
    `Updated ${relativePath(PLANS_DONE_PATH)} (${records.length} records).`,
  )
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
