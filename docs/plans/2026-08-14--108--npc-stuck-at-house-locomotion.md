# Plan 108: NPC utyka przy / w domku — locomotion, nie stamina

**Status:** `done` ✅ — playtest accepted 2026-08-18  
**Created:** 2026-08-14  
**Priority:** 🔴 high  
**Effort:** `M`  
**Depends on:** ~~097~~ (kolizje + łatka wyjścia z domu)  
**Prompt:** [docs/prompts/2026-08-14--005--npc-stuck-at-house-locomotion.md](../prompts/2026-08-14--005--npc-stuck-at-house-locomotion.md)

Playtest po watchdogu (S8 / commit `b99b248`) i gospodarstwach (069 / `d50a3fd`). Nie kodować z samego tytułu — ten dokument jest review + kontraktem naprawy.

---

## Objawy (2026-08-14)

1. NPC **stoi w domku**, pasek staminy niepusty, dialog „zajmuję się drewnem”, nigdzie nie idzie.
2. NPC **„stoi” obok domku**, klip Walk, dialog „idę po wodę”, pozycja się nie zmienia.

To nie jest wyczerpanie staminy. `goTo` drenuje `0.5/s` nawet w bezruchu, ale pełna pula starcza na ~200 s — watchdog i `choose` zdążyłyby zadziałać wielokrotnie, gdyby rescue naprawdę uwalniał.

Mapowanie dialogu: `currentActivityLine` / `NEED_ACTIVITY_LABEL` (`src/ai/dialogueTemplates.ts`) — `need: wood` → „zajmuję się drewnem”, `need: water` → „idę po wodę”. Obie linie oznaczają `phase ∈ {goTo, execute, exhausted}` z `pendingAction`, nie harmonogramowe `work` („pracuję”).

---

## Co ostatnio weszło (kolejność)

| Commit | Co | Skutek dla tych objawów |
|--------|----|-------------------------|
| `680b38c` (097 §4.6) | `isWalkable`: collider, w którym NPC **już jest**, nie blokuje kroku (wyjście z domu) | Tylko *wyjście*. Wejście, ominięcie z zewnątrz i rescue nadal widzą ten sam dysk. |
| `b99b248` (S8, bez numerowanego planu) | Watchdog `repath → escape → abandon → teleport`; stamina walk vs work; `?debug=1` | Symptom manager na złym kontrakcie locomotion. Testy pokrywają czysty FSM, nie `isWalkable` / `steerTo`. |
| `d50a3fd` (069) | Jedzenie z zapasu gospodarstwa **w domu** (`destination = home`) | Więcej celów w środku collidera. Woda w domu (`HOME_WATER_CHANCE = 0.45`) była już wcześniej. Drewno nadal: drzewo → stos. |

S8 w [SETTLEMENTS.md](../SETTLEMENTS.md) opisuje watchdog jako rozwiązanie utknięcia. Playtest pokazuje, że **nie uwalnia** NPC przy dysku domu.

---

## Kontrakt, który pęka

`NpcAgent.home` = `landmarks.homes[i]` = środek domu = środek collidera (`createSettlement.ts` rejestruje `{ x, z, radius: footprintRadius }`, hut_d = **2.0 m**).

Dom jest **pełnym dyskiem**, nie ścianą z drzwiami. NPC nie ma wejścia — tylko „nie wejdź / wyjdź jeśli już jesteś w środku”.

Stałe w `NpcAgent.ts`:

- `ARRIVE = 0.55`
- `NPC_COLLIDER_CORE_FRACTION = 0.55` → rdzeń hut_d = **1.1 m**
- `NPC_COLLIDER_APPROACH_BUFFER = 0.4`
- `resolveSteerTarget` omija dysk punktem na **1.2 × radius** (hut_d: 2.4 m)

Z zewnątrz, bez wyjątku „już w środku”, cel w centrum jest nieosiągalny: wolno zejść do 1.1 m, a `ARRIVE` wymaga 0.55 m. Wejście *może* się udać, gdy NPC przekroczy obręcz i wtedy włączy się łatka 097 — ale to zależy od pierwszego kroku i sąsiadów.

---

## Findings (przyczyny, nie lista objawów)

### F1 — `steerTo` gra Walk bez ruchu (objaw 2)

`moving = true` jest ustawiane **zanim** którykolwiek z trzech kandydatów kroku przejdzie `isWalkable`. Zablokowany NPC moonwalkuje w miejscu. Dokładnie: „stoi obok domku, animacja walk, idę po wodę”.

### F2 — cel w środku dysku (woda / jedzenie / sen / wander-home)

`beginNeed('water')` w ~45% idzie do `this.home`. 069: jedzenie z gospodarstwa też do `home`. `goSleep` / `wanderNear(this.home)` celują w to samo.

Z zewnątrz `destNearCollider` pozwala wejść w obręcz, ale sąsiadujący collider (drugi dom, drzewo chunka `TREE_COLLISION_RADIUS = 0.4`, studnia) może zablokować ten pierwszy krok. Wtedy NPC tka przy ścianie.

`goSleep` **nie** ma `pendingAction`, więc `destNearCollider` jest wyłączone — z zewnątrz sen w domu jest twardo zablokowany.

### F3 — `resolveSteerTarget` z wnętrza / przy ścianie

NPC w dysku, cel = drzewo (drewno). Segment zawsze przecina własny dom → omijanie na punkt na rimie 2.4 m, nie na drzewo. Jeśli ten jeden punkt pada na sąsiada, zostaje ślizg po osi, potem zastój. Brak szukania wolnego namiaru na obręczy.

### F4 — watchdog ratuje *do środka*, nie na zewnątrz (objaw 1)

Rescue woła to samo `isWalkable`. Wyjątek „już w środku” sprawia, że **każdy punkt wewnątrz domu jest „walkable”**.

`attemptLocalEscape` próbuje pierścień **1.5 m pierwszy**. Z centrum hut_d (r = 2.0) wszystkie 8 punktów 1.5 m są w środku i akceptowane — **return przy pierwszym trafieniu, pierścień 3 m (wyjście) nigdy nie jest próbkowany**. Hop 1.5 m liczy się jako postęp (`STUCK_MIN_PROGRESS_DIST = 0.15`) → strikes spadają do 0. Pętla wewnątrz domu.

`attemptRepath` (losowy punkt 2–3.5 m) z centrum *może* wypaść na zewnątrz; z pozycji przy ścianie często zostaje w środku. Ten sam wyjątek.

### F5 — emergency teleport wraca do pułapki

Kandydaci: `home`, `well`, `stockpile`. Z wewnątrz `isWalkable(home)` jest **true** (F4). Po dwóch `abandon` NPC skacze **z powrotem na środek domu**, `choose` od nowa bierze drewno, `startAction` resetuje watchdog. Zamknięta pętla.

Fallback „żaden kandydat nie przeszedł” też twardo stawia na `home`.

### F6 — watchdog resetuje się zanim eskaluje

- Mikroślizg ≥ 0.15 m / 1.5 s (kilka udanych klatek osi) zeruje strikes — wygląda jak bezruch, rescue nie startuje.
- `lookAtPlayer` (gracz patrzy z bliska) resetuje watchdog po pauzie.
- `abandon` → `choose` → ta sama akcja → `startAction` → reset. Bez cooldownu na ten sam cel.
- `?debug=1` pokazuje `rescue none (0)` mimo minutowego stania.

### F7 — `footprintRadius` to ręczny szacunek (097 §4.5)

Dysk ≠ mesh. Jeśli mesh > dysk, NPC wygląda „w domu”, a liczbowo jest na zewnątrz — łatka wyjścia nie działa, wejście w dysk zablokowane (pierścień między ścianą GLB a colliderem). Jeśli dysk > mesh, NPC „obok chatki” nadal jest w colliderze. Issue [018](../issues/2026-08-12--018--house-scale-vs-npc.md) (domki za małe vs NPC) pogarsza odczyt wizualny.

---

## Co to *nie* jest

- Pusta stamina / `exhausted` — user widzi pasek; `exhausted` i tak wraca do `previousPhase` przy 35%.
- Brak watchdogu — jest, ale F4–F6 go obezwładniają.
- Osobny bug 069 w depozycie drewna — drewno nie celuje w dom; 069 tylko zwiększa liczbę celów `home` (jedzenie).
- Brak pathfindera siatkowego — v1 nie potrzebuje A*; potrzebuje spójnego „cel w / przy colliderze = punkt na obręczy” i rescue, które wychodzi.

---

## Propozycja (v1, bez drzwi w GLB)

Nie modelować prawdziwych drzwi (097 już to odłożył). Zostawić dysk. Zmienić **gdzie jest cel** i **jak rescue próbkuje**.

### P0 — cel nigdy nie leży w rdzeniu obcego dysku

Wspólna funkcja (przy `NpcAgent`, nie nowy framework): dla destination `(x,z)` jeśli leży w colliderze, w którym NPC **nie** jest, zamień cel na punkt na obręczy (`radius + mały margines`, od strony NPC albo stały namiar „do placu”).

Użyć w: `startAction`, `goSleep` (`this.home`), `wanderNear` fallback na `anchor`, `resolveSteerTarget` (już omija, ale musi być zgodne z `ARRIVE`).

Skutek: picie/jedzenie/sen „w domu” = stanie przy ścianie od zewnątrz, nie wchodzenie w środek. NPC już w środku nadal wychodzi (łatka 097) do drzewa / studni / stosu.

### P0 — `ARRIVE` vs rdzeń

Jeśli po P0 cel jest na obręczy, `ARRIVE = 0.55` jest osiągalny. Nie powiększać `ARRIVE` globalnie (psuje kolejkę studni). Nie obniżać `CORE_FRACTION` jako „fix” — to tylko wpuszcza stopy w studnię / chatę.

### P1 — watchdog uwalnia na zewnątrz

- Próbki `attemptRepath` / `attemptLocalEscape`: punkt jest OK tylko gdy leży **poza każdym colliderem, w którym NPC obecnie stoi** (albo osobny `isWalkableExterior` bez wyjątku „już w środku”). Najpierw pierścień, który wychodzi (`> footprintRadius`), nie 1.5 m do środka.
- `emergencyTeleport`: **nie** wybierać `home`. Kandydaci: obręcz studni / stosu / ogrodu, już zwalidowane `isWalkable` z zewnątrz. Log `[npc:rescue]` bez zmian.
- Po `abandon`: krótki cooldown albo remap celu, żeby `choose` nie wznawiał tej samej zablokowanej destination w tej samej klatce.
- Opcjonalnie: brak zmiany pozycji + `moving` (próba kroku) liczy się jako strike — mikroślizg nie zeruje, jeśli netto `< STUCK_MIN_PROGRESS_DIST` w stronę celu.

### P1 — animacja

`moving = true` tylko gdy `x/z` faktycznie się zmieniły w tej klatce. Moonwalk znika; przy F1 widać Idle + `?debug=1` `goTo · drink · dist … · rescue repath`.

### P2 — nie w tym planie

- Metadane drzwi / walkable interior (research po 097).
- A* / navmesh.
- Analogiczny przegląd `AnimalAgent` (nie zgłoszony).
- Przeliczenie `footprintRadius` z AABB GLB (osobny playtest 018 / 074) — jeśli P0+P1 nie wystarczą, to następny dźwignia.

---

## Pliki

```text
src/ai/NpcAgent.ts                 # cel na obręczy; moving; teleport; isWalkable probe
src/ai/npcMovementWatchdog.ts      # bez zmian kontraktu FSM, chyba że strike = brak postępu ku celowi
src/ai/npcMovementWatchdog.test.ts # + testy: probe nie akceptuje wnętrza; home nie jest kandydatem teleportu
src/world/collision.ts             # reuse Collider; bez nowego systemu
docs/SETTLEMENTS.md                # S8: watchdog ≠ rozwiązanie domu (wskazanie tego planu)
```

Czysta funkcja `destinationOnColliderRim(pos, dest, colliders) → dest` — testowalna bez Three.js, jak watchdog.

---

## Weryfikacja

Techniczna: `npx tsc --noEmit`, `npm run lint`, `npm run test` (watchdog + nowa funkcja rim).

Browser (`?debug=1`): playtest accepted 2026-08-18.

1. Podejdź do NPC w domu z `goTo · chop` / „zajmuję się drewnem”. W ≤ ~8 s: albo wychodzi w stronę drzewa, albo debug pokazuje `rescue escape` / `abandon`, a pozycja jest **poza** dyskiem domu (nie teleport na środek). Brak pętli w chatce.
2. NPC przy ścianie, Walk, „idę po wodę”: albo dochodzi do studni / obręczy domu i `execute`, albo Idle + eskalacja rescue — **bez** moonwalku.
3. Konsola: `[npc:rescue] emergency teleport` rzadkie; gdy jest, `x,z` ≠ środek domu.
4. Sen o zmierzchu: NPC z zewnątrz dochodzi do obręczy domu i śpi, nie tkwi w `goSleep` przy ścianie.

---

## Definition of done

- P0 + P1 zaimplementowane, testy czystej funkcji + watchdog zielone.
- S8 w SETTLEMENTS.md mówi prawdę (watchdog + rim destination, nie „dysk jest OK”).
- Playtest powyższych 4 punktów — osobno oznaczyć `verification needed` aż user potwierdzi.

---

## Implementation notes (2026-08-14)

P0 + P1 w kodzie. Techniczna weryfikacja zielona (`tsc`, lint na zmienionych plikach, 614 testów). Playtest w przeglądarce **nie** zrobiony.

**P0 — cel na obręczy.** `src/ai/npcColliderRim.ts` (`destinationOnColliderRim`): dest w colliderze, w którym NPC nie stoi, → punkt na obręczy (`radius + 0.2 m`) od strony NPC. Użyte w `startAction`, `goSleep` (`sleepDest` cache, żeby obręcz nie orbitowała), `wanderNear` (fallback na `anchor` + próbki wander też tylko exterior). `resolveSteerTarget` pomija collider, w którym NPC już stoi (wyjście do drzewa, F3). `ARRIVE` / `CORE_FRACTION` bez zmian.

**P1 — rescue na zewnątrz.** `isWalkableExterior` / `isExteriorPoint` — bez wyjątku 097 „już w środku”. `localEscapeRadii` zaczyna od pierścienia, który wychodzi z zajętego dysku (nie hop 1.5 m do rdzenia). `emergencyTeleport` kandydaci: obręcz studni / stosu / ogrodu; `home` nie jest kandydatem; log `[npc:rescue] emergency teleport` bez zmian. Po `abandon`: 2.5 s cooldown na ten sam dest, żeby `choose` w tej samej klatce nie wznowił pułapki.

**P1 — animacja.** `moving = true` tylko gdy `x/z` faktycznie się zmieniły w tej klatce.

**P1 opcjonalnie (watchdog strike ku celowi).** Nie ruszane — próg `STUCK_MIN_PROGRESS_DIST` i kontrakt FSM zostają; testy watchdoga bez zmian. Rim dest + exterior probe powinny wystarczyć; jeśli mikroślizg nadal gasi strikes, to następna dźwignia.

P2 (drzwi / AABB `footprintRadius` / AnimalAgent) — poza zakresem.
