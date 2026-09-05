<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import UiButton from '@/components/UiButton.vue'
import UiPanel from '@/components/UiPanel.vue'
import {
  clearSeedCache,
  countCacheForSeed,
  deleteSeedGuarded,
  displaySeedName,
  listSeedRecords,
  renameSeedRecord,
  type SeedRecord,
  updateSeedDescription,
  updateSeedTags,
} from '../../world/seedLibrary'

/** Boot/main-menu seed management (plan world-015 §8) — a short-lived view
 *  within the boot `StartScreen` app. Every read/write here is triggered by
 *  an explicit user action (mount, button click), never a computed/render
 *  path — opening this screen must never itself trigger worldgen or a
 *  location scan; it only ever touches `SeedRecord`/`worldgenCache`
 *  metadata. */
const props = defineProps<{
  /** Healthy-save seed reference counts (plan §10/§14 delete guard) — owned
   *  by the caller, which already has the save-management listing. */
  saveCountsBySeed: Record<number, number>
}>()

const emit = defineEmits<{
  close: []
  /** Bubble a "use this seed for New Game" pick up to the caller. */
  useSeed: [seed: number]
}>()

const seeds = ref<SeedRecord[]>([])
const cacheCounts = ref<Record<number, number>>({})
const loading = ref(true)

onMounted(() => {
  void refresh()
})

async function refresh(): Promise<void> {
  loading.value = true
  const list = await listSeedRecords()
  seeds.value = list
  const counts: Record<number, number> = {}
  await Promise.all(list.map(async (record) => {
    counts[record.seed] = await countCacheForSeed(record.seed)
  }))
  cacheCounts.value = counts
  loading.value = false
}

const sortedSeeds = computed(() => [...seeds.value].sort((a, b) => b.lastUsedAt - a.lastUsedAt))

function saveCount(seed: number): number {
  return props.saveCountsBySeed[seed] ?? 0
}

async function rename(record: SeedRecord): Promise<void> {
  const next = window.prompt('Nazwa seeda (puste = przywróć wygenerowaną nazwę):', record.customName ?? '')
  if (next === null) return
  await renameSeedRecord(record.seed, next)
  await refresh()
}

async function editDescription(record: SeedRecord): Promise<void> {
  const next = window.prompt('Opis seeda:', record.description ?? '')
  if (next === null) return
  await updateSeedDescription(record.seed, next)
  await refresh()
}

async function editTags(record: SeedRecord): Promise<void> {
  const next = window.prompt('Tagi (oddzielone przecinkiem):', record.tags.join(', '))
  if (next === null) return
  await updateSeedTags(record.seed, next.split(','))
  await refresh()
}

async function clearCache(record: SeedRecord): Promise<void> {
  if (!window.confirm(`Wyczyścić cache dla „${displaySeedName(record)}”? Metadane i zapisy pozostaną nietknięte.`)) return
  await clearSeedCache(record.seed)
  await refresh()
}

async function removeSeed(record: SeedRecord): Promise<void> {
  if (saveCount(record.seed) > 0) return
  if (!window.confirm(`Usunąć seed „${displaySeedName(record)}” z biblioteki? Tej operacji nie można cofnąć.`)) return
  const inUse = new Set(Object.entries(props.saveCountsBySeed).filter(([, count]) => count > 0).map(([seed]) => Number(seed)))
  const result = await deleteSeedGuarded(record.seed, inUse)
  if (!result.ok) {
    window.alert('Ten seed jest używany przez zapisy i nie może zostać usunięty.')
    return
  }
  await refresh()
}

function useForNewGame(record: SeedRecord): void {
  emit('useSeed', record.seed)
}
</script>

<template>
  <UiPanel>
    <UiButton
      class="mb-3 w-full"
      @click="emit('close')"
    >
      Wróć
    </UiButton>
    <h2 class="mb-3 text-left text-xs font-semibold uppercase tracking-widest opacity-60">
      Biblioteka seedów
    </h2>

    <p
      v-if="loading"
      class="text-left text-sm opacity-70"
    >
      Wczytywanie…
    </p>

    <div
      v-else
      class="flex max-h-[50vh] flex-col gap-2 overflow-y-auto"
    >
      <div
        v-for="record in sortedSeeds"
        :key="record.seed"
        class="rounded-md border border-white/15 bg-white/5 p-3 text-left text-sm"
      >
        <div class="flex items-baseline justify-between gap-2">
          <span class="font-semibold">{{ displaySeedName(record) }}</span>
          <span class="shrink-0 font-mono text-[11px] opacity-60">seed {{ record.seed }}</span>
        </div>
        <p
          v-if="record.description"
          class="mt-1 text-[12px] opacity-75"
        >
          {{ record.description }}
        </p>
        <p
          v-if="record.tags.length"
          class="mt-1 text-[11px] opacity-60"
        >
          {{ record.tags.map((t) => `#${t}`).join(' ') }}
        </p>
        <p class="mt-1 text-[11px] opacity-50">
          Ostatnio używany: {{ new Date(record.lastUsedAt).toLocaleString() }} ·
          zapisy: {{ saveCount(record.seed) }} ·
          cache: {{ cacheCounts[record.seed] ? `${cacheCounts[record.seed]} kafli` : 'brak' }}
        </p>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <UiButton
            class="!px-2 !py-1 text-[11px]"
            @click="useForNewGame(record)"
          >
            Nowa gra
          </UiButton>
          <UiButton
            class="!px-2 !py-1 text-[11px]"
            @click="rename(record)"
          >
            Zmień nazwę
          </UiButton>
          <UiButton
            class="!px-2 !py-1 text-[11px]"
            @click="editDescription(record)"
          >
            Opis
          </UiButton>
          <UiButton
            class="!px-2 !py-1 text-[11px]"
            @click="editTags(record)"
          >
            Tagi
          </UiButton>
          <UiButton
            class="!px-2 !py-1 text-[11px]"
            :disabled="!cacheCounts[record.seed]"
            @click="clearCache(record)"
          >
            Wyczyść cache
          </UiButton>
          <UiButton
            variant="danger"
            class="!px-2 !py-1 text-[11px]"
            :disabled="saveCount(record.seed) > 0"
            :title="saveCount(record.seed) > 0 ? 'Seed używany przez zapisy' : ''"
            @click="removeSeed(record)"
          >
            Usuń
          </UiButton>
        </div>
      </div>

      <p
        v-if="sortedSeeds.length === 0"
        class="text-sm opacity-60"
      >
        Biblioteka seedów jest pusta.
      </p>
    </div>
  </UiPanel>
</template>
