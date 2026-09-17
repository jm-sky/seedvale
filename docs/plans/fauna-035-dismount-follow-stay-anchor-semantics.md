# Plan: Dismount Follow/Stay anchor semantics

**Created:** 2026-09-17
**Status:** `verification needed` 🔍 (implemented 2026-09-17 — browser checks are User-owned)
**Type:** bug
**Priority:** high · **Effort:** S
**Depends on:** none
**Domain:** `fauna`
**Subdomains:** `domestication` `behavior`
**Tags:** `horse` `riding` `follow` `stay` `dismount`
**Roadmap:** `horse-and-riding.md`
**Model:** `Sonnet`, `Composer`

## Cel

Naprawić integrację jazdy z istniejącym sterowaniem player-owned animal `Follow` / `Stay`, tak aby zejście z konia nie powodowało powrotu konia do starego `Stay` anchoru sprzed jazdy.

Po zejściu koń ma zachować poprzedni tryb kontroli, ale `Stay` ma semantycznie oznaczać **zostań tutaj**, czyli w miejscu zakończenia jazdy.

Docelowy flow:

```text
before mount: Follow
→ mount / ride
→ dismount
→ Follow resumes

before mount: Stay(anchor=A)
→ mount / ride A → B
→ dismount at B
→ Stay remains active
→ anchor becomes B
```

Nie otwierać automatycznie dialogu po każdym zejściu z konia. Gracz nadal może ręcznie zmienić `Stay ↔ Follow` przez istniejące contextual actions.

## Recon

Current `main` ma już wszystkie potrzebne mechanizmy:

- `src/app/actions/mountActions.ts` jest authority dla mount/dismount lifecycle.
- `exit(...)` przy dismount wywołuje `last.setMounted(false)`, odłącza playera i stawia go obok zwierzęcia, ale nie zmienia owned-control state.
- `src/fauna/ownedAnimalControl.ts` przechowuje authoritative `mode: 'follow' | 'stay'` oraz persistent `stayAnchor`.
- `resolveOwnedControlMovement(...)` dla `Stay` wraca do `stayAnchor` z hysteresis (`STAY_RETURN_START` / `STAY_RETURN_STOP`).
- `AnimalAgent.setOwnedControlMode('stay')` ustawia anchor na **aktualnej pozycji zwierzęcia**.
- `SettlementsManager.setOwnedAnimalControl(...)` jest publicznym domain seamem używanym przez contextual actions i zapisuje zmianę do livestock registry.
- `fauna-020` zakłada, że mounted movement tylko zawiesza autonomiczne Follow/Stay, a po dismount poprzedni mode wraca.
- `fauna-030` wzmacnia znaczenie `Stay` jako lokalnego anchoru i faktycznie powoduje powrót zwierzęcia do tego punktu po oddaleniu.

Obecny efekt uboczny:

```text
Stay(anchor=A)
→ mount
→ ride to B
→ dismount
→ mode nadal Stay
→ anchor nadal A
→ autonomous Stay return kieruje konia z B z powrotem do A
```

To jest błąd lifecycle/integration, nie problem persistence ani samej polityki Stay.

## Decyzja

Zachować wariant bez dodatkowego dialogu:

```text
dismount
→ zachowaj current Follow/Stay mode
→ jeśli mode === Follow: nic nie zmieniaj
→ jeśli mode === Stay: ustaw Stay ponownie w aktualnej pozycji konia
```

Nie przechowywać osobnego „pre-mount mode” — `OwnedAnimalControlState.mode` już pozostaje niezmieniony podczas jazdy.

Nie mutować `stayAnchor` bezpośrednio z `mountActions.ts`. Reuse istniejącej domenowej operacji/metody ustawiającej `Stay`, tak aby reguła „Stay = anchor w obecnym miejscu” nadal miała jedno źródło prawdy.

## Zakres implementacji

1. Dodać narrow integration hook do mount/dismount lifecycle, pozwalający po poprawnym player-triggered dismount odświeżyć `Stay` przez istniejący owned-animal control seam.
2. Dla player-owned zwierzęcia w `Follow` nie zmieniać control mode ani anchoru.
3. Dla player-owned zwierzęcia w `Stay` po zejściu ustawić `stayAnchor` na aktualne `mesh.position.x/z` konia.
4. Nie stosować tego automatycznie do wszystkich force-exit cases (`death`, `unavailable`, `fall`, `downed`) bez uzasadnienia — ich lifecycle semantics są inne niż świadome „zsiadam tutaj”.
5. Persistować wynik istniejącym livestock registry path, bez nowego pola save i bez drugiego persistence mechanism.
6. Zachować obecny `setMounted(false)` / movement / player positioning flow.

## Konkretne pliki / seams

- `src/app/actions/mountActions.ts`
  - `createMountActions(...)`
  - `exit(reason)`
  - miejsce integracji po świadomym `reason === 'player'` dismount.
- `src/fauna/AnimalAgent.ts`
  - `setOwnedControlMode(...)`
  - existing owned-control getters/accessors potrzebne do odczytu current mode; nie dodawać mutable state exposure tylko dla riding.
- `src/fauna/ownedAnimalControl.ts`
  - authoritative semantics `mode` / `stayAnchor`; preferować reuse, bez nowej riding-specific polityki.
- `src/settlement/livestock.ts`
  - `setOwnedAnimalControl(...)` / registry `upsert(...)` jako istniejący persistence seam, jeśli mount layer ma do niego dostęp przez narrow callback.
- `src/settlement/SettlementsManager.ts`
  - existing `setOwnedAnimalControl(...)` public API; nie dodawać horse managera.
- `src/app/createApp.ts` / composition root, jeśli potrzebne do wstrzyknięcia narrow callbacka do `createMountActions(...)`.

## Ownership i API

`AnimalAgent` nadal posiada per-animal `OwnedAnimalControlState`.

Riding nie staje się właścicielem Follow/Stay. Powinien jedynie zgłosić zdarzenie domenowe semantycznie w rodzaju:

```text
player dismounted animal
→ if player-owned + Stay
→ refresh Stay at current animal position
```

Preferować callback/domain operation wstrzyknięty do `createMountActions(...)` zamiast importowania settlement internals do action layer.

Jeśli potrzebny jest nowy publiczny helper/metoda, dodać JSDoc z `@domain fauna`, jeżeli poprawia preflight discovery.

## Invariants

1. `Follow` po mount/dismount zachowuje się dokładnie jak przed zmianą.
2. `Stay` po świadomym zejściu oznacza bieżące miejsce zejścia, nie stare miejsce sprzed jazdy.
3. Mounting nie resetuje mode ani anchoru przed dismount.
4. Autonomous needs/threat nadal mogą czasowo przejmować ruch zgodnie z istniejącym fauna AI.
5. Nie powstaje drugi mount state, drugi owned-control state ani horse-specific AI loop.
6. Save/load zachowuje nowy anchor przez istniejący snapshot/registry path.
7. Cudze/non-player-owned mounty nie dostają player-owned `Stay` mutacji.

## Testy

Dodać/rozszerzyć testy dla minimum:

- `Stay(anchor=A) → mount → movement to B → player dismount` daje `mode=stay` i `stayAnchor≈B`.
- Po powyższym autonomous Stay nie próbuje wracać do A.
- `Follow → mount → dismount` pozostawia `Follow` bez tworzenia `stayAnchor`.
- force exit przez `fall` nie wykonuje player-dismount anchor refresh.
- dead/unavailable mount nie próbuje aktualizować owned control.
- player-owned `Stay` refresh przechodzi przez persistence/upsert seam, jeśli integracja używa manager callbacka.

Preferować unit/integration test istniejącego mount action lifecycle zamiast browser-only coverage.

## Non-goals

- Automatyczny dialog „co dalej?” po zejściu.
- Nowe komendy dla konia.
- Whistle / summon / teleport recovery.
- Zmiana Follow distance lub Stay hysteresis.
- Redesign `faunaDecision` albo needs/foraging.
- Zmiana zachowania przy upadku z konia, śmierci lub zniknięciu mounta poza koniecznymi regression guards.
- Nowe pola persistence.

## Verification

Automated:

- testy lifecycle opisane wyżej,
- istniejące `ownedAnimalControl` / livestock / riding tests pozostają zielone,
- typecheck/build zgodnie z normalnym projektem.

Manual browser verification wykonuje User:

1. Ustawić własnego konia na `Stay` w osadzie A.
2. Wsiąść i pojechać do osady B / wyraźnie oddalonego miejsca.
3. Zsiąść zwykłą akcją gracza.
4. Oddalić się na > `STAY_RETURN_START` od konia i potwierdzić, że koń pozostaje związany z miejscem B zamiast wracać do A.
5. Powtórzyć dla `Follow` i potwierdzić, że po zejściu koń podąża za graczem.
6. Save/load po zejściu w `Stay` i potwierdzić zachowanie nowego anchoru.

## Powiązane plany

- `fauna-003-horse-riding.md` — riding authority.
- `fauna-020-player-owned-animals-and-follow-stay-behaviour.md` — player ownership + Follow/Stay.
- `fauna-030-player-owned-animal-stay-safety-and-recovery.md` — Stay return-to-anchor i lifecycle safety.

> **Zrób git commit i push do main, rebase jeżeli trzeba**