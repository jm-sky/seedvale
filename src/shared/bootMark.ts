import { isBootMarkMode } from '../debug/debugMode'

type BootMark = {
  group: string
  name: string
  time: number
}

const bootMarks: BootMark[] = []

export const useBootMark = (group: string = 'global') => {
  const bootMark = (name: string) => {
    if (!isBootMarkMode()) return
    bootMarks.push({ group, name, time: performance.now() })
  }

  const bootMarkEnd = (name: string) => {
    if (!isBootMarkMode()) return
    const mark: BootMark | undefined = bootMarks.find(({ name }) => name === name)
    const time: number = mark ? performance.now() - mark.time : 0
    console.log(`[BootMark][${group}] ${name}: ${time.toFixed(0)} ms`)
  }

  const bootMarksSummary = () => {
    console.log('Boot Marks Summary:')
    console.table(bootMarks)
  }

  return {
    bootMark,
    bootMarkEnd,
    bootMarksSummary,
  }
}
