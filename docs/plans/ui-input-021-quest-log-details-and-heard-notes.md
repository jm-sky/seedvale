# Plan: Quest log details i usłyszane notatki

**Created:** 2026-09-15
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~ui-input-017~~, ~~quests-progression-033~~
**Domain:** `ui-input`
**Subdomains:** `menus`
**Tags:** `quests` `dialogue`
**Roadmap:** `quests-and-reputation.md`

## Cel

Quest Log ma krótką listę i Details. Details pokazuje notatki z **już usłyszanego** zlecenia: data świata, autor (NPC albo obserwacja), treść cytatu. Dzięki temu briefing (w tym wskazania miejsca z dialogu / planu 035) nie ginie po zamknięciu rozmowy.

To noteska zobowiązań, nie lore journal wszystkich możliwych kwestii.

## Kontrakt notatki

Player-facing (DTO z `list()`, Vue nie czyta `QuestDef`):

- **data** — `Dzień N · HH:MM` z `elapsedDays` + `timeOfDay` w momencie usłyszenia (`formatClock` / `formatWorldDayClock` w `src/world/dayNight.ts`)
- **autor** — `giverName` / nazwa NPC, albo `Obserwacja` gdy `progressLine` pada przy obiekcie świata, nie przy NPC
- **treść** — zaktualizowany tekst z `QuestDef` (`offerLine`, `progressLine`, `dialogueActions.npcLine`, `resultText` / `reportLine`), **nie** kopia zapisywana w save

Persistowany rekord na `QuestProgressEntry` (optional, jak `stageSlotProgress` / `offerSuppressedUntilDay`; **bez bumpa** `CURRENT_SAVE_VERSION`):

```ts
journal?: readonly {
  kind: 'offer' | 'progress' | 'result'
  stageIndex?: number
  dialogueActionIndex?: number
  speakerNpcId?: NpcId
  atDays: number
  timeOfDay: number
}[]
```

Treść zawsze projectowana z def + `kind`/`stageIndex`/`dialogueActionIndex`. Zmiana authored tekstu po loście pokazuje aktualną linię przy zachowanej dacie.

## Kiedy stempel

Idempotentnie, przez istniejący `QuestWorldTimeLookup` w `QuestManager`:

| Zdarzenie | kind | speaker | treść |
|---|---|---|---|
| przejście na `offered` (`admitOffersForGiver`) | `offer` | giver | `offerLine` |
| ukończenie stage z `progressLine` | `progress` | talk-target albo brak (obserwacja) | ten `progressLine` |
| wybrana `dialogueActions.npcLine` przy advance stage | `progress` | NPC akcji | `npcLine` |
| terminal `complete` / `failed` / `abandoned` | `result` | giver | `resultText` / `reportLine` / linia abandon |

Nie stempelować: `reminderLine`, `reportPromptLine` zanim padnie report, niewybranych choice/dialogueActions, ukrytych nagród, `not_offered`.

Decline / powrót do `not_offered`: wyczyścić `journal`. Abandon zostawia notatki + `result`.

Stare save'y: puste `journal`. Dla już `offered`/`active`/`ready_to_report`/`terminal` zrekonstruować tylko `offer` (i `result` jeśli terminal) **bez daty**. Nie zgadywać historycznych `progressLine`.

## UI

Wzorzec jak inventory: ten sam overlay, `list | details`, Esc najpierw wraca do listy.

- **Lista:** kompakt — tytuł, dający, stan, bieżący cel, wyróżnienie `ready_to_report`. Cała karta otwiera Details. Buckety bez zmian.
- **Details:** tytuł, opis, notatki chronologicznie (data · autor · cytat), cel, nagroda, relacja.

Vue nie interpretuje `id` / `kind` / `stageIndex` / `resolvedOutcomeId`.

## Poza zakresem

HUD tracker, markery mapy, transkrypt wszystkich dialogów NPC, player lines, drugi owner stanu, lore journal, bump save version, grupowanie `groupKey`.

## Weryfikacja

- Testy `QuestManager`: offer stamp raz; progress tylko po usłyszeniu; decline czyści; export/restore daty; stary save bez `journal` dostaje syntetyczny offer bez daty.
- Lista skanowalna; Details po kliku; Esc lista → zamknięcie.
- `zwiadowca` na etapie kamieni: w Details nadal `offerLine` Piotra + ewentualne `progressLine`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
