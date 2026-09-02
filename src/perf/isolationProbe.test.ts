import { describe, expect, it } from 'vitest'
import type { IsolationProbeRow } from './types'
import { formatIsolationReport } from './isolationProbe'

function row(overrides: Partial<IsolationProbeRow> & { id: string }): IsolationProbeRow {
  return {
    renderMsAvg: 0,
    renderMsP95: 0,
    renderMsMax: 0,
    drawCallsAvg: 0,
    trianglesAvg: 0,
    ...overrides,
  }
}

describe('formatIsolationReport', () => {
  it('reports no probes without throwing', () => {
    expect(formatIsolationReport([])).toBe('[Seedvale Render Isolation]\n\nNo isolation probes were run for this benchmark.')
  })

  it('labels the requested probes, shows avg/p95/max, and diffs each probe against baseline', () => {
    const rows = [
      row({ id: 'full', renderMsAvg: 20, renderMsP95: 30, renderMsMax: 45 }),
      row({ id: 'hide-water', renderMsAvg: 15, renderMsP95: 22, renderMsMax: 30 }),
      row({ id: 'hide-vegetation-grass', renderMsAvg: 10, renderMsP95: 14, renderMsMax: 20 }),
      row({ id: 'no-postprocessing', renderMsAvg: 5, renderMsP95: 7, renderMsMax: 9 }),
      row({ id: 'no-reflections', renderMsAvg: 18, renderMsP95: 26, renderMsMax: 40 }),
    ]

    const report = formatIsolationReport(rows)
    expect(report.startsWith('[Seedvale Render Isolation]')).toBe(true)
    expect(report).toContain('baseline')
    expect(report).toContain('no water')
    expect(report).toContain('no vegetation/grass')
    expect(report).toContain('no postprocessing')
    expect(report).toContain('no mirrors')
    expect(report).toContain('avg=20.0 ms  p95=30.0 ms  max=45.0 ms  Δavg vs baseline=—')
    expect(report).toContain('Δavg vs baseline=-5.0 ms (-25%)') // hide-water vs 20 ms baseline
  })

  it('reports the CPU/GPU separation section only when a GPU sample was actually resolved', () => {
    const withGpu = formatIsolationReport([
      row({ id: 'full', renderMsAvg: 20, renderMsP95: 30, renderMsMax: 45, gpuMsAvg: 12, gpuMsP95: 18, gpuMsMax: 25, gpuSamples: 6 }),
    ])
    expect(withGpu).toContain('EXT_disjoint_timer_query_webgl2: available (6 samples resolved during the baseline window)')
    expect(withGpu).toContain('GPU elapsed   avg=12.0 ms  p95=18.0 ms  max=25.0 ms')
    expect(withGpu).not.toContain('NOT MEASURED')

    const withoutGpu = formatIsolationReport([row({ id: 'full', renderMsAvg: 20, renderMsP95: 30, renderMsMax: 45 })])
    expect(withoutGpu).toContain('NOT MEASURED')
    expect(withoutGpu).toContain('EXT_disjoint_timer_query_webgl2 is unavailable')
    expect(withoutGpu).not.toContain('GPU elapsed')
  })
})
