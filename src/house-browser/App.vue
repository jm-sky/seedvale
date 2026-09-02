<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { HOME_HOUSE_DEFINITIONS } from '../assets/houseDefinitionExample'
import CameraControls from './components/CameraControls.vue'
import ColliderControls from './components/ColliderControls.vue'
import HouseInfo from './components/HouseInfo.vue'
import HouseList from './components/HouseList.vue'
import SceneControls from './components/SceneControls.vue'
import { createHouseBrowserScene } from './houseBrowserScene'
import {
  type CameraView,
  DEFAULT_HOUSE_BROWSER_CONFIG,
  type HouseBrowserAssemblyInfo,
  type HouseBrowserScene,
} from './houseBrowserTypes'

const houses = HOME_HOUSE_DEFINITIONS

function getInitialHouseId(): string {
  const url = new URL(window.location.href)
  const param = url.searchParams.get('house')

  if (param && houses.some((h) => h.id === param)) return param
  if (param) clearQueryParam('house')

  return houses[0]?.id ?? ''
}

function getInitialColliderVisibility(): boolean {
  const url = new URL(window.location.href)
  const param = url.searchParams.get('showColliders')
  return param ? Boolean(param) : DEFAULT_HOUSE_BROWSER_CONFIG.showColliders
}

function getInitialDoorsOpen(): boolean {
  const url = new URL(window.location.href)
  const param = url.searchParams.get('doorsOpen')
  return param ? Boolean(param) : DEFAULT_HOUSE_BROWSER_CONFIG.doorsOpen
}

const viewport = ref<HTMLElement | null>(null)
const selectedId = ref(getInitialHouseId())
const config = reactive({ ...DEFAULT_HOUSE_BROWSER_CONFIG, showColliders: getInitialColliderVisibility(), doorsOpen: getInitialDoorsOpen() })
const assemblyInfo = ref<HouseBrowserAssemblyInfo | null>(null)
const errorMessage = ref<string | null>(null)

let scene: HouseBrowserScene | null = null

onMounted(() => {
  if (!viewport.value) return
  scene = createHouseBrowserScene(viewport.value, {
    onAssemblyChange: (info) => {
      assemblyInfo.value = info
      errorMessage.value = null
    },
    onError: (message) => {
      errorMessage.value = message
    },
  })
  scene.setConfig({ ...config })
  if (selectedId.value) void scene.setHouse(selectedId.value)
})

onUnmounted(() => {
  scene?.dispose()
  scene = null
})

watch(selectedId, (id) => {
  if (id) void scene?.setHouse(id)
})

watch(config, () => {
  scene?.setConfig({ ...config })
})

function putIntoQueryParam(name: string, value: string): void {
  const url = new URL(window.location.href)
  url.searchParams.set(name, value)
  window.history.replaceState({}, '', url)
}

function clearQueryParam(name: string): void {
  const url = new URL(window.location.href)
  url.searchParams.delete(name)
  window.history.replaceState({}, '', url)
}

function selectHouse(id: string): void {
  putIntoQueryParam('house', id)
  selectedId.value = id
}

function resetCamera(): void {
  scene?.resetCamera()
}

function setCameraView(view: CameraView): void {
  scene?.setCameraView(view)
}

function updateColliderVisibility(visible: boolean): void {
  config.showColliders = visible
  putIntoQueryParam('showColliders', visible.toString())
}

function updateDoorsOpen(doorsOpen: boolean): void {
  config.doorsOpen = doorsOpen
  putIntoQueryParam('doorsOpen', doorsOpen.toString())
}
</script>

<template>
  <div class="flex h-full w-full bg-[#14181c] text-ink">
    <aside class="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r border-white/10 bg-black/20 p-4">
      <h1 class="text-lg font-semibold tracking-wide">
        House Browser
      </h1>
      <HouseList
        :houses="houses"
        :selected-id="selectedId"
        @select="selectHouse"
      />
      <HouseInfo
        :definition="houses.find((h) => h.id === selectedId) ?? null"
        :assembly-info="assemblyInfo"
      />
      <SceneControls
        v-model:show-grid="config.showGrid"
        v-model:show-ground="config.showGround"
        v-model:show-shadows="config.showShadows"
        v-model:camera-auto-fit="config.cameraAutoFit"
      />
      <ColliderControls
        v-model:padding="config.colliderPadding"
        :doors-open="config.doorsOpen"
        :visible="config.showColliders"
        :door-count="assemblyInfo?.doorCount ?? 0"
        @update:doors-open="updateDoorsOpen($event)"
        @update:visible="updateColliderVisibility($event)"
      />
      <CameraControls
        @reset="resetCamera"
        @view="setCameraView"
      />
      <p
        v-if="errorMessage"
        class="rounded bg-red-950/60 p-2 text-xs text-red-200"
      >
        {{ errorMessage }}
      </p>
    </aside>
    <main class="relative flex-1">
      <div
        ref="viewport"
        class="absolute inset-0"
      />
    </main>
  </div>
</template>
