# Plan: Natural Resources, Food & Village Economy

**Status:** `planned` (draft w oryginale oznaczony jako `"draft"` — niestandardowa wartość dla tego repo, patrz [plans/README.md](./README.md) „Status values"; zunifikowane do `planned`, bo to nierozstrzygnięty jeszcze szkic, bez decyzji/kodu)
**Created:** 2026-08-08
**Scope:** kolejny etap po generowaniu wiosek ([village-generation.md](./2026-08-08--031--village-generation.md)), rozszerza [multi-settlements.md](./2026-08-07--025--multi-settlements.md) (tam „dystrybucja zasobów per wioska" jest jawnie poza zakresem v1 — to jest ten plan)

> Draft od ChatGPT, bez dostępu do plików repo. Review przed implementacją — patrz „Review" niżej.

## Review (2026-08-08, Claude) — vs. realia kodu

- **Kolejność generacji `teren → środowisko → zasoby → wioski` to zmiana kierunku, nie tylko dodatek.** Dziś jest odwrotnie: `findSettlementSite` ([settlementGenerator.ts](../../src/settlement/settlementGenerator.ts)) szuka płaskiego, safe miejsca (nachylenie/woda/biom), a `families.ts`/`villageClearing.ts` dopiero potem dopasowują teren pod wioskę — zasoby naturalne nigdzie dziś nie wpływają na wybór lokalizacji. Sekcja 5 tego planu („zasób → atrakcyjność lokalizacji → szansa na wioskę") wymaga więc realnego wpięcia w `findSettlementSite`, nie tylko nowej warstwy danych obok.
- **`biomeWeightsAt`/`moistureRegion`** ([biomeRegions.ts](../../src/terrain/biomeRegions.ts), [chunkHeightmap.ts](../../src/terrain/chunkHeightmap.ts)) już dają dokładnie ten sygnał środowiskowy, którego sekcja 3 („zasób ↔ preferowane środowisko") potrzebuje (las/bagno/pustynia/wybrzeże/góry) — `NaturalResource` powinien próbkować ten istniejący axis, nie wynajdywać nowy podział biomów.
- **Nazewnictwo wiosek już istnieje.** [SettlementName.ts](../../src/shared/SettlementName.ts) generuje nazwy terrain-flavored, wpięte w `settlementGenerator.ts`/minimap/panel Mieszkańcy (patrz [npc-names.md](./2026-08-07--027--npc-names.md)). Sekcja 9 (`terrain + dominant resource + seed`) to rozszerzenie istniejącej funkcji, nie nowy system — do zrobienia ostrożnie, żeby nie rozjechać już działającego mechanizmu.
- **Dedykowana rodzina zasobu (sekcja 6) pasuje wprost do istniejącego systemu rodzin** ([families.ts](../../src/settlement/families.ts): `generateFamilies`/`FamilyDef`) — plan sam to zauważa („rodzina jest częścią normalnego systemu rodzin, nie tworzymy osobnego typu NPC"), zgodne z decyzją projektu o jednym systemie zamiast równoległych (patrz `HealthState`/`CharacterDef` w [npc-character-depth.md](./2026-08-07--022--npc-character-depth.md)) — dobry wzorzec do utrzymania tutaj też.
- **Resource Outpost (sekcja 7) to nowy rodzaj osady, mniejszy niż dzisiejsze SM.** `rollVillageSize` w `families.ts` dziś generuje tylko SM/MD/LG — outpost (1 dom, 1 samotny NPC, `relation: 'single'`) to nowy dolny próg, nie mieści się w obecnym zakresie rozmiarów bez zmiany.
- **Sekcja 8 (Food Source) częściowo już pokryta.** NPC-e dziś mają need „food" zaspokajany przez wspólny `garden` ([props.ts](../../src/settlement/props.ts)) — jeden typ źródła żywności dla całej osady, niezależnie od terenu. Ten plan chce to zróżnicować per-środowisko (pole/sad/rybołówstwo/zbieractwo) — realna zmiana w `SettlementLandmarks`, nie tylko w danych.
- **Sekcja 10-12 (crafting/production/goods/handel) to zakres wyraźnie odłożony przez sam plan** (patrz sekcja 14) — słusznie, bo to spory, osobny system (produkcja → dobra → potrzeby → nadwyżka/deficyt → barter) zależny od wszystkiego wcześniej. Nie zaczynać przed tym, jak sekcje 1-9 wylądują i będą zweryfikowane w przeglądarce.
- **Gracz-owy inventory to osobny, nie ten sam system.** Sekcja 14 wyklucza „pełny crafting, inventory, ekonomię i handel" z v1 — to poprawnie odkłada gospodarkę *wioski* (production/goods/trade między NPC), ale warto rozróżnić od **inventory gracza**: dziś `src/items/Inventory.ts` to prosty `Map<ItemKind, number>` bez żadnego pojęcia wagi/pojemności (gracz może nosić nieograniczoną liczbę muszli/kamieni/gałęzi/grzybów/kwiatów/szyszek, patrz [quests-v2-world-interactions.md](./2026-08-07--018--quests-v2-world-interactions.md)). **Inventory system z limitem wagowym (weight capacity) dla przedmiotów noszonych przez gracza** to osobna, jeszcze niezaplanowana funkcja — nie część tego planu (który dotyczy zasobów/gospodarki *wiosek*, nie gracza), ale naturalny przyszły konsument tych samych `ItemKind`/`goods`, gdy crafting/handel z sekcji 10-12 kiedyś wyląduje. Wart osobnego planu, nie dopisywania tutaj na siłę.

## 1. Idea

Świat nie powinien być generowany pod wioski.

Najpierw powstaje:

teren → środowisko → zasoby → wioski

Wioska pojawia się w świecie, który już posiada określone możliwości przetrwania i produkcji.

Zasoby mogą wpływać na:

- lokalizację wioski,
- jej wielkość,
- rodziny i role NPC,
- budynki i miejsca pracy,
- źródła żywności,
- nazwę wioski,
- przyszłą produkcję i handel.

Nie budujemy jeszcze pełnego systemu ekonomii. Tworzymy fundament, który pozwoli go później naturalnie rozwinąć.

---

## 2. Natural Resources

Zasoby są generowane niezależnie od wiosek.

Przykładowe zasoby:

**Żywność**

- zboże / żyzna gleba
- warzywa
- owoce
- jagody
- grzyby
- ryby
- dzikie zwierzęta
- zwierzęta hodowlane

**Materiały**

- drewno
- kamień
- glina
- żelazo
- węgiel

**Rzadkie / wartościowe**

- złoto
- kamienie szlachetne
- korale
- sól

**Naturalne specjalistyczne**

- żywica
- zioła
- inne zasoby zależne od biomu

Pula na początku powinna być niewielka i możliwa do późniejszego rozszerzania.

---

## 3. Zasoby zależne od terenu

Każdy zasób ma preferowane środowisko.

Przykłady:

| Zasób | Preferowane miejsce |
|-------|---------------------|
| Węgiel | góry, skały |
| Żelazo | góry, skały |
| Złoto | góry, rzeki |
| Sól | wybrzeże, wyschnięte jeziora |
| Żyzna gleba | okolice rzek i jezior |
| Ryby | jeziora, rzeki, morze |
| Korale | wybrzeże, płytka woda |
| Żywica | las |
| Grzyby | bagno, wilgotny las |
| Zioła | łąki, las, okolice wody |
| Glina | brzegi rzek i jezior, bagno |
| Drewno | las |
| Kamień | góry, skały |

Preferencja nie powinna być twardym ograniczeniem.

Zasób może pojawić się również poza swoim idealnym środowiskiem, ale z mniejszym prawdopodobieństwem.

---

## 4. Model zasobu

Minimalny model:

```ts
NaturalResource {
  type
  position
  radius
  richness
}
```

„richness" określa, jak znaczące jest dane źródło.

W przyszłości może wpływać na:

- wielkość produkcji,
- atrakcyjność dla osady,
- liczbę NPC zajmujących się zasobem,
- znaczenie handlowe.

Na tym etapie nie tworzymy jeszcze pełnego inventory zasobu.

---

## 5. Wioska a zasoby

Wioska nie musi znajdować się przy zasobie.

Znaczący zasób w pobliżu zwiększa jednak prawdopodobieństwo powstania wioski w tym miejscu.

Czyli:

```
zasób
  ↓
atrakcyjność lokalizacji
  ↓
szansa na wioskę
```

Bez twardego capu i bez wymuszania, że każda wioska musi mieć zasób specjalistyczny.

---

## 6. Dedykowana rodzina zasobu

Jeżeli wioska znajduje się wystarczająco blisko znaczącego zasobu, może otrzymać:

**1 dedykowaną rodzinę + 1 dedykowany domek.**

Przykłady:

```
żelazo
→ rodzina górnicza
→ domek / miejsce pracy

żyzna gleba
→ rodzina rolnicza
→ gospodarstwo / pole

jezioro
→ rodzina rybacka
→ domek / miejsce połowu

las
→ rodzina drwali
→ domek / miejsce pozyskiwania drewna
```

W v1:

- jeden zasób → maksymalnie jedna dedykowana rodzina,
- rodzina jest częścią normalnego systemu rodzin,
- nie tworzymy osobnego typu NPC „resource worker".

Rola NPC wynika więc częściowo z możliwości konkretnego miejsca.

---

## 7. Trudno dostępne zasoby

Niektóre zasoby mogą znajdować się w miejscu, gdzie nie ma sensu generować całej wioski.

Przykład:

```
złoto
↓
wysokie góry
↓
zbyt trudne miejsce na wioskę
```

W takim przypadku możliwy jest mały:

**Resource Outpost**

- 1 domek,
- 1 samotny NPC,
- powiązanie z konkretnym zasobem.

Przykład:

> «Samotny górnik mieszkający wysoko w górach przy złożu złota.»

To nadal powinien być zwykły NPC z normalnym `CharacterDef`, rodziną/relacją „single", domem i rolą — nie osobny system postaci.

---

## 8. Food Source

Każda wioska powinna mieć przynajmniej jedno wiarygodne źródło żywności.

Nie oznacza to, że każda musi mieć pole.

Możliwe źródła:

| Źródło | Przykład |
|--------|----------|
| Pole | zboże |
| Ogród | warzywa |
| Sad | owoce |
| Hodowla | krowy, owce, kury |
| Rybołówstwo | jezioro, rzeka, morze |
| Zbieractwo | jagody, owoce leśne |
| Grzyby | las, bagno |
| Polowanie | dzikie zwierzęta |

Źródło żywności powinno zależeć przede wszystkim od lokalnego środowiska.

Przykład:

```
jezioro
→ ryby

żyzna ziemia
→ pola

las
→ owoce / jagody / grzyby / polowanie

łąka
→ hodowla / uprawy
```

---

## 9. Zasoby a nazwa wioski

Zasoby mogą wpływać na nazwę wioski.

Nazwa nie musi już wynikać wyłącznie z terenu.

Możliwa logika:

```
terrain + dominant resource + seed
```

Przykłady:

- Ironvale
- Goldbrook
- Saltshore
- Resinwood
- Mossmere

W przyszłości nazwy mogą być oczywiście dostosowane do stylu/lokalizacji świata.

Zasób nie powinien zawsze występować w nazwie — tylko gdy jest wystarczająco znaczący.

---

## 10. Resources → Crafting

Docelowy kierunek:

```
resources
    ↓
production
    ↓
crafting
    ↓
goods
```

Przykłady:

```
glina → garncarstwo → garnki

drewno → stolarstwo → deski / narzędzia

żelazo + węgiel → kowalstwo → narzędzia

wełna → przędzenie → tkaniny
```

Na tym etapie nie implementujemy jeszcze pełnego craftingu gracza.

Najpierw interesuje nas co potrafi produkować dana osada.

---

## 11. Village Economy

W przyszłości każda wioska może posiadać:

**Production** — co może produkować dzięki lokalnym zasobom.

**Consumption** — czego potrzebuje jej populacja.

**Surplus** — czego ma więcej, niż potrzebuje.

**Deficit** — czego jej brakuje.

Przykład:

```
Wioska Żelazna

produkuje:
- żelazo
- narzędzia

potrzebuje:
- żywności

eksportuje:
- narzędzia

importuje:
- zboże
```

Druga wioska:

```
Wioska nad Jeziorem

produkuje:
- ryby
- zboże

potrzebuje:
- narzędzi

eksportuje:
- żywność

importuje:
- żelazo / narzędzia
```

---

## 12. Barter / Trade

Dopiero z powyższych systemów może naturalnie powstać handel:

```
Resources
    ↓
Village Production
    ↓
Goods
    ↓
Village Needs
    ↓
Surplus / Deficit
    ↓
Barter / Trade
```

Nie tworzymy od razu systemu sklepów ani waluty.

Pierwszym modelem handlu może być barter:

```
10 ryb ↔ 1 żelazne narzędzie
```

Wartość może później wynikać z lokalnej dostępności i zapotrzebowania, zamiast być globalnie ustaloną ceną.

---

## 13. Zasada projektowa

Nie budować osobnych, niezależnych systemów:

- „ResourceSystem"
- „EconomySystem"
- „TradingSystem"
- „VillageProductionSystem"

jeżeli te systemy dublują dane.

Zamiast tego rozwijać istniejące zależności:

```
World
  ↓
Terrain
  ↓
Natural Resources
  ↓
Settlement
  ↓
Families / Roles
  ↓
Food & Production
  ↓
Goods
  ↓
Needs
  ↓
Surplus / Deficit
  ↓
Trade
```

Każdy kolejny etap powinien wykorzystywać dane wygenerowane wcześniej.

---

## 14. Zakres pierwszej implementacji

Pierwsza wersja powinna obejmować tylko:

1. Generowanie naturalnych zasobów.
2. Preferencje zasobów względem terenu.
3. „richness" zasobów.
4. Wpływ zasobów na atrakcyjność lokalizacji wioski.
5. Food source dla każdej wioski.
6. Dedykowaną rodzinę + domek dla znaczącego zasobu.
7. Opcjonalne resource outposts.
8. Wpływ dominującego zasobu na nazwę wioski.
9. Przygotowanie danych pod przyszłe „production" / „goods".

Bez pełnego craftingu, inventory, ekonomii i handlu na tym etapie.

Te systemy powinny zostać zbudowane później na bazie danych wygenerowanych tutaj.

## Poza zakresem v1 (podsumowanie)

- Crafting (sekcja 10), pełna village economy production/consumption/surplus/deficit (sekcja 11), barter/trade (sekcja 12) — kolejne etapy po tym planie.
- **Inventory system gracza z limitem wagowym (weight capacity)** dla przedmiotów noszonych przez gracza — osobna, jeszcze niezaplanowana funkcja (patrz „Review" wyżej); dzisiejszy `src/items/Inventory.ts` liczy sztuki bez limitu. Nie część tego planu.
- Waluta / globalne ceny — świadomie odłożone na rzecz lokalnego bartera.
