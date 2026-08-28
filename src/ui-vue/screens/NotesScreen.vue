<script setup lang="ts">
import { ref } from 'vue'
import { isTouchDevice } from '../../input/isTouchDevice'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { useTouchScroll } from '../composables/useTouchScroll'
import { closeNotes, isNotesOpen, ui } from '../store'

type NoteEntry = { title: string; body: string }

const panel = ref<HTMLElement | null>(null)
useOverlayScreen('notes', isNotesOpen, closeNotes)
useTouchScroll(panel)

/** Condensed from `docs/VISION.md` §1 ("What Seedvale is"), §2 ("The central
 *  idea") and §5 ("The experience we want") — static world lore, not a
 *  dynamic event log (plan 005 v1 scope: read-only, like the villagers
 *  screen). Quest lore already has its own screen (`QuestLogScreen.vue`), so
 *  it's deliberately not duplicated here. */
const NOTES: readonly NoteEntry[] = [
  {
    title: 'Seedvale',
    body: 'Przeglądarkowy sandbox 3D osadzony w proceduralnie generowanym, żywym świecie. Wioski, ludzie, zwierzęta, zasoby i cykl dnia/nocy żyją własnym rytmem — świat nie istnieje tylko po to, żeby dostarczać treść graczowi.',
  },
  {
    title: 'Zasiej ziarno. Patrz, jak świat rośnie.',
    body: 'Świat sprawia wrażenie, jakby żył już przed przyjściem gracza — i będzie żył dalej, gdy ten odejdzie. Nie jesteś wybrańcem ani centrum symulacji: możesz stać się ważny dla konkretnych ludzi i miejsc, ale świat na ciebie nie czeka.',
  },
  {
    title: 'Twoja historia w większej historii świata',
    body: 'Wędruj zamiast podążać wyznaczoną trasą. Rozpoznawaj ludzi po charakterze i historii, nie po znacznikach questów. Obserwuj wydarzenia, które nie zostały napisane specjalnie dla ciebie — i zastanawiaj się, co wydarzyło się, gdy cię nie było.',
  },
]

const CONTROLS: NoteEntry = {
  title: 'Sterowanie',
  body: isTouchDevice()
    ? 'Joystick — ruch · przeciągnij ekran — rozglądanie · E — interakcja · L — zadania · I — ekwipunek · U — umiejętności · minimapa — mapa świata · przycisk ⚡ — szybkie akcje · odciski — umiejętności · dotknij poza oknem — zamknij'
    : 'WASD / strzałki — ruch · Shift — bieg · mysz (klik) — rozglądanie · Spacja — skok · E — interakcja · T — zejdź z wierzchowca · L — zadania · I — ekwipunek · U — umiejętności · G — upuść · Q — szybkie akcje · M — mapa · Esc — pauza',
}
</script>

<template>
  <div
    v-if="ui.notes.open"
    class="pointer-events-auto fixed inset-0 z-10 flex items-center justify-center bg-panel-backdrop backdrop-blur-[2px]"
    @click.self="closeNotes"
  >
    <div
      ref="panel"
      class="max-h-[calc(100dvh-32px)] w-full max-w-xl overflow-y-auto rounded-[10px] bg-panel p-5 text-ink shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
      style="touch-action: pan-y"
    >
      <h1 class="mb-4 text-lg font-semibold tracking-wide">
        Notatki
      </h1>

      <div class="flex flex-col gap-3">
        <div
          v-for="entry in [...NOTES, CONTROLS]"
          :key="entry.title"
          class="rounded-md bg-white/5 p-3"
        >
          <div class="mb-1 text-sm font-semibold">
            {{ entry.title }}
          </div>
          <p class="text-sm leading-relaxed opacity-85">
            {{ entry.body }}
          </p>
        </div>
      </div>

      <div class="mt-3 text-[11px] opacity-60">
        Esc — zamknij
      </div>
    </div>
  </div>
</template>
