<script setup lang="ts">
import { Minus, Plus } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { isTouchDevice } from '../../input/isTouchDevice'
import {
  drawMinimapFrame,
  type MinimapSettlement,
  minimapSize,
  registerMinimapDrawer,
} from '../lib/drawMinimap'
import { toggleMinimap, ui } from '../store'
import type { Vector3 } from 'three'

const touch = isTouchDevice()
const size = minimapSize(touch)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let ctx: CanvasRenderingContext2D | null = null

const shellClass = computed(() =>
  touch
    ? 'pointer-events-none fixed z-[8] flex flex-col items-end gap-1'
    : 'pointer-events-none fixed z-[8] flex flex-col-reverse items-start gap-1',
)

const shellStyle = computed(() =>
  touch
    ? {
        // Below TouchChrome pause (44px) + 8px gap; matches former top-right cluster.
        top: 'max(68px, calc(env(safe-area-inset-top) + 52px))',
        right: 'max(16px, env(safe-area-inset-right))',
      }
    : {
        bottom: '10px',
        left: '10px',
      },
)

function setupCanvas(canvas: HTMLCanvasElement): void {
  const dpr = window.devicePixelRatio || 1
  canvas.width = size * dpr
  canvas.height = size * dpr
  canvas.style.width = `${size}px`
  canvas.style.height = `${size}px`
  ctx = canvas.getContext('2d')
  ctx?.scale(dpr, dpr)
}

function draw(playerPos: Vector3, settlements: readonly MinimapSettlement[], yaw: number): void {
  if (ui.minimap.collapsed || !ctx) return
  drawMinimapFrame({ ctx, size }, playerPos, settlements, yaw)
}

onMounted(() => {
  const canvas = canvasRef.value
  if (canvas) setupCanvas(canvas)
  registerMinimapDrawer(draw)
})

onUnmounted(() => {
  registerMinimapDrawer(null)
  ctx = null
})

watch(canvasRef, (canvas) => {
  if (canvas && !ctx) setupCanvas(canvas)
})
</script>

<template>
  <div
    :class="shellClass"
    :style="shellStyle"
  >
    <!-- On touch, pause sits above the minimap in TouchChrome; here only the
         map + toggle. Absolute canvas when expanded so layout doesn't shove
         into the bottom-right action cluster. -->
    <button
      type="button"
      class="pointer-events-auto flex min-h-8 min-w-8 cursor-pointer items-center justify-center rounded border border-white/25 bg-[rgba(20,24,28,0.72)] px-2 py-0.5 text-ink hover:bg-[rgba(20,24,28,0.9)]"
      :aria-label="ui.minimap.collapsed ? 'Pokaż minimapę' : 'Ukryj minimapę'"
      @click="toggleMinimap"
    >
      <Plus
        v-if="ui.minimap.collapsed"
        :size="14"
      />
      <Minus
        v-else
        :size="14"
      />
    </button>
    <canvas
      v-show="!ui.minimap.collapsed"
      ref="canvasRef"
      class="pointer-events-none block rounded-md border border-white/25 shadow-[0_4px_16px_rgba(0,0,0,0.35)]"
      :class="touch ? 'absolute top-full right-0 mt-1' : ''"
    />
  </div>
</template>
