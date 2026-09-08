# Implementation Notes: quests-progression-011 — Grave Robbing Reputation Risk & Stealth

## Aktualny hook i ownership

- `src/app/actions/groundActions.ts::checkHiddenFindDig()` jest właściwym miejscem integracji. `findHiddenFindSpot(...)` zwraca tylko nierozwiązany spot, po czym caller natychmiast wykonuje `resolvedHiddenFindSpotIds.add(match.spotId)`. Exposure należy rozstrzygać w tej samej gałęzi tylko dla `match.landmark.kind === 'cemetery'`; ponowny dig nie przejdzie już przez ten hook.
- `BadgeManager.recordGraveDisturbed()` pozostaje niezależnym historycznym skutkiem i musi być wykonywany dla każdego nowo rozwiązanego grobu niezależnie od exposure/lootu.
- `ReputationManager` jest app-level managerem w `createApp.ts`, poza `WorldBundle`. Nie dodawać reputation do bundle ani do `PlayerActionContext` tylko dla tego feature. Najwęższa integracja to przekazać do `GroundActionsDeps` callback albo manager + użyć istniejącego `applySocialConsequence(...)`.

## Social exposure helper

Dodać mały pure moduł w domenie `reputation`/`quests-progression` (np. `src/reputation/socialExposure.ts`), bez importów z cemetery, fauna ani app actions.

Rozdzielić dwie rzeczy:

- obliczenie `finalRisk` z `night`, `sneakActive`, `sneakValue`,
- deterministyczny `roll` dla stabilnej identity zdarzenia.

Nie reuse `src/fauna/playerAwareness.ts::sneakDetectionMultiplier()` bezpośrednio. Ten helper uwzględnia `movement`, własny `MAX_STEALTH_REDUCTION = 0.9` i służy probabilistyce percepcji zwierząt. Plan 011 wymaga dokładnie `risk * (1 - sneakValue)` oraz osobnego floor 2%.

`PlayerSkills.sneak.value` jest już realnie progresywny i pochodzi z XP (`src/player/PlayerSkills.ts`), z bieżącym minimum `SKILL_MIN_VALUE = 0.2`; nie zakładać starej stałej wartości 0.5. W momencie resolution można czytać bezpośrednio `ctx.player.skills.sneak.active/value`.

## Pora dnia

`src/world/dayNight.ts` nie ma osobnego canonical `isNight()`. Ma `phaseName(timeOfDay)`, gdzie `noc` to `< 0.2 || >= 0.85`, a świt/zmierzch są osobnymi fazami.

Dla V1 przyjąć `night = phaseName(dayNight.timeOfDay) === 'noc'`. To zachowuje istniejący podział czasu i spełnia plan bez wprowadzania nowego modelu dawn/dusk. Jeżeli podczas implementacji pojawi się współdzielony boolean/helper dnia/nocy, użyć jego zamiast duplikować progi.

## Determinizm

`HiddenFindMatch.spotId` jest już stabilną identity grobu (`${landmark.id}:${graveIndex}`), a `landmark.id` zawiera deterministyczną identity zależną od świata. Dlatego nie trzeba osobno przepychać world seed do `groundActions` tylko dla exposure.

Najprostszy kontrakt: deterministic roll z `spotId + ':social-exposure'`, przez ten sam lokalny wzorzec FNV-1a → `createSeededRandom(...)`, który już występuje w `hiddenFinds.ts`, `groundActions.ts` i innych modułach. Nie przenosić hash utility do wspólnego modułu wyłącznie dla tego planu.

Roll musi zależeć wyłącznie od identity zdarzenia. `night` i Sneak zmieniają threshold, nie seed/roll.

## Settlement scope

`groundActions.ts` już używa `villageNearest({ x, z }, bundle.settlementsManager)` do cemetery loot scaling. Ten wynik zawiera `id`, `name`, `size`.

Reuse tego samego lookupu raz dla grobu i wykorzystać zarówno `size` do `resolveHiddenFindLoot(...)`, jak i `id` do social consequence. Nie wykonywać drugiego nearest search.

Brak wyniku oznacza: badge + loot/resolution nadal działają, ale nie ma lokalnej reputation consequence.

## Applying consequence

Przy `exposed === true` zastosować dokładnie jeden istniejący `SocialConsequence`:

```ts
{
  settlementId,
  reputation: { integrity: -8, trust: -4 },
  renown: 2,
}
```

Nie mutować `ReputationManager.changeReputation()` bezpośrednio w `groundActions.ts`; reuse `src/reputation/ReputationManager.ts::applySocialConsequence()` albo wstrzyknięty callback o tej samej semantyce.

Nie dodawać osobnego persistence state dla exposure. One-shot zapewnia `resolvedHiddenFindSpotIds`; ewentualny standing jest już persistowany przez `ReputationManager`.

## Wiring

`createApp.ts` tworzy obecnie ground actions jako:

```ts
createGroundActions(actionCtx, { worldFlags, badges, resolvedHiddenFindSpotIds })
```

Rozszerzyć ten deps object o wąską zależność do zastosowania social consequence. Preferowany callback, np. `(consequence) => applySocialConsequence(reputationManager, consequence)`, ogranicza coupling `groundActions` do kontraktu i upraszcza testy.

Nie rozszerzać shared `PlayerActionContext`: player skills i day/night już są w istniejącym context, a reputation jest potrzebna tylko temu jednemu action module.

## Testy i pułapki

- Pure tests dla resolvera powinny pokryć dokładną matematykę z planu, clamp wejść i 2% floor. Pamiętać, że runtime `sneak.value` normalnie nie spada poniżej 0.2, ale helper powinien nadal defensywnie obsłużyć pełne `0..1`.
- Determinism test: ten sam `spotId` daje ten sam roll; zmiana pory dnia/Sneak nie zmienia rolla, tylko wynik porównania.
- `src/app/actions/groundActions.test.ts` ma własny `GroundActionsDeps`; po dodaniu callbacku zaktualizować fixture i dodać focused integration cases: cemetery exposed / not exposed / resolved spot nie wywołuje consequence ponownie / non-cemetery nie wywołuje consequence / brak settlementu nie blokuje badge-resolution.
- Nie testować `Math.random()` ani czasu przez real clock; wszystko potrzebne jest już jawnie dostępne jako state/pure input.
- `groundActions.ts` ma stary komentarz mówiący, że grave robbing nie zmienia reputation. Po implementacji koniecznie go poprawić, bo będzie jawnie fałszywy.

## Sugerowana kolejność

1. Pure `socialExposure` + tests.
2. Rozszerzenie `GroundActionsDeps` o callback social consequence.
3. W `checkHiddenFindDig()` policzyć nearest settlement raz, zachować badge flow, rozstrzygnąć exposure dla cemetery i opcjonalnie zastosować consequence.
4. Focused `groundActions` integration tests.
5. Zaktualizować komentarze/STATE tylko tam, gdzie po implementacji opis zachowania faktycznie się zmieni.

Nie uruchamiać `pnpm docs:sync` ręcznie — synchronizacja dokumentacji działa w GitHub workflow.