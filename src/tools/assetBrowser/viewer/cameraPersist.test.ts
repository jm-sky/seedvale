import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ViewportDef } from './createMultiView'
import {
  clearCameraPersist,
  loadCameraPersist,
  saveCameraPersist,
} from './cameraPersist'

const store = new Map<string, string>()

function installLocalStorageMock(): void {
  store.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
    },
  })
}

function fakeView(
  id: ViewportDef['id'],
  position: [number, number, number],
  target: [number, number, number],
  zoom: number,
): ViewportDef {
  return {
    id,
    label: id,
    camera: {
      position: { x: position[0], y: position[1], z: position[2] },
      zoom,
      updateProjectionMatrix: () => undefined,
    },
    controls: {
      target: { x: target[0], y: target[1], z: target[2] },
      enableDamping: false,
      update: () => undefined,
    },
    overlay: {} as HTMLDivElement,
    x: 0,
    y: 0,
    w: 1,
    h: 1,
  } as unknown as ViewportDef
}

describe('cameraPersist', () => {
  beforeEach(() => {
    installLocalStorageMock()
    clearCameraPersist()
  })
  afterEach(() => {
    clearCameraPersist()
  })

  it('round-trips camera snapshots through localStorage', () => {
    saveCameraPersist([
      fakeView('front', [4, 5, 6], [1, 2, 3], 2.5),
      fakeView('perspective', [7, 8, 9], [0.5, 1, 1.5], 1),
    ])
    const loaded = loadCameraPersist()
    expect(loaded?.version).toBe(1)
    expect(loaded?.views).toEqual([
      { id: 'front', position: [4, 5, 6], target: [1, 2, 3], zoom: 2.5 },
      { id: 'perspective', position: [7, 8, 9], target: [0.5, 1, 1.5], zoom: 1 },
    ])
  })

  it('rejects corrupt payloads', () => {
    localStorage.setItem('seedvale.assetBrowser.cameras.v1', '{"version":1,"views":[{"id":"front"}]}')
    expect(loadCameraPersist()).toBeNull()
  })
})
