<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue'
import { isTouchDevice } from '../../input/isTouchDevice'
import {
  MAP_WORLD_ZOOM_DEFAULT,
} from '../../world/map/mapConfig'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import {
  canvasToWorld,
  clampWorldMapZoom,
  drawWorldMapFrame,
  type WorldMapView,
} from '../lib/drawMap'
import { closeWorldMap, isWorldMapOpen, ui } from '../store'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const shellRef = ref<HTMLElement | null>(null)
const touch = isTouchDevice()
let ctx: CanvasRenderingContext2D | null = null
let cssWidth = 0
let cssHeight = 0
const view: WorldMapView = {
  viewX: 0,
  viewZ: 0,
  zoom: MAP_WORLD_ZOOM_DEFAULT,
}

useOverlayScreen('world-map', isWorldMapOpen, closeWorldMap)

function paint(): void {
  if (!ctx || cssWidth <= 0 || cssHeight <= 0) return
  drawWorldMapFrame(
    { ctx, width: cssWidth, height: cssHeight },
    view,
    ui.worldMap.playerX,
    ui.worldMap.playerZ,
  )
}

function setupCanvas(): void {
  const canvas = canvasRef.value
  const shell = shellRef.value
  if (!canvas || !shell) return
  const dpr = window.devicePixelRatio || 1
  cssWidth = Math.max(1, Math.floor(shell.clientWidth))
  cssHeight = Math.max(1, Math.floor(shell.clientHeight))
  canvas.width = Math.floor(cssWidth * dpr)
  canvas.height = Math.floor(cssHeight * dpr)
  canvas.style.width = `${cssWidth}px`
  canvas.style.height = `${cssHeight}px`
  ctx = canvas.getContext('2d')
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
  paint()
}

watch(() => ui.worldMap.open, async (open) => {
  if (!open) return
  view.viewX = ui.worldMap.playerX
  view.viewZ = ui.worldMap.playerZ
  view.zoom = MAP_WORLD_ZOOM_DEFAULT
  await nextTick()
  setupCanvas()
})

let dragging = false
let lastPointerX = 0
let lastPointerY = 0
const pointers = new Map<number, { x: number, y: number }>()
let pinchStartDist = 0
let pinchStartZoom = MAP_WORLD_ZOOM_DEFAULT

function onPointerDown(event: PointerEvent): void {
  canvasRef.value?.setPointerCapture(event.pointerId)
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    pinchStartDist = Math.hypot(a!.x - b!.x, a!.y - b!.y)
    pinchStartZoom = view.zoom
    dragging = false
    return
  }
  dragging = true
  lastPointerX = event.clientX
  lastPointerY = event.clientY
}

function onPointerMove(event: PointerEvent): void {
  if (!pointers.has(event.pointerId)) return
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y)
    if (pinchStartDist > 1) {
      view.zoom = clampWorldMapZoom(pinchStartZoom * (dist / pinchStartDist))
      paint()
    }
    return
  }
  if (!dragging) return
  const dx = event.clientX - lastPointerX
  const dy = event.clientY - lastPointerY
  lastPointerX = event.clientX
  lastPointerY = event.clientY
  view.viewX -= dx / view.zoom
  view.viewZ -= dy / view.zoom
  paint()
}

function onPointerUp(event: PointerEvent): void {
  pointers.delete(event.pointerId)
  if (pointers.size < 2) pinchStartDist = 0
  if (pointers.size === 0) dragging = false
}

function onWheel(event: WheelEvent): void {
  event.preventDefault()
  const pos = canvasRef.value
    ? (() => {
      const rect = canvasRef.value!.getBoundingClientRect()
      return { x: event.clientX - rect.left, y: event.clientY - rect.top }
    })()
    : { x: cssWidth / 2, y: cssHeight / 2 }
  const before = canvasToWorld(pos.x, pos.y, view, cssWidth, cssHeight)
  const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12
  view.zoom = clampWorldMapZoom(view.zoom * factor)
  const after = canvasToWorld(pos.x, pos.y, view, cssWidth, cssHeight)
  view.viewX += before.x - after.x
  view.viewZ += before.z - after.z
  paint()
}

const onResize = () => {
  if (ui.worldMap.open) setupCanvas()
}

window.addEventListener('resize', onResize)
onUnmounted(() => window.removeEventListener('resize', onResize))
</script>

<template>
  <div
    v-if="ui.worldMap.open"
    class="pointer-events-auto fixed inset-0 z-10 flex items-center justify-center bg-panel-backdrop backdrop-blur-[2px]"
    @click.self="closeWorldMap"
  >
    <div
      class="flex max-h-[calc(100dvh-24px)] w-full max-w-5xl flex-col overflow-hidden rounded-[10px] bg-panel text-ink shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
      style="height: min(92dvh, 860px)"
    >
      <div class="flex items-center justify-between gap-3 px-4 py-3">
        <h1 class="text-lg font-semibold tracking-wide">
          Mapa
        </h1>
        <button
          type="button"
          class="cursor-pointer rounded-md border border-white/15 bg-transparent px-3 py-1.5 text-sm hover:bg-white/10"
          @click="closeWorldMap"
        >
          Zamknij
        </button>
      </div>
      <div
        ref="shellRef"
        class="relative min-h-0 flex-1"
      >
        <canvas
          ref="canvasRef"
          class="block h-full w-full touch-none"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @wheel="onWheel"
        />
      </div>
      <div class="px-4 py-2 text-[11px] opacity-60">
        {{ touch ? 'Przeciągnij — przesuń · uszczypnij — zoom · zamknij' : 'Przeciągnij — przesuń · kółko — zoom · Esc / M — zamknij' }}
      </div>
    </div>
  </div>
</template>
