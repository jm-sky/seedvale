# Etap 1 — Gospodarstwa NPC i przepływ zasobów

**Status:** `done` ✅ — playtest accepted 2026-08-18 (limited observability; user could not easily inspect household stock)
**Created:** 2026-08-12
**Priority:** 🟡 medium · **Effort:** L · **Depends on:** ~~060~~, ~~071~~

**Implementation notes:** `docs/plans/implementation-notes/2026-08-11--069--npc-household-resources-implementation-notes.md`

## Cel

Zmienić obecny model potrzeb NPC z:

```text
potrzeba → NPC idzie do źródła → potrzeba zaspokojona
```

na:

```text
potrzeba → gospodarstwo sprawdza zapasy → NPC pobiera i zużywa zasób
                         ↑
                  NPC uzupełnia zapasy
```

NPC zaczyna więc funkcjonować jako członek gospodarstwa posiadającego fizyczne zapasy.

## 1. Podstawowe zasoby

Na początku wykorzystujemy istniejące zasoby:

- `wood` — drewno
- `food` — żywność
- `water` — woda

Nie wprowadzamy jeszcze nowych łańcuchów produkcyjnych.

## 2. Gospodarstwo NPC

Każdy dom/gospodarstwo posiada własne zapasy oraz limity pojemności.

Przykładowo:

```text
Household
├── wood: 8 / 10
├── food: 6 / 10
└── water: 4 / 8
```

Limit jest właściwością gospodarstwa, a nie NPC.

NPC może fizycznie przenosić zasoby między miejscami.

## 3. Pozyskiwanie i dostarczanie

NPC wykonujący pracę lub inne działania pozyskuje zasoby.

Przykład:

```text
NPC → pozyskuje drewno
    → ma drewno przy sobie
    → wraca do domu
    → odkłada drewno w gospodarstwie
```

Jeżeli gospodarstwo nie ma już miejsca na dany zasób, NPC może skierować go do magazynu osady.

Nie wprowadzamy na tym etapie osobnego pojęcia „nadwyżki”. Pełny magazyn jest wystarczającym sygnałem, że zasób powinien trafić gdzie indziej.

## 4. Zużywanie zasobów

Potrzeby NPC wykorzystują zasoby znajdujące się w gospodarstwie.

Przykłady:

```text
głód
→ gospodarstwo
→ pobierz food
→ zjedz
```

```text
pragnienie
→ gospodarstwo
→ pobierz water
→ wypij
```

```text
potrzeba ogrzewania
→ gospodarstwo
→ pobierz wood
→ zużyj jako opał
```

Zużycie powinno być rzeczywistą operacją zmniejszającą zapas.

## 5. Rola harmonogramu i zawodu

Potrzeby oraz harmonogram/rola NPC powinny współpracować przy podejmowaniu decyzji.

```text
Need: food low
        ↓
Schedule / Role
        ↓
wybór odpowiedniego działania
        ↓
pozyskanie / transport / konsumpcja
```

Nie należy jednak umieszczać logiki zapasów bezpośrednio w `Needs`.

Podział odpowiedzialności:

- **Needs** — określa, czego NPC potrzebuje;
- **Schedule / Role / Behavior** — określa, co NPC powinien zrobić;
- **Household** — przechowuje zapasy;
- **Actions** — wykonują pobranie, dostarczenie i zużycie zasobu.

## 6. Magazyn osady

Osada posiada wspólny magazyn:

```text
VillageStorage
├── wood
├── food
└── water
```

Podstawowy przepływ:

```text
NPC
 ↓
Household
 ↓
pełny limit
 ↓
VillageStorage
```

oraz w drugą stronę:

```text
Household
 ↓
brak zasobu
 ↓
VillageStorage
 ↓
uzupełnienie gospodarstwa
```

Magazyn staje się pierwszym mechanizmem wspólnego gospodarowania zasobami przez osadę.

Na tym etapie nie ma jeszcze handlu ani ekonomii pieniężnej.

## 7. Zwierzęta gospodarskie

Model zapasów powinien od początku pozwalać na wykorzystanie zasobów również przez zwierzęta gospodarskie.

Przede wszystkim:

- `water` — ludzie i zwierzęta;
- `straw` — zwierzęta.

Później dojdą kolejne rodzaje paszy.

Przykład:

```text
Household
├── food
├── water
├── wood
├── straw
└── animals
```

NPC może więc pobrać `straw`, nakarmić zwierzęta i zmniejszyć zapas.

System zwierząt gospodarskich może zostać rozwinięty później, ale model zasobów powinien być na to przygotowany.

## 8. Kolejne zasoby

Po uruchomieniu podstawowego przepływu można dodać kolejne zasoby:

- `fish` — ryby;
- `grain` — zboże;
- `straw` — słoma;
- `flour` — mąka;
- `bread` — chleb.

Wtedy pojawią się pierwsze łańcuchy produkcyjne:

```text
grain
  ↓
flour
  ↓
bread
  ↓
food / konsumpcja
```

oraz zasoby przeznaczone dla zwierząt gospodarskich.

Nie powinny być jednak częścią pierwszej implementacji. Najpierw należy uruchomić przepływ `wood / food / water`.

## 9. Kryterium ukończenia etapu

Etap można uznać za zakończony, gdy:

1. NPC może posiadać zasób przy sobie.
2. NPC może zanieść zasób do swojego gospodarstwa.
3. Gospodarstwo posiada limity pojemności.
4. NPC może pobrać zasób z gospodarstwa.
5. Zużycie zasobu zmniejsza jego zapas.
6. Potrzeby NPC korzystają z zapasów gospodarstwa.
7. Pełne gospodarstwo może przekazać zasób do magazynu osady.
8. Gospodarstwo bez zasobu może pobrać go z magazynu osady.
9. Ten sam mechanizm można wykorzystać później dla zwierząt gospodarskich i nowych zasobów.

## Docelowy przepływ etapu

```text
         POZYSKANIE
              ↓
             NPC
              ↓
          GOSPODARSTWO
          ↙           ↘
     KONSUMPCJA     MAGAZYN OSADY
                       ↓
                 inne gospodarstwo
```

To stanowi fundament kolejnego etapu: **produkcji, transportu i pełnego cyklu zasobów**.

---

## Implementation summary (2026-08-14)

**Implemented:**

- `src/settlement/household.ts` — `Household` (`food`/`wood` stock, reusing
  `EconomicStock`; `water` stays source-based per the implementation notes'
  §9), `householdIdFor` (`${settlementId}:household:${familyIndex}`),
  deterministic small starting stock, `minimum`/`target`/`capacity` policy
  (1/3/5), `deposit()` that caps at capacity and routes the remainder to a
  `SettlementEconomy` when given. `HouseholdRegistry` mirrors
  `economy/registry.ts`'s `EconomyRegistry`.
- `SettlementsManager` owns the registry (survives settlement stream-out/in,
  same as `EconomyRegistry`); `createSettlement.ts` builds one household per
  family, index-aligned with `def.families`/`homePlaces`, and passes it to
  each member's `NpcAgent.create(...)` call.
- `NpcAgent`: hunger now checks the NPC's own household first — eats at home
  from household stock when available, otherwise walks to the garden,
  deposits a small gathered amount into the household (capped, overflow to
  the settlement economy), and eats from that. The scheduled `eat` block in
  `beginIdle` follows the same household bookkeeping.
- Wood: the existing chop → deposit action now deposits into the chopper's
  own household first (capped, overflow to `SettlementEconomy`); the woodshed
  development (`tryAdvanceDevelopment`) still runs off the settlement stock,
  so it keeps working, just paced by household capacity. No household falls
  back to the pre-069 direct-to-settlement path (`commitWoodcutterDeposit`).
- `pickNeed`'s `woodShortage`/`foodShortage` bias now also considers the
  NPC's own household shortage, not only the settlement's.
- `?debug=1` NPC label line gains `hh f<food> w<wood>`.
- Tests: `src/settlement/household.test.ts` (stock/policy/deposit-overflow/
  registry-reuse — mirrors `economy/registry.test.ts`'s conventions).

**Deliberately not done** (see implementation notes §33 — unchanged):
production chains/farming, resource reservations, a physical storage
building, trade, and `Household` persistence in `SaveData` (registry lives
on `SettlementsManager` only, same as `EconomyRegistry` today).

**Technically verified:** `npx tsc --noEmit`, `npm run lint` (touched files),
`npm run build`, `npm run test` (590 tests incl. the new household suite) —
all green.

**Not yet browser/manual verified** — no play-session check that households
visibly fill/drain, that a hungry NPC's home-vs-garden choice looks right, or
that wood still reaches the woodshed threshold at a reasonable pace.
