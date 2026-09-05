<script setup lang="ts">
import { computed } from 'vue'
import { displaySeedName, isSeedInLibrary, type SeedChoice, type SeedRecord } from '../../world/seedLibrary'

const props = defineProps<{
  seeds: readonly SeedRecord[]
  modelValue: SeedChoice
  /** Optional DOM id so a `<label for>` can target this control from the parent. */
  id?: string
  /** Explicit `?seed=` detected at boot (plan persistence-004 §9 follow-up),
   *  `null` when the URL carries none. Rendered as a temporary "z query
   *  param" option — never written to the Seed Library just for appearing
   *  here — and omitted when that seed is already a library entry, so the
   *  same seed is never listed twice. */
  urlSeed?: number | null
}>()

const emit = defineEmits<{
  'update:modelValue': [choice: SeedChoice]
}>()

// Most-recently-used first (plan world-015 §4/§8) — the display name is the
// primary information, the seed number secondary/technical. Rendering this
// list never reads/materializes worldgen itself, only already-loaded
// `SeedRecord` metadata passed in from the boot/in-game caller.
const sortedSeeds = computed(() => [...props.seeds].sort((a, b) => b.lastUsedAt - a.lastUsedAt))

const showUrlSeedOption = computed(() => props.urlSeed != null && !isSeedInLibrary(props.urlSeed, props.seeds))

const selectValue = computed<string>({
  get: () => (props.modelValue.kind === 'existing' ? String(props.modelValue.seed) : 'generate'),
  set: (raw) => {
    emit('update:modelValue', raw === 'generate' ? { kind: 'generate' } : { kind: 'existing', seed: Number(raw) })
  },
})
</script>

<template>
  <select
    :id="id"
    v-model="selectValue"
    class="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-blue-400/60"
  >
    <option
      v-if="showUrlSeedOption"
      :value="String(urlSeed)"
    >
      Seed {{ urlSeed }} z query param
    </option>
    <option
      v-for="seed in sortedSeeds"
      :key="seed.seed"
      :value="String(seed.seed)"
    >
      {{ displaySeedName(seed) }} (seed {{ seed.seed }})
    </option>
    <option value="generate">
      Wygeneruj nowy seed
    </option>
  </select>
</template>
