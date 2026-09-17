# Plan: Settlement Cultivation Hydration, Rain & Farmer Watering

**Created:** 2026-09-17
**Status:** `draft` 📝
**Priority:** high · **Effort:** M
**Depends on:** ~~settlements-npcs-001~~, ~~settlements-npcs-002~~, ~~settlements-npcs-030~~
**Domain:** `settlements-npcs`
**Type:** `feature`
**Subdomains:** `economy` `schedules`
**Tags:** `farmer` `cultivation` `hydration` `watering` `weather`
**Roadmap:** `quests-professions-and-world-consequences.md`

## Cel

Rozszerzyć istniejący cultivation hydration z `PlayerGardenRecord` na settlementowe `garden` / `field`, tak aby osadowe uprawy miały realny, persistent hydration state, były nawadniane przez deszcz i Farmer NPC oraz ponosiły skutki suszy.

Plan jest draftem i przed zmianą statusu na `planned` wymaga ponownego focused reconu aktualnego kodu, persistence oraz off-screen agriculture.

## Zakres draftu

- stable persistent cultivation state dla settlementowego garden/field;
- hydration, `lastHydrationUpdateAtDays`, drought stress;
- reuse istniejących reguł drying/rain/drought z `playerGarden.ts` zamiast kopiowania ich;
- `CultivationAnchor` pozostaje read-contractem `position + radius`, nie mutable ownerem stanu;
- Farmer reaguje na realny hydration;
- podlewanie wymaga realnego WaterSource i fizycznej wizyty NPC przy źródle;
- najbliższa ukończona studnia może stać się preferowanym źródłem;
- niedokończona studnia nie kwalifikuje się jako źródło;
- settlement crop yield uwzględnia drought przez shared cultivation rules;
- save/load, time skip, settlement unload/load i deterministic rain continuity;
- bez globalnych per-frame scanów.

## Kluczowy flow

```text
settlement garden / field
→ persistent cultivation state
→ lazy hydration resolution
    ├─ natural drying
    ├─ rain contribution
    └─ Farmer watering
→ drought / productivity
→ real crop harvest
```

Farmer:

```text
work
→ cultivation needs water
→ resolve valid nearby WaterSource
→ travel to source
→ obtain watering water
→ travel to cultivation site
→ watering action
→ hydration increases
```

## Do rozstrzygnięcia przy dopracowaniu planu

1. Gdzie dokładnie ma być owner settlement cultivation state i jego stable identity.
2. Jak wydzielić shared hydration primitives z `playerGarden.ts` bez niepotrzebnego refaktoru.
3. Czy NPC ma używać realnego `wooden_bucket` / `copper_bucket`, czy V1 może mieć transient watering payload po fizycznym pobraniu wody.
4. Jak obecny lazy off-screen agriculture z `settlements-npcs-030` ma uwzględniać hydration i watering bez budowania drugiego scheduleru.
5. Jak bootstrapować istniejące save'y i settlementy dokładnie raz.

## Guardrails

Nie tworzyć:

- `SettlementWateringManager`;
- farming-specific weather;
- drugiego crop lifecycle;
- drugiej hydration formula;
- globalnego NPC→field scan;
- osobnego off-screen Farmer simulatora.

## Weryfikacja docelowa

- deszcz realnie zwiększa hydration settlement cultivation;
- brak deszczu powoduje drying/drought;
- Farmer rozpoznaje suche pole/ogród;
- Farmer odwiedza realne źródło wody przed watering;
- bliższa ukończona studnia zmienia trasę pracy Farmera;
- susza wpływa na realny harvest;
- save/load i unload/load nie resetują stanu;
- PlayerGarden hydration nie ma regresji.

Dla ważnych publicznych/architektonicznych funkcji i typów dodać JSDoc z odpowiednim `@domain`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
