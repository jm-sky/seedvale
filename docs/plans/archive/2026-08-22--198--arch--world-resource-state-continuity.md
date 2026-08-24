# Plan: World Resource State Continuity

**Created:** 2026-08-22  
**Status:** `verification needed` 🔍 — see [implementation notes](./2026-08-22--198--arch--world-resource-state-continuity-implementation-notes.md)  
**Priority:** high · **Effort:** M  
**Depends on:** ~~195~~

## Cel

Zapewnić ciągłość stanu wydobycia złóż rudy przez ich własny streaming oraz `WorldBundle` rebuild.

Obecnie `ResourceDeposits` przechowuje `remaining` wyłącznie na żywej `DepositInstance`. `despawn()` usuwa runtime instance, a kolejne `spawnSync()` wylicza początkową liczbę hitów ponownie. Ten sam problem występuje przy `rebuildWorldBundle()`, ponieważ nowy `ResourceDeposits` nie otrzymuje carry state.

Powoduje to realny exploit:

```text
mine deposit
  ↓
partial / full depletion
  ↓
unload / reload
  ↓
initial amount restored
```

Docelowo:

```text
world resource identity
        ↓
authoritative depletion state
        ↓
runtime DepositInstance
```

Rekonstrukcja runtime representation nie może resetować stanu wydobycia.

---

## 1. Ustalić ownership i authoritative state

Na podstawie aktualnego `WorldBundle`/`createApp.ts`/`resourceDeposits.ts` ustalić miejsce przechowywania stanu złóż, które przeżywa lifetime pojedynczego `ResourceDeposits`.

Preferowany kierunek to **caller-owned sparse state**, analogiczny do istniejących `collectedItemIds` / `removedCropIds`:

```text
createApp / world owner
    └── resource depletion overrides
            └── resource.id → remaining
```

Mechanizm ma być konkretnie ograniczony do złóż i ich stanu wydobycia.

Nie tworzyć globalnego `EntityManager`, `StateManager` ani ogólnego persistence frameworka.

---

## 2. Wykorzystać istniejącą identity zasobu

`NaturalResource.id` (`resource_{rx}_{rz}`) jest obecnie deterministycznym identyfikatorem zasobu i wystarcza do carry state w obrębie jednego świata.

Nie tworzyć nowego ID systemu.

Jednocześnie jasno określić lifecycle mapy/registry:

```text
new world / new seed
    → reset

in-session WorldBundle rebuild
    → carry

resource streaming unload/reload
    → carry
```

State nie może zostać przypadkowo przeniesiony do nowego świata tylko dlatego, że resource IDs mają ten sam format.

---

## 3. Zachować częściowe wydobycie

`remaining` musi przeżyć zwykły streaming resource pile.

Przykład:

```text
initial = 10
    ↓
mine × 4
    ↓
remaining = 6
    ↓
despawn
    ↓
spawn again
    ↓
remaining = 6
```

Nowy `DepositInstance` powinien pobrać override z authoritative state, a dopiero przy jego braku użyć deterministycznego initial value z `resource.richness`.

Nie zapisywać osobno stanu renderowego pile/label — jest on pochodny od `remaining`.

---

## 4. Zachować pełne depletion

Stan:

```text
remaining = 0
```

musi być reprezentowany w authoritative state, aby brak wpisu nie oznaczał przypadkowo „nowe złoże”.

Docelowy lifecycle:

```text
initial
  ↓ mine
partial
  ↓ mine
remaining = 0
  ↓
depleted
```

Po unload/reload oraz `WorldBundle` rebuild złoże musi pozostać wyczerpane.

Istniejące zachowanie `depletedIds` może zostać zastąpione lub podporządkowane nowemu authoritative state; nie utrzymywać dwóch niezależnych źródeł prawdy.

---

## 5. Ujednolicić wszystkie ścieżki mutacji

Zweryfikować, że każdy mining path korzysta z tego samego `remaining`:

- player mining,
- NPC mining,
- `ResourceDeposits.mine()` i jego callerzy.

Po udanym wydobyciu authoritative state musi zostać zaktualizowany **w tym samym miejscu, w którym zmienia się `remaining`**.

Nie dopuścić do sytuacji:

```text
DepositInstance.remaining
        ≠
authoritative resource state
```

---

## 6. WorldBundle rebuild

Dostosować `createWorldBundle()` / `rebuildWorldBundle()` tak, aby resource depletion state był przenoszony pomiędzy kolejnymi instancjami `ResourceDeposits`.

Zachować istniejący model `WorldBundle` jako kontenera/composition root.

Docelowy przepływ:

```text
old ResourceDeposits
       ↓ snapshot/carry
resource depletion state
       ↓
new ResourceDeposits
       ↓ hydrate
runtime DepositInstance
```

Mechanizm ma działać zarówno dla rebuild z tym samym seedem, jak i dla zmian konfiguracji terenu, które zgodnie z istniejącą architekturą wykonują in-session rebuild.

Przy rzeczywistym New Game / zmianie świata state musi zostać wyczyszczony.

---

## 7. Resource streaming

Naprawić własny radius streaming `ResourceDeposits`:

```text
LOAD_RADIUS
UNLOAD_RADIUS
```

tak, aby `despawn()` usuwał wyłącznie runtime representation, a nie authoritative depletion state.

Zachować istniejący streaming model, hysteresis i deterministyczne rozmieszczenie pile.

Nie rozszerzać tego planu na chunk streaming architecture.

---

## 8. Save/load boundary

Jawnie rozdzielić dwa problemy:

1. **in-session continuity** przez streaming/rebuild — obowiązkowy zakres tego planu,
2. **pełna persistence między sesjami** — osobna decyzja persistence.

W ramach tego planu nie dodawać automatycznie nowego pola `SaveData`, jeśli nie jest ono wymagane przez aktualny kontrakt save/load.

Jeżeli implementacja wykaże, że istniejący save/load ma już reprezentować depletion albo że brak persistence powoduje osobny potwierdzony błąd, udokumentować to jako follow-up do **200**, zamiast rozszerzać ten plan w niekontrolowany sposób.

---

## 9. Cleanup i state bounds

Sparse depletion state powinien pozostać ograniczony do zasobów, które rzeczywiście zostały zmodyfikowane.

Nie kopiować wszystkich proceduralnych `NaturalResource` do persistence state.

Rozważyć usuwanie override tylko wtedy, gdy jest to bezpieczne i nie zmienia znaczenia stanu `remaining = 0`.

Najważniejszy invariant:

> Brak override oznacza „użyj deterministycznego initial state”, a wpis `0` oznacza „złoże wyczerpane”.

---

## Poza zakresem

- NPC runtime state/lifecycle — **197**,
- time-skip — **196**,
- ItemInstance transfer — **199**,
- quest identity — **199**,
- starvation/dehydration persistence — **200**,
- pełny save/load resource persistence,
- generalny Entity/State Manager,
- resource regeneration overhaul,
- przebudowa proceduralnego `NaturalResource` generation,
- multiplayer persistence.

---

## Weryfikacja

### Testy

Dodać lub rozszerzyć testy obejmujące:

- initial deposit state,
- partial mining,
- full depletion,
- resource despawn/spawn,
- player mining,
- NPC mining,
- `WorldBundle` rebuild,
- new-world reset.

Kluczowe scenariusze:

```text
initial = 10
  ↓
mine 4
  ↓
remaining = 6
  ↓
stream out/in
  ↓
remaining = 6
```

```text
initial = 10
  ↓
mine 10
  ↓
remaining = 0
  ↓
stream out/in + rebuild
  ↓
remaining = 0
```

oraz:

```text
world A
  ↓
deplete resource
  ↓
new world B
  ↓
resource starts from B's initial state
```

### Browser verification

Zweryfikować rzeczywistą grę:

1. znaleźć złoże,
2. wydobyć część zasobu,
3. oddalić się poza `UNLOAD_RADIUS`,
4. wrócić,
5. potwierdzić zachowanie ilości pozostałego zasobu,
6. całkowicie wyczerpać złoże,
7. ponownie wykonać streaming,
8. potwierdzić brak odrodzenia,
9. wykonać `WorldBundle` rebuild,
10. potwierdzić continuity,
11. rozpocząć nowy świat i potwierdzić reset state,
12. sprawdzić zarówno player, jak i NPC mining.

---

## Kryteria akceptacji

- [ ] `ResourceDeposits` nie jest authoritative ownerem depletion state.
- [ ] Resource state ma ownera przeżywającego runtime `ResourceDeposits`.
- [ ] Istniejąca `NaturalResource.id` jest wykorzystywana zamiast nowego systemu identity.
- [ ] Częściowe wydobycie przeżywa resource streaming.
- [ ] Częściowe wydobycie przeżywa `WorldBundle` rebuild.
- [ ] `remaining = 0` przeżywa streaming i rebuild.
- [ ] Brak override oznacza initial deterministic state, a `0` oznacza depleted.
- [ ] Player i NPC modyfikują ten sam authoritative state.
- [ ] Nie istnieją dwa niezależne źródła prawdy dla depletion.
- [ ] State jest resetowany przy utworzeniu nowego świata.
- [ ] Istniejący resource spawning/placement/streaming behaviour pozostaje zachowany.
- [ ] Nie powstaje nowy globalny state/entity manager.
- [ ] Testy przechodzą.
- [ ] Zachowanie zostało zweryfikowane w przeglądarce.

> **Zrób git commit i push do main, rebase jeżeli trzeba**