# Implementation Notes: Deterministically unique settlement names

**Plan:** `settlements-017-deterministically-unique-settlement-names.md`  
**Reviewed against:** `main`, 2026-09-15

## Recon conclusion

`generateSettlementName(seed, terrain, dominantResource)` jest poprawnym pure candidate generator, ale nic nie gwarantuje unikalności między różnymi settlement cells. Nie dodawać module-global used-name setu, bo wynik zacząłby zależeć od stream/query order.

## Existing ownership

- `src/shared/SettlementName.ts` — pure lexical/candidate generation.
- `src/settlement/settlementGenerator.ts` — buduje pojedynczy `SettlementDef`, dziś wywołuje `generateSettlementName(ctx.seedForCell, ...)`.
- `src/settlement/settlementPlanCache.ts` — deterministic definition/cache boundary, właściwszy do koordynacji nazw niż runtime `SettlementsManager`.

## Implementation decision

Unikalność musi być funkcją stable world/cell identity, nie kolejności materializacji. Preferowany algorytm:

1. Zbudować stable ordered set relevant settlement cells/defs używając istniejącego deterministic planning order.
2. Dla każdego cell generować candidate #0 normalnym `generateSettlementName`.
3. Przy kolizji generować candidate #N z deterministycznym attempt salt dodanym do **name seed only**; terrain/resource classification pozostaje bez zmian.
4. Bounded retries, a następnie total deterministic fallback (np. stable suffix derived z cell identity), aby gwarancja nie zależała od rozmiaru puli.
5. Cache przechowuje już resolved `SettlementDef`; po resolution nazwa nie może się zmieniać przy późniejszym stream-in.

Jeżeli `settlementPlanCache` nie posiada jednorazowo pełnego zestawu cells, nie wprowadzać ukrytego mutable reservation order. W takim przypadku rozwiązać nazwę przez czystą funkcję bazującą na stable predecessor set/order możliwym do odtworzenia dla dowolnego cell.

## Candidate generator change

`SettlementName.ts` może dostać opcjonalny `attempt`/salt helper, ale zachować obecne wywołanie dla attempt 0 i nie mieszać uniqueness state do modułu słowników. Resource flavor nadal ma być liczony deterministycznie dla każdego candidate.

## Files / symbols

- `src/shared/SettlementName.ts` — `generateSettlementName(...)` / ewentualny pure candidate helper.
- `src/settlement/settlementGenerator.ts` — current name call-site; nie powinien sam prowadzić globalnego setu.
- `src/settlement/settlementPlanCache.ts` — resolution/cache ownership.
- tests plan cache/generator/name generation.

## Tests to pin

- dwa cells, które wcześniej dawały `Lipowo`, dostają różne final names;
- powtórne uruchomienie z tym samym world seed daje identyczną mapę `settlementId -> name`;
- odwrotna kolejność `settlementDefFor(...)` lookupów nie zmienia żadnej nazwy;
- bounded duży sample nie ma duplicate names;
- attempt 0 zachowuje dotychczasowe nazwy tam, gdzie nie ma kolizji;
- fallback gwarantuje unikalność nawet przy sztucznie małej puli w teście.

Browser verification wykonuje User.
