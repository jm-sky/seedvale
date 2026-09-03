<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import type { MapKnownLocation } from '../../world/map/mapTypes'
import { isTouchDevice } from '../../input/isTouchDevice'
import { worldUnitsToKm } from '../../world/locations/locationConfig'
import { formatDistance } from '../../world/locations/locationDiscovery'
import { getActiveNavigationTargets, MAX_NAVIGATION_TARGETS } from '../../world/locations/navigationTargets'
import { worldLocationKindFromId } from '../../world/locations/worldLocationTypes'
import {
  MAP_WORLD_ZOOM_DEFAULT,
} from '../../world/map/mapConfig'
import { getActiveMapData } from '../../world/map/mapData'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import {
  canvasToWorld,
  clampWorldMapZoom,
  drawWorldMapFrame,
  findLocationAtCanvasPoint,
  type WorldMapView,
} from '../lib/drawMap'
import { locationKindColor, targetSlotColor } from '../lib/mapColors'
import { locationKindIcon, locationKindLabel } from '../lib/worldLocationDisplay'
import { closeWorldMap, isWorldMapOpen, ui } from '../store'

/** Real `WorldLocationKind` label/icon/colour for a known location — the
 *  map's own `MapKnownLocation.kind` is only `settlement`/`landmark`
 *  (`mapData.ts`'s deliberate coarsening), which used to make every cave,
 *  cemetery, lake and peak show as generic "Miejsce" here. */
function kindOf(location: MapKnownLocation) {
  return worldLocationKindFromId(location.id)
}
function kindLabel(location: MapKnownLocation): string {
  return locationKindLabel(kindOf(location))
}
function kindIcon(location: MapKnownLocation) {
  return locationKindIcon(kindOf(location))
}
function kindColor(location: MapKnownLocation): string {
  return locationKindColor(kindOf(location))
}

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

// Navigation targets live in `NavigationTargets` (not Vue-reactive, same
// imperative-singleton pattern as `mapData`/`mapDiscovery`) — this counter
// forces the target list/popover to re-render after a mutation.
const targetsVersion = ref(0)
const selected = ref<MapKnownLocation | null>(null)

const targetList = computed(() => {
  targetsVersion.value // eslint-disable-line @typescript-eslint/no-unused-expressions
  const mapData = getActiveMapData()
  return (getActiveNavigationTargets()?.list() ?? [])
    .map((t) => ({ slot: t.slot, location: mapData?.resolveKnown(t.id) ?? null }))
    .filter((t): t is { slot: number, location: MapKnownLocation } => t.location != null)
    .sort((a, b) => a.slot - b.slot)
})

const selectedDistanceKm = computed(() => {
  if (!selected.value) return 0
  return worldUnitsToKm(Math.hypot(selected.value.x - ui.worldMap.playerX, selected.value.z - ui.worldMap.playerZ))
})

const selectedIsTarget = computed(() => !!selected.value && (getActiveNavigationTargets()?.has(selected.value.id) ?? false))

function paint(): void {
  if (!ctx || cssWidth <= 0 || cssHeight <= 0) return
  drawWorldMapFrame(
    { ctx, width: cssWidth, height: cssHeight },
    view,
    ui.worldMap.playerX,
    ui.worldMap.playerZ,
  )
}

function setTarget(): void {
  if (!selected.value) return
  getActiveNavigationTargets()?.set(selected.value.id)
  targetsVersion.value++
  paint()
}
function removeTarget(id: string): void {
  getActiveNavigationTargets()?.remove(id)
  targetsVersion.value++
  paint()
}
function clearTargets(): void {
  getActiveNavigationTargets()?.clear()
  targetsVersion.value++
  paint()
}
function focusTarget(location: MapKnownLocation): void {
  view.viewX = location.x
  view.viewZ = location.z
  paint()
}
function centerOnPlayer(): void {
  view.viewX = ui.worldMap.playerX
  view.viewZ = ui.worldMap.playerZ
  paint()
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
  selected.value = null
  await nextTick()
  setupCanvas()
})

let dragging = false
let lastPointerX = 0
let lastPointerY = 0
let downX = 0
let downY = 0
const pointers = new Map<number, { x: number, y: number }>()
let pinchStartDist = 0
let pinchStartZoom = MAP_WORLD_ZOOM_DEFAULT

/** Below this total pointer travel, a pointerdown→pointerup pair counts as a
 *  click (plan §12), not a pan — same touch-friendly slack a typical tap
 *  target uses. */
const CLICK_DRAG_THRESHOLD_PX = 6

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
  downX = event.clientX
  downY = event.clientY
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
  const wasClick = dragging && pointers.size === 1 && Math.hypot(event.clientX - downX, event.clientY - downY) < CLICK_DRAG_THRESHOLD_PX
  pointers.delete(event.pointerId)
  if (pointers.size < 2) pinchStartDist = 0
  if (pointers.size === 0) dragging = false
  if (!wasClick) return
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return
  selected.value = findLocationAtCanvasPoint(view, cssWidth, cssHeight, event.clientX - rect.left, event.clientY - rect.top)
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
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="cursor-pointer rounded-md border border-white/15 bg-transparent px-3 py-1.5 text-sm hover:bg-white/10"
            @click="centerOnPlayer"
          >
            Wyśrodkuj na graczu
          </button>
          <button
            type="button"
            class="cursor-pointer rounded-md border border-white/15 bg-transparent px-3 py-1.5 text-sm hover:bg-white/10"
            @click="closeWorldMap"
          >
            Zamknij
          </button>
        </div>
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

        <div
          v-if="targetList.length > 0"
          class="pointer-events-auto absolute left-3 top-3 flex max-w-[220px] flex-col gap-1.5 rounded-md bg-panel/90 p-2.5 text-xs shadow-lg"
        >
          <div class="mb-0.5 flex items-center justify-between gap-2 opacity-70">
            <span>Cele ({{ targetList.length }}/{{ MAX_NAVIGATION_TARGETS }})</span>
            <button
              type="button"
              class="cursor-pointer underline hover:opacity-80"
              @click="clearTargets"
            >
              Wyczyść
            </button>
          </div>
          <div
            v-for="t in targetList"
            :key="t.location.id"
            class="flex items-center gap-2"
          >
            <span
              class="h-2.5 w-2.5 shrink-0 rounded-sm"
              :style="{ backgroundColor: targetSlotColor(t.slot) }"
            />
            <component
              :is="kindIcon(t.location)"
              class="h-3 w-3 shrink-0 opacity-80"
              :style="{ color: kindColor(t.location) }"
            />
            <button
              type="button"
              class="flex-1 cursor-pointer truncate text-left hover:underline"
              @click="focusTarget(t.location)"
            >
              {{ t.location.label ?? kindLabel(t.location) }}
            </button>
            <button
              type="button"
              class="cursor-pointer opacity-70 hover:opacity-100"
              @click="removeTarget(t.location.id)"
            >
              ✕
            </button>
          </div>
        </div>

        <div
          v-if="selected"
          class="pointer-events-auto absolute bottom-3 left-1/2 flex w-[min(280px,90%)] -translate-x-1/2 flex-col gap-1.5 rounded-md bg-panel/95 p-3 text-sm shadow-lg"
        >
          <div class="flex items-center gap-2">
            <span
              class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
              :style="{ backgroundColor: `${kindColor(selected)}26`, color: kindColor(selected) }"
            >
              <component
                :is="kindIcon(selected)"
                class="h-3.5 w-3.5"
              />
            </span>
            <div class="min-w-0">
              <div class="truncate font-semibold">
                {{ selected.label ?? kindLabel(selected) }}
              </div>
              <div
                class="text-xs font-medium"
                :style="{ color: kindColor(selected) }"
              >
                {{ kindLabel(selected) }}
              </div>
            </div>
          </div>
          <div class="text-xs opacity-90">
            {{ formatDistance(selectedDistanceKm) }}
          </div>
          <div class="mt-1 flex gap-2">
            <button
              v-if="!selectedIsTarget"
              type="button"
              class="flex-1 cursor-pointer rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="targetList.length >= MAX_NAVIGATION_TARGETS"
              @click="setTarget"
            >
              Wyznacz cel
            </button>
            <button
              v-else
              type="button"
              class="flex-1 cursor-pointer rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/20"
              @click="removeTarget(selected.id)"
            >
              Usuń cel
            </button>
            <button
              type="button"
              class="cursor-pointer rounded-md bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10"
              @click="selected = null"
            >
              Zamknij
            </button>
          </div>
        </div>
      </div>
      <div class="px-4 py-2 text-[11px] opacity-60">
        {{ touch ? 'Przeciągnij — przesuń · uszczypnij — zoom · dotknij lokacji — informacje · zamknij' : 'Przeciągnij — przesuń · kółko — zoom · kliknij lokację — informacje · Esc / M — zamknij' }}
      </div>
    </div>
  </div>
</template>
