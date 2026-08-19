# Implementation notes: Quest v3 closure (plan 110)

**Date:** 2026-08-14
**Status:** `done` ✅ — implemented + technically verified. Browser verification was not performed — see §5.

## 1. Zaimplementowane

### Lifecycle: `failed` / `invalidated`

- `src/quests/quests.ts`: `QuestState` rozszerzony o `failed`/`invalidated`; `QuestStage.failLine?: string` dodane.
- `src/quests/QuestManager.ts`: `private failQuest(def, stageIndex)` — mirror `completeQuest`, zeruje `animalTargets`, zwraca `failLine ?? QUEST_FAILED_FALLBACK_LINE`. Reward-guard bez zmian (strukturalnie nieosiągalny z `failed`/`invalidated`).
- `src/ui-vue/screens/QuestLogScreen.vue`: `STATE_LABEL` ma nowe wpisy (`nieudany`/`nieaktualny`); `matchesFilter()` grupuje `failed`/`invalidated` pod „Zakończone”.

### Generyczny sygnał śmierci zwierzęcia

- `AnimalAgent.ts`: nowy opcjonalny param konstruktora `onDeath?: (animalId: string) => void`, wołany jako pierwsza linia `collapse()` — wspólny punkt dla zabójstw przez gracza i predatora.
- Przeciągnięty przez `createFauna.ts` → `livestock.ts`/`createSettlement.ts` → `SettlementsManager.ts` → `worldBundle.ts` (`buildFauna`/`buildSettlementsManager`, oba call site'y `createWorldBundle`/`rebuildWorldBundle`) → `createApp.ts`.
- `createApp.ts`: mutowalna zmienna pośrednia (`onAnimalDeathTarget`) przypisywana po utworzeniu `questManager`, bo `bundle` powstaje wcześniej — analogicznie do istniejącego wzorca `resolveAnimalTarget`.
- Istniejąca ścieżka melee w `gameLoop.ts` **bez zmian** — podwójny dispatch dla już nieaktywnego questa jest no-opem (`s.state !== 'active'` guard).

### Failure wiring „Zagubionej owcy"

- `QuestManager.onInteractObjective()`: nowy branch — `animal_died` na bound `find_animal` target → `failQuest()` zamiast advance. `kill_target_animal` bez zmian.
- `quests.ts`: `zagubiona-owca` dostała `failLine: 'Zbyt późno... to na pewno była ona. Przykro mi, Anno.'`.

### Trait „Groźny wilk"

- Zweryfikowano bezpośrednio z pliku `public/models/fauna/wolf.glb` (parsing GLB JSON chunk): wszystkie 4 materiały (`Main`/`Nose`/`Main_Light`/`Eyes_Black`) używają `pbrMetallicRoughness.baseColorFactor` → GLTFLoader mapuje je na `MeshStandardMaterial` z ustawialnym `.color`. `tintPropMaterials` działa bez fallbacku.
- `AnimalAgent.ts`: `private dangerous = false`, `markDangerous()` (idempotentne) — HP ×2, damage ×2 (w `attackHuman`), scale ×1.25, tint przez `tintPropMaterials` (gdy nie capsule), relabel `"Groźny <kind>"`.
- Poprawka przy okazji: `createFauna.ts`'s `disposeAgent()` — usunięto warunek `faunaCapsule`, `disposeObject3D` woła się bezwarunkowo (bezpieczne przez per-mesh `sharedGpu` check), żeby klony materiału z `markDangerous()` faktycznie się zwalniały.
- `quests.ts`: `kill_target_animal` ma opcjonalne `dangerous?: boolean`; `grozny-wilk` ma `dangerous: true`.
- `QuestManager.ts`: nowy injected `applyDangerousTrait: DangerousTraitApplier`, wołany w `bindAnimalTargetIfNeeded` po udanym bindzie. `createApp.ts` wiąże go z `bundle.fauna.getAgents().find(...).markDangerous()`.

### Audyty (bez zmian kodu — oczekiwany wynik)

- `ownerHouseId`: re-grep po wszystkich zmianach — nadal zero konsumentów poza `livestock.ts`(set)/`AnimalAgent.ts`(field). Bez zmian.
- `drewno-na-naprawe`: potwierdzone, że `branch` jest istniejącym zbieralnym itemem i `gather_item` już go obsługuje generycznie. Bez zmian.

### Stabilne `landmarkId`

- `src/terrain/chunkEnvironment.ts`: `export function deriveLandmarkId(seed, cx, cz, kind, ordinal): string` — czysta funkcja, worker-safe.
- `EnvironmentPlacement.id?: string` dodane, wypełniane tylko w 4 miejscach push (monolith/stoneCircle/smallRuins/cemetery); pozostałe kinds (rock/log/campfire) bez zmian.
- Świadomie **bez** rejestru/lookup Map — decyzja użytkownika (patrz plan §Kontekst). Brak potrzeby persystencji (id w pełni derywowane).

### Persystencja animal-target binding

- `src/settlement/livestock.ts`: nowy `export const LIVESTOCK_KINDS: ReadonlySet<AnimalKind>`.
- `QuestManager`'s konstruktor: pętla restore rozróżnia teraz kind livestock (rebind przez `bindAnimalTargetIfNeeded`) od kind dzikiej fauny (→ `invalidated`) dla `active` questów ze stage `kill_target_animal`/`find_animal`.

## 2. Testy dodane

- `src/quests/QuestManager.test.ts`: nowe `describe` bloki — `QuestManager failed lifecycle` (5 testów), `QuestManager save/load restore of animal-bound quests` (3 testy), `QuestManager dangerous trait binding` (2 testy).
- `src/terrain/chunkEnvironment.test.ts`: `describe('deriveLandmarkId', ...)` (5 testów — determinizm, różne chunk/kind/ordinal/seed).

## 3. Weryfikacja techniczna

```
npx tsc --noEmit     ✅ (0 błędów)
npm run lint         ✅ (0 błędów w zmienionych plikach; niepowiązane pre-existing błędy w _temp/asset-audit/inspect.mjs)
npm run build        ✅ (vue-tsc + vite build)
npm run test          ✅ 669/669 testów, 90 plików (było 647/647 przed tym planem, +22 nowych)
```

## 4. Zweryfikowane w przeglądarce

**Nic.** Zgodnie z CLAUDE.md, weryfikacja wizualna/gameplayowa nie została wykonana w tej sesji — potrzebuje ręcznego testu na działającym dev serverze.

## 5. Otwarte punkty do weryfikacji w przeglądarce

Patrz plan §Weryfikacja dla pełnej listy kroków. Kluczowe pytania bez odpowiedzi:

1. Czy „Groźny wilk" jest **faktycznie** rozpoznawalny wizualnie (tint + scale) w grze, nie tylko w teorii materiału GLB?
2. Czy `failed` „Zagubionej owcy" faktycznie blokuje turn-in u Anny i pokazuje sensowny komunikat?
3. Czy save/load z aktywnym `grozny-wilk` questem faktycznie pokazuje `invalidated` w quest logu (etykieta „nieaktualny") bez crasha?
4. Czy `disposeAgent()`'s poluzowana bramka `disposeObject3D` nie psuje niczego wizualnie dla zwykłych (nie-dangerous) wilków/zwierząt przy despawnie — powinno być no-opem przez `sharedGpu`, ale niepotwierdzone w przeglądarce.
5. Landmark identity stabilność po unload/reload chunku — brak w tej chwili żadnego UI/debug-overlay pokazującego `landmarkId`; weryfikacja wymagałaby tymczasowego console.log lub przyszłego debug narzędzia.

## 6. Dokumentacja zaktualizowana

- `docs/STATE.md` — sekcja Quests/progression i Persistence.
- `docs/plans/README.md` — nowy wiersz dla planu 110 (w „Verification needed"), zaktualizowany wiersz planu 093.
- `docs/plans/2026-08-13--093--quests-v3-world-problems-reputation-implementation-notes.md` — addendum §16 wskazujący na plan 110.
- `docs/assets/MODELS.md`/`SOUNDS.md` — bez zmian (żaden nowy model/dźwięk nie był potrzebny — reuse istniejącego `wolf.glb` + `tintPropMaterials`).
