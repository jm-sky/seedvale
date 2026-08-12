<script setup lang="ts">
import { computed, onMounted, onUnmounted, type Ref, watch } from 'vue'
import type { AssetViewer } from '../viewer/createViewer'
import { buildAssetIndex, findAssetEntry } from '../../../assets/assetIndex'
import { browserState, slotDiagnostics } from '../state'
import { boundsData } from '../viewer/createAssetSlot'
import { captureSnapshot, copyText } from '../viewer/createSnapshot'

const props = defineProps<{ viewerRef: Ref<AssetViewer | null> }>()
const viewer = computed(() => props.viewerRef.value)

const assetIndex = buildAssetIndex()
const grouped = computed(() => {
  const map = new Map<string, typeof assetIndex>()
  for (const entry of assetIndex) {
    const list = map.get(entry.group) ?? []
    list.push(entry)
    map.set(entry.group, list)
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
})

function syncSlot(which: 'reference' | 'target') {
  if (!viewer.value) return
  const slot = which === 'reference' ? viewer.value.reference : viewer.value.target
  const diag = slotDiagnostics[which]
  diag.entry = slot.entry
  diag.url = slot.url
  const box = slot.getBounds()
  diag.bounds = box ? boundsData(box) : null
  diag.anchors = slot.anchors.map((a) => ({
    name: a.def.name,
    type: a.def.type ?? null,
    source: a.source,
    issues: [],
  }))
  const g = slot.group
  diag.transform = {
    position: [g.position.x, g.position.y, g.position.z],
    rotationDeg: [
      g.rotation.x * 180 / Math.PI,
      g.rotation.y * 180 / Math.PI,
      g.rotation.z * 180 / Math.PI,
    ],
    scale: [g.scale.x, g.scale.y, g.scale.z],
  }
}

async function loadReference() {
  if (!viewer.value) return
  const entry = browserState.referenceId ? findAssetEntry(browserState.referenceId) : null
  await viewer.value.loadReference(entry ?? null, entry?.url)
  syncSlot('reference')
}

async function loadTarget() {
  if (!viewer.value) return
  if (browserState.freeUrl.trim()) {
    await viewer.value.loadTarget({
      id: 'custom:url',
      url: browserState.freeUrl.trim(),
      label: 'Custom URL',
      group: 'other',
      prepare: { mode: 'fitMax', value: 1 },
      skinned: false,
      anchors: [],
    }, browserState.freeUrl.trim())
  } else {
    const entry = browserState.targetId ? findAssetEntry(browserState.targetId) : null
    await viewer.value.loadTarget(entry ?? null, entry?.url)
  }
  syncSlot('target')
}

watch(() => viewer.value, (v) => {
  if (!v) return
  void loadReference()
  if (browserState.targetId || browserState.freeUrl) void loadTarget()
})
watch(() => browserState.referenceId, loadReference)
watch(() => browserState.targetId, loadTarget)
watch(() => browserState.freeUrl, () => { if (browserState.freeUrl.trim()) void loadTarget() })
watch(browserState, () => viewer.value?.refresh(), { deep: true })

onMounted(() => {
  const ro = new ResizeObserver(() => viewer.value?.resize())
  const el = document.getElementById('asset-browser-viewport')
  if (el) ro.observe(el)
  onUnmounted(() => ro.disconnect())
})

async function copyReport() {
  if (!viewer.value) return
  await copyText(browserState.reportText)
  browserState.statusMessage = 'Report copied'
}

async function saveSnapshot() {
  if (!viewer.value) return
  const blob = await captureSnapshot(viewer.value.getCanvas(), browserState.reportText)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'alignment-snapshot.png'
  a.click()
  URL.revokeObjectURL(url)
  browserState.statusMessage = 'Snapshot saved'
}

function heldAttachSnippet() {
  const t = slotDiagnostics.target.transform
  return `// HELD_ATTACH snippet\nposition: [${t.position.map((n) => n.toFixed(3)).join(', ')}],\nrotation: [${t.rotationDeg.map((n) => (n * Math.PI / 180).toFixed(4)).join(', ')}],\nscale: ${t.scale[0].toFixed(2)},`
}

function lampMountSnippet() {
  const t = slotDiagnostics.target.transform
  return `lampMount: { x: ${t.position[0].toFixed(3)}, y: ${t.position[1].toFixed(3)}, z: ${t.position[2].toFixed(3)} }`
}
</script>

<template>
  <div class="flex h-full w-full text-sm text-slate-100">
    <aside class="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-r border-slate-700 bg-slate-900/95 p-3">
      <h1 class="text-base font-semibold">
        Asset Alignment Browser
      </h1>

      <section>
        <h2 class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Reference
        </h2>
        <select
          v-model="browserState.referenceId"
          class="w-full rounded bg-slate-800 px-2 py-1"
        >
          <option :value="null">
            — none —
          </option>
          <optgroup
            v-for="[group, entries] in grouped"
            :key="group"
            :label="group"
          >
            <option
              v-for="e in entries"
              :key="e.id"
              :value="e.id"
            >
              {{ e.label }}
            </option>
          </optgroup>
        </select>
        <label class="mt-2 block text-xs text-slate-400">Anchor</label>
        <select
          v-model="browserState.referenceAnchor"
          class="w-full rounded bg-slate-800 px-2 py-1"
        >
          <option :value="null">
            —
          </option>
          <option
            v-for="a in slotDiagnostics.reference.anchors"
            :key="a.name"
            :value="a.name"
          >
            {{ a.name }}
          </option>
        </select>
        <button
          class="mt-2 w-full rounded bg-slate-700 px-2 py-1 hover:bg-slate-600"
          @click="viewer?.reloadReference()"
        >
          Reload reference
        </button>
      </section>

      <section>
        <h2 class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Target
        </h2>
        <select
          v-model="browserState.targetId"
          class="w-full rounded bg-slate-800 px-2 py-1"
        >
          <option :value="null">
            — none —
          </option>
          <optgroup
            v-for="[group, entries] in grouped"
            :key="`t-${group}`"
            :label="group"
          >
            <option
              v-for="e in entries"
              :key="e.id"
              :value="e.id"
            >
              {{ e.label }}
            </option>
          </optgroup>
        </select>
        <label class="mt-2 block text-xs text-slate-400">Free URL</label>
        <input
          v-model="browserState.freeUrl"
          class="w-full rounded bg-slate-800 px-2 py-1"
          placeholder="/models/..."
        >
        <label class="mt-2 block text-xs text-slate-400">Anchor</label>
        <select
          v-model="browserState.targetAnchor"
          class="w-full rounded bg-slate-800 px-2 py-1"
        >
          <option :value="null">
            —
          </option>
          <option
            v-for="a in slotDiagnostics.target.anchors"
            :key="a.name"
            :value="a.name"
          >
            {{ a.name }}
          </option>
        </select>
        <button
          class="mt-2 w-full rounded bg-slate-700 px-2 py-1 hover:bg-slate-600"
          @click="viewer?.reloadTarget()"
        >
          Reload target
        </button>
      </section>

      <section
        v-if="browserState.invalidSelection"
        class="rounded border border-amber-600/50 bg-amber-950/40 p-2 text-amber-200"
      >
        Missing after reload: {{ browserState.invalidSelection }}
      </section>

      <section>
        <h2 class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Transform (target)
        </h2>
        <div class="grid grid-cols-3 gap-1 text-xs">
          <template
            v-for="(label, i) in ['X','Y','Z']"
            :key="label"
          >
            <label>{{ label }}</label>
            <input
              type="number"
              step="0.001"
              class="col-span-2 rounded bg-slate-800 px-1"
              :value="slotDiagnostics.target.transform.position[i]"
              @change="(e) => {
                const v = Number((e.target as HTMLInputElement).value)
                const p = [...slotDiagnostics.target.transform.position] as [number,number,number]
                p[i] = v
                viewer?.setTargetTransform({ position: p })
              }"
            >
          </template>
        </div>
        <div class="mt-2 flex gap-1">
          <button
            class="flex-1 rounded bg-blue-700 px-2 py-1 hover:bg-blue-600"
            @click="viewer?.align('frame')"
          >
            Align frame
          </button>
          <button
            class="flex-1 rounded bg-blue-800 px-2 py-1 hover:bg-blue-700"
            @click="viewer?.align('position')"
          >
            Align pos
          </button>
        </div>
        <button
          class="mt-1 w-full rounded bg-slate-700 px-2 py-1"
          @click="viewer?.resetTargetTransform()"
        >
          Reset transform
        </button>
      </section>

      <section>
        <h2 class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Rendering
        </h2>
        <select
          v-model="browserState.renderMode"
          class="mb-1 w-full rounded bg-slate-800 px-2 py-1"
        >
          <option value="diagnostic">
            Diagnostic
          </option>
          <option value="game-like">
            Game-like
          </option>
        </select>
        <select
          v-model="browserState.lightingPreset"
          class="mb-1 w-full rounded bg-slate-800 px-2 py-1"
        >
          <option value="alignment">
            Alignment
          </option>
          <option value="daylight">
            Daylight
          </option>
          <option value="night">
            Night
          </option>
          <option value="torch">
            Torch
          </option>
        </select>
        <label class="flex items-center gap-2 text-xs"><input
          v-model="browserState.showGrid"
          type="checkbox"
        > Grid</label>
        <label class="flex items-center gap-2 text-xs"><input
          v-model="browserState.showAxes"
          type="checkbox"
        > Axes</label>
        <label class="flex items-center gap-2 text-xs"><input
          v-model="browserState.showGround"
          type="checkbox"
        > Ground</label>
        <label class="flex items-center gap-2 text-xs"><input
          v-model="browserState.showBbox"
          type="checkbox"
        > Bounds</label>
        <label class="flex items-center gap-2 text-xs"><input
          v-model="browserState.wireframe"
          type="checkbox"
        > Wireframe</label>
        <label class="mt-1 block text-xs text-slate-400">Pose</label>
        <select
          v-model="browserState.pose"
          class="w-full rounded bg-slate-800 px-2 py-1"
        >
          <option value="rest">
            Rest / bind
          </option>
          <option value="idle">
            Idle@t=0
          </option>
        </select>
        <label
          v-if="browserState.lightingPreset === 'torch'"
          class="mt-2 block text-xs"
        >Torch fuel {{ Math.round(browserState.torchFuelRatio * 100) }}%</label>
        <input
          v-if="browserState.lightingPreset === 'torch'"
          v-model.number="browserState.torchFuelRatio"
          type="range"
          min="0.05"
          max="1"
          step="0.05"
          class="w-full"
        >
      </section>

      <section>
        <h2 class="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Snippets
        </h2>
        <pre class="max-h-24 overflow-auto rounded bg-slate-950 p-2 text-[10px]">{{ heldAttachSnippet() }}</pre>
        <pre class="mt-1 max-h-16 overflow-auto rounded bg-slate-950 p-2 text-[10px]">{{ lampMountSnippet() }}</pre>
      </section>

      <section class="flex gap-1">
        <button
          class="flex-1 rounded bg-emerald-700 px-2 py-1 hover:bg-emerald-600"
          @click="copyReport"
        >
          Copy report
        </button>
        <button
          class="flex-1 rounded bg-emerald-800 px-2 py-1 hover:bg-emerald-700"
          @click="saveSnapshot"
        >
          Snapshot
        </button>
      </section>

      <p class="text-xs text-slate-500">
        {{ browserState.statusMessage }}
      </p>
    </aside>

    <div class="relative min-w-0 flex-1">
      <div
        id="asset-browser-viewport"
        class="absolute inset-0"
      />
      <pre class="pointer-events-none absolute bottom-0 left-0 right-0 max-h-40 overflow-auto bg-black/60 p-2 text-[10px] leading-tight text-slate-200">{{ browserState.reportText }}</pre>
    </div>
  </div>
</template>
