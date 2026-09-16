import type { LongFrameAttribution, LongFrameRecord } from './types'
import { PERF_CATEGORIES } from './types'

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function categoryLine(name: string, ms: number): string {
  return `${name.padEnd(12)} ${round1(ms).toFixed(1).padStart(7)}ms`
}

/** Console / paste-friendly dump for one long frame. */
export function formatLongFrameRecord(record: LongFrameRecord): string {
  const lines = [
    `[LONG FRAME] ${round1(record.frameMs)}ms`,
    `simulate     ${round1(record.simulateMs).toFixed(1).padStart(7)}ms`,
    `render       ${round1(record.renderMs).toFixed(1).padStart(7)}ms`,
  ]
  for (const name of PERF_CATEGORIES) {
    lines.push(categoryLine(name, record.categoryMs[name] ?? 0))
  }
  lines.push(categoryLine('OTHER', record.otherMs))
  if (record.stages.length > 0) {
    lines.push('')
    lines.push('streaming / stages:')
    for (const stage of record.stages) {
      lines.push(`  ${stage.label.padEnd(28)} ${round1(stage.ms).toFixed(1)}ms`)
    }
  }
  if (record.hitches.length > 0) {
    lines.push('')
    lines.push('hitches:')
    for (const hitch of record.hitches) {
      const label = hitch.label ?? hitch.category
      lines.push(`  ${hitch.category} ${label.padEnd(22)} ${round1(hitch.durationMs).toFixed(1)}ms`)
    }
  }
  return lines.join('\n')
}

/** Benchmark copy-report section built from PerfMonitor session long frames. */
export function formatLongFrameAttribution(attribution: LongFrameAttribution | undefined): string {
  if (!attribution || attribution.count <= 0) {
    return [
      '[Seedvale Long Frame Attribution]',
      '',
      `Threshold: ${attribution?.thresholdMs ?? 80} ms`,
      'Long frames: 0',
      '',
      'No frame crossed the long-frame threshold in this measured session.',
    ].join('\n')
  }
  const blocks = attribution.worst.map((record, index) => {
    const header = index === 0
      ? `Worst frame (#${index + 1} of ${attribution.worst.length} shown, ${attribution.count} total):`
      : `Long frame #${index + 1}:`
    return [header, '', formatLongFrameRecord(record)].join('\n')
  })
  return [
    '[Seedvale Long Frame Attribution]',
    '',
    `Threshold: ${attribution.thresholdMs} ms`,
    `Long frames: ${attribution.count}`,
    `Shown: ${attribution.worst.length} worst (by frame ms)`,
    '',
    'Read: category rows are `withCategory()` spans on that frame; OTHER is',
    'frame total minus those categories (measurement gap, overlapping work,',
    'or unwrapped tick code). Stages are coarse streaming/finalize labels',
    'from the same frame; hitches are existing `recordHitch` events (>= 8 ms).',
    '',
    blocks.join('\n\n'),
  ].join('\n')
}
