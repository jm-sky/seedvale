# Plan: Quest marker lifecycle and actionability fixes

**Created:** 2026-09-16
**Status:** `verification needed` 🔍
**Type:** fix
**Priority:** high · **Effort:** M
**Depends on:** quests-progression-034, quests-progression-050
**Domain:** `quests-progression`
**Subdomains:** `quests`
**Tags:** `quest-marker` `npc-label` `dialogue` `streaming` `lifecycle`
**Roadmap:** `quests-and-reputation.md`
**Model:** Sonnet, Composer

## Implementation status

Implemented 2026-09-16. `labelMarker` now uses a shared read-only actionability predicate (`talk_to_npc` / `talk_to_npc_choice` / tellable `receive_world_knowledge` / gated stage `dialogueActions`) so `?` matches live dialogue; reminder plus generic abandon is `…`. Runtime NPC marker sync tracks `NpcAgent` identity via `WeakSet` in `gameLoop` (`src/app/npcQuestMarkerSync.ts`), so a late stream-in or settlement reload still receives the current glyph when `QuestManager` is clean. Automated tests cover actionability, order-independence, and runtime-sink lifecycle. Browser/gameplay verification is user-owned.

## Goal

Naprawić dwa powiązane błędy markerów questowych w labelach NPC:

1. po `New Game` marker może nie pojawić się aż do pierwszej interakcji/dialogu;
2. NPC może dostać `?`, mimo że bieżący dialog nie oferuje żadnej wymaganej akcji questowej i sprowadza się do zwykłego przypomnienia / możliwości porzucenia questa.

Marker ma być poprawną, bieżącą projekcją stanu questów na **konkretny runtime `NpcAgent`**, niezależnie od momentu jego stream-in, oraz ma oznaczać realną akcję dostępną teraz — nie samą obecność NPC w definicji stage.

## Confirmed recon

### 1. Marker sync może zostać zużyty przed utworzeniem NPC

`QuestManager` zachowuje optymalizację `dirty` i startuje z `dirty = true`.

`src/app/gameLoop.ts` przy `questManager.isDirty()`:

- pobiera `bundle.settlementsManager.getLoaded()`,
- ustawia `npc.setQuestMarker(questManager.labelMarker(npc.id))` tylko dla NPC istniejących w aktualnie załadowanych settlementach,
- synchronizuje spawner markers,
- następnie wywołuje `questManager.clearDirty()`.

`src/settlement/SettlementsManager.ts` buduje home settlement asynchronicznie: `home` jest `null` do czasu `homeReady`, a późniejsze settlementy również są streamowane jako nowe runtime obiekty.

Wniosek: globalne `quest dirty` opisuje zmianę domeny questów, ale **nie opisuje lifecycle presentation sinków**. Jeżeli dirty zostanie wyczyszczone zanim dany `NpcAgent` istnieje, nowy agent zachowa domyślne `questMarker = null` aż do następnej mutacji/invalidation questa.

To tłumaczy obserwację `New Game`, ale zakres jest szerszy: ten sam błąd może dotyczyć NPC utworzonych później po stream-in settlementu albo po ponownym utworzeniu runtime settlementu.

### 2. `NpcAgent` jest poprawnie quest-agnostic

`src/ai/NpcAgent.ts` przechowuje tylko presentation state i wystawia `setQuestMarker(marker)`.

Nie przenosić do `NpcAgent` zależności od `QuestManager`, definicji questów ani logiki streamingu. Naprawa lifecycle ma pozostać w warstwie composition/integration.

### 3. Obecna semantyka markerów

`QuestManager` używa:

- `!` — oferta dostępna,
- `…` — aktywny kontekst/reminder,
- `✓` — completion / hand-in / report dostępny teraz,
- `?` — wymagany talk/action target.

Plan `quests-progression-034` ustalił priorytet:

```text
required actionable talk/action target
> ready hand-in/report
> exposed offer
> ordinary active context
> none
```

Ta kolejność pozostaje właściwa.

### 4. `?` nadal opiera się na zbyt szerokim predykacie

W `src/quests/QuestManager.ts` `labelMarker()` dla aktywnych questów używa `isRequiredDialogueTarget(...)` po sprawdzeniu `activeDialogueCooldown(...)`.

`isRequiredDialogueTarget(...)` bierze pod uwagę m.in.:

- niedokończone `talk_to_npc`,
- `talk_to_npc_choice`,
- NPC przypisanych do `stage.dialogueActions`.

Sam fakt, że NPC jest nazwany przez active stage/action, nie jest wystarczającym kontraktem UI. `onInteract()` ma bogatszą logikę ustalającą faktycznie widoczne/wykonywalne contributions, w tym gating, cooldowny i świadome quest actions.

Marker może więc deklarować `?`, podczas gdy aktualny dialog nie daje graczowi wymaganej akcji prowadzącej quest dalej. Generic abandon action (`Przykro mi, jednak nie dam rady ci pomóc.`) jest tylko opt-outem i **nie może sam uzasadniać `?`**.

### 5. Trzeba zachować nowsze mechanizmy dialogue gating

`quests-progression-050` dodał `dialogueCooldowns` i `activeDialogueCooldown(...)` oraz reaction/gating logic. `QuestStageDialogueAction` ma również istniejące wymagania, efekty i world-knowledge gating.

Nowy marker predicate nie może tworzyć uproszczonej kopii tej logiki. Ma korzystać z tych samych read-only helperów, z których wynika faktyczna akcja prezentowana przez `onInteract()`.

## Scope

### A. Inicjalna synchronizacja każdego runtime NPC

Zmienić integration path markerów tak, aby każdy nowo zauważony runtime `NpcAgent` dostał swój aktualny marker nawet wtedy, gdy `QuestManager.isDirty() === false`.

Preferowane rozwiązanie:

- `gameLoop` / mały helper integration-level śledzi **instancje runtime NPC**, nie tylko `NpcId`;
- przy pierwszym napotkaniu danej instancji wywołuje `setQuestMarker(labelMarker(id))`;
- gdy `QuestManager` jest dirty, synchronizuje wszystkie aktualnie loaded NPC tak jak dziś;
- po pełnym dirty-sync można bezpiecznie wywołać `clearDirty()`;
- unload/reload tego samego `NpcId` musi ponownie zsynchronizować nową instancję.

Nie używać trwałego `Set<NpcId>` bez lifecycle cleanup — ten sam stabilny NPC może później dostać nowy runtime `NpcAgent`.

Jeżeli najprostsza implementacja wymaga stanu `WeakSet<NpcAgent>` albo mapy `NpcId -> runtime reference`, stan ten ma należeć do `createGameLoop`/narrow integration helper i nie być persistowany.

### B. Jedna semantyka „actionable now” dla dialogu i markera

W `QuestManager` wydzielić/reużyć najmniejszy read-only zestaw helperów potrzebny do ustalenia, czy dla konkretnego `(def, state, npcId)` istnieje **quest-progressing action dostępna teraz**.

Helper ma uwzględniać istniejące ścieżki:

- `talk_to_npc`,
- `talk_to_npc_choice`,
- `stage.dialogueActions`,
- ich istniejący gating/cooldown,
- unfinished slot state w multi-objective stages.

Nie wywoływać `onInteract()` z `labelMarker()`, ponieważ `onInteract()` może admitować oferty lub mutować stan.

Generic abandonment:

- nie jest required dialogue target,
- nie daje `?`,
- aktywny quest z samym reminderem/abandonmentem daje zwykłe `…` u właściwego givera, o ile żaden marker o wyższym priorytecie nie ma zastosowania.

### C. Zachować marker priority z planu 034

Po poprawce `labelMarker(npcId)` nadal redukuje wiele questów globalnie według:

1. `?` — istnieje required quest action dostępna teraz u tego NPC;
2. `✓` — giver ma completion/hand-in/report dostępny teraz;
3. `!` — nowa oferta faktycznie jest eksponowana teraz;
4. `…` — istnieje ordinary active context/reminder;
5. `null` — brak aktualnego kontekstu questowego.

Kolejność nie może zależeć od kolejności `defs`.

## Tests

### Runtime lifecycle

Dodać test regresyjny obejmujący rzeczywisty kontrakt integration layer:

```text
QuestManager dirty=true
→ frame bez loaded NPC
→ dirty zostaje wyczyszczone
→ później pojawia się nowy runtime NPC
→ bez żadnej rozmowy i bez nowej mutacji questa dostaje poprawny marker
```

Drugi przypadek:

```text
NPC A o id X zsynchronizowany
→ runtime settlement unload
→ później powstaje NPC B o tym samym stable id X
→ B również dostaje aktualny marker
```

Test ma chronić przed implementacją opartą wyłącznie o `Set<NpcId>`.

### Marker actionability

W `src/quests/QuestManager.test.ts` dodać co najmniej:

1. aktywny required `talk_to_npc` z realną akcją → `?`;
2. `talk_to_npc_choice` z realnym wyborem → `?`;
3. aktywne `stage.dialogueActions` dostępne teraz → `?`;
4. ten sam kontekst podczas aktywnego quest dialogue cooldown → brak `?` zgodnie z bieżącą semantyką dialogu;
5. aktywny quest, którego dialog u NPC daje tylko reminder + generic abandon → `…`, nie `?`;
6. wieloquestowy NPC: nieactionable active quest nie może przykryć `✓`/`!`, a actionable foreign-quest target nadal ma najwyższe `?`;
7. wynik jest niezależny od kolejności definicji questów.

Jeżeli konkretny bug wynika z istniejącego authored questa, dodać mały test na jego mechanice, ale naprawa musi pozostać generyczna — bez quest-id special case.

## Files

Primary:

- `src/quests/QuestManager.ts`
- `src/quests/QuestManager.test.ts`
- `src/app/gameLoop.ts`

Likely, tylko jeśli potrzebne do testowalności:

- nowy mały integration helper pod `src/app/` dla marker sync;
- odpowiadający mu `*.test.ts`.

Read-only/reference:

- `src/ai/NpcAgent.ts`
- `src/settlement/SettlementsManager.ts`
- `src/quests/quests.ts`
- `src/ui-vue/NpcDialogueMenu.vue`
- `docs/plans/quests-progression-034-quest-giver-cap-markers-dialogue-and-target-lifecycle.md`
- `docs/plans/quests-progression-050-socially-consequential-quest-dialogue.md`

## Non-goals

- brak nowego quest marker registry;
- brak quest awareness w `NpcAgent` lub `SettlementsManager`;
- brak per-frame pełnego skanowania wszystkich quest defs dla wszystkich NPC, jeśli nic się nie zmieniło;
- brak usuwania `QuestManager.isDirty()` optymalizacji;
- brak zmiany glyphów / CSS labela;
- brak przebudowy `NpcDialogueMenu.vue`;
- brak specjalnych wyjątków dla pojedynczego questa/NPC;
- brak zmian persistence/save version.

## Performance guardrails

Naprawa lifecycle nie może zamienić istniejącego event/dirty-driven sync w pełny kosztowny recompute co klatkę.

Dozwolony per-frame koszt to tani detection nowej runtime instancji w już pobranej liście loaded NPC; `labelMarker()` ma być wykonywany dla:

- wszystkich loaded NPC tylko przy quest dirty,
- albo pojedynczo dla runtime NPC, który jeszcze nie otrzymał inicjalnej synchronizacji.

## Verification

Automated:

- quest manager tests,
- nowy test marker lifecycle/integration,
- typecheck/lint/build zgodnie z `CLAUDE.md`.

Manual browser verification należy do Usera:

1. `New Game` — podejść do giverów bez otwierania wcześniej żadnego dialogu; markery są widoczne od razu po pojawieniu się NPC.
2. Odejdź tak, aby settlement został odstreamowany, wróć — marker jest poprawny bez wcześniejszej rozmowy.
3. Aktywny quest z samym reminderem/wycofaniem — label nie pokazuje `?`.
4. Prawdziwy talk/action target — `?` pojawia się i znika zgodnie z faktyczną dostępnością akcji/cooldownem.
5. Hand-in/report/oferta nadal zachowują odpowiednio `✓` / `!`, a zwykły active context `…`.

## Implementation note requirement

Przy wydzielaniu nowych ważnych/publicznych helperów dodać JSDoc opisujący ownership i invariant; użyć `@domain quests-progression` tam, gdzie pomaga preflight discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
