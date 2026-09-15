import { describe, expect, it, vi } from 'vitest'
import { formatCountAcquisitionToast, showCountAcquisitionToast } from './acquisitionFeedback'

describe('count-backed acquisition feedback', () => {
  it('formats the committed delta and resulting total', () => {
    expect(formatCountAcquisitionToast('stone', 1, 4)).toBe('Kamień +1 · Masz: 4')
    expect(formatCountAcquisitionToast('branch', 3, 3)).toBe('Gałąź +3 · Masz: 3')
  })

  it('skips zero/negative delta and instance-backed kinds', () => {
    expect(formatCountAcquisitionToast('stone', 0, 4)).toBeNull()
    expect(formatCountAcquisitionToast('stone', -1, 4)).toBeNull()
    expect(formatCountAcquisitionToast('axe', 1, 1)).toBeNull()
  })

  it('does not toast when there is nothing to report', () => {
    const toast = { show: vi.fn(), dispose: vi.fn() }
    showCountAcquisitionToast(toast, 'stone', 0, 2)
    showCountAcquisitionToast(toast, 'axe', 1, 1)
    expect(toast.show).not.toHaveBeenCalled()
    showCountAcquisitionToast(toast, 'stone', 2, 5)
    expect(toast.show).toHaveBeenCalledWith('Kamień +2 · Masz: 5', 'pickup')
  })
})
