# Plan: Containers, Waterskins & Copper Items

**Created:** 2026-08-27  
**Status:** `verification needed` 🔍 — implemented per the review notes below, technical checks pass; browser/manual verification pending. See [implementation notes](./implementation-notes/items-player-001-containers-waterskins-and-copper-items-implementation-notes.md) — §1-18 are the pre-implementation review, §19 documents what was actually built.  
**Priority:** medium · **Effort:** S  
**Depends on:** `none`  
**Domain:** `items-player`

## 1. Cel

Dodać do Seedvale podstawowe pojemniki i przedmioty potrzebne do dalszego rozwoju:

- gospodarki wodą,
- dojenia i mleka,
- farm,
- transportu płynów,
- wyposażenia gracza i NPC.

Na tym etapie dodajemy **itemy, ich definicje, pojemności, materiały, podstawowe dane domenowe oraz przygotowanie pod przyszłe interakcje i crafting**.

**Nie implementujemy jeszcze procesu wytwarzania.**

System okien interakcji będzie realizowany w osobnym planie i powinien istnieć przed integracją pełnych interakcji tych przedmiotów.

---

# 2. Bukłaki

Dodać trzy rozmiary:

| ItemKind | Nazwa | Pojemność |
|---|---|---:|
| `waterskin_small` | Mały bukłak | **2 l** |
| `waterskin_medium` | Średni bukłak | **5 l** |
| `waterskin_large` | Duży bukłak | **10 l** |

Istniejący bukłak należy odpowiednio zmienić/rozszerzyć zamiast tworzyć równoległy system.

## 2.1. Zawartość

Bukłak jest przeznaczony do **wody**.

Stan przechowywania powinien być częściowy, np.:

```text
water: 2 / 5 l
water: 4 / 10 l
```

Nie tworzyć osobnych `ItemKind` dla różnych ilości wody.

Pusty bukłak pozostaje tym samym przedmiotem:

```text
water: 0 / 5 l
```

## 2.2. Picie

Jedna porcja picia zużywa:

**1 l wody**

Przykład:

```text
5 / 5 l
→ picie
→ 4 / 5 l
```

---

# 3. Wiadra

Dodać dwa warianty:

| ItemKind | Nazwa | Materiał | Pojemność |
|---|---|---|---:|
| `wooden_bucket` | Drewniane wiadro | drewno | **10 l** |
| `copper_bucket` | Miedziane wiadro | miedź | **10 l** |

Oba wiadra powinny korzystać z tego samego modelu domenowego pojemnika.

Różnica materiału jest właściwością itemu, a nie osobnym systemem.

## 3.1. Zastosowania

Wiadro może zawierać:

- wodę,
- mleko.

Docelowy stan:

```text
empty
water: X / 10 l
milk: X / 10 l
```

Przykład:

```text
Drewniane wiadro
Mleko: 6 / 10 l
```

## 3.2. Picie

Wodę i mleko można pić bezpośrednio z wiadra.

Jedna porcja picia zużywa:

**1 l**

Przykład:

```text
milk: 7 / 10 l
→ picie
→ milk: 6 / 10 l
```

## 3.3. Dojenie

Wiadro jest podstawowym pojemnikiem przewidzianym do dojenia krów.

Docelowy przepływ:

```text
krowa
 ↓
dojenie
 ↓
wiadro
 ↓
milk: X / 10 l
```

Bukłaki **nie są przeznaczone do mleka**.

---

# 4. Wyroby ze skóry

Żona Huntera jako przyszła leatherworker będzie mogła wytwarzać podstawowe przedmioty ze skóry.

Na tym etapie dodajemy definicje itemów i przygotowujemy je pod późniejszy crafting. Proces wytwarzania nie jest jeszcze implementowany.

## 4.1. Plecak

### `backpack`

**Nazwa:** Plecak  
**Materiał:** skóra

Przeznaczenie:

- zwiększenie pojemności ekwipunku,
- późniejszy element wyposażenia gracza/NPC.

Plecak jest pojedynczym itemem wyposażenia.

Dokładna mechanika zwiększania pojemności inventory zostanie ustalona przy implementacji wyposażenia.

Przyszłe źródła:

- leatherworker / żona Huntera,
- kupiec.

Nie dodawać randomowego world spawnu.

## 4.2. Juki

### `saddlebags`

**Nazwa:** Juki  
**Materiał:** skóra

Przeznaczenie:

- zwiększenie możliwości transportowych zwierzęcia,
- przewożenie przedmiotów przez konia lub osła.

Juki powinny być wyposażeniem zwierzęcia, a nie zwykłym rozszerzeniem inventory gracza.

Docelowo:

```text
horse + saddlebags
        ↓
większa pojemność transportowa
```

oraz:

```text
donkey + saddlebags
        ↓
większa pojemność transportowa
```

Juki powinny być możliwe do założenia na zwierzę, które obsługuje transport.

Nie implementować jeszcze:

- mechaniki zakładania juków,
- inventory zwierzęcia,
- zwiększania pojemności,
- UI wyposażenia zwierzęcia.

Te elementy zostaną połączone z przyszłym systemem wyposażenia/transportu zwierząt.

Przyszłe źródła:

- leatherworker / żona Huntera,
- kupiec.

Nie dodawać randomowego world spawnu.

---

# 5. Miedź

Na tym etapie wprowadzamy **miedź jako podstawowy nowy metal**.

## 5.1. `copper_ore`

**Nazwa:** Ruda miedzi

Reprezentuje wydobywaną rudę.

Powinna zostać zintegrowana z istniejącym systemem zasobów/minerałów.

Nie tworzyć osobnego systemu dla miedzi.

## 5.2. `copper`

**Nazwa:** Miedź

Materiał wykorzystywany przez przyszły crafting.

Na tym etapie **nie implementować pełnego procesu przetwarzania rudy**.

Jeżeli obecny system wymaga minimalnego źródła `copper`, należy wykorzystać istniejące mechanizmy zamiast tworzyć osobny system metalurgii.

---

# 6. Dodatkowe naczynia

## 6.1. Kubek — NIE dodajemy

Kubek nie jest potrzebny na tym etapie, ponieważ przyjmujemy, że:

- wodę można pić bezpośrednio z wiadra,
- mleko można pić bezpośrednio z wiadra.

Nie dodawać `copper_cup` tylko jako dekoracyjnego itemu.

Do tematu kubka można wrócić później, gdy pojawi się konkretna mechanika, np.:

- porcje napojów,
- serwowanie jedzenia,
- karczmy,
- przygotowywanie napojów,
- podawanie mleka.

---

# 7. Wspólny model pojemników

Nie tworzyć osobnego `BucketSystem`.

Jeżeli obecna architektura tego wymaga, należy wprowadzić **minimalny, wspólny model pojemnika**, możliwy do wykorzystania przez:

- bukłak,
- wiadro,
- później beczkę.

Koncepcyjnie:

```text
Container
├── capacity
├── content type
└── content amount
```

Przykład:

```text
waterskin_small
capacity: 2 l
content: water
amount: 1 l
```

```text
copper_bucket
capacity: 10 l
content: milk
amount: 6 l
```

Nie należy jednak wprowadzać pełnej architektury `ItemInstance`, jeśli nie jest ona jeszcze potrzebna.

Jeżeli obecne `Inventory` (`ItemKind → count`) uniemożliwia poprawną reprezentację częściowej zawartości, należy zastosować **minimalne rozwiązanie zgodne z istniejącą architekturą** i odnotować ewentualną potrzebę przyszłego `ItemInstance` w dokumentacji.

---

# 8. Przyszłe akcje domenowe

Przedmioty powinny być przygotowane pod następujące akcje.

## 8.1. Bukłak

```text
fill water
drink
empty
```

## 8.2. Wiadro

```text
fill water
drink water
milk cow
drink milk
empty
```

Nie oznacza to implementacji UI tych akcji.

Akcje powinny być możliwe do wywołania przez przyszły system interakcji.

---

# 9. Interakcje i UI/UX

**Poza zakresem tego planu.**

System okien interakcji zostanie przygotowany w osobnym planie.

Docelowo powinien umożliwiać kontekstowe akcje zależne od:

- obiektu, z którym gracz wchodzi w interakcję,
- posiadanych przedmiotów,
- stanu tych przedmiotów,
- warunków wykonania akcji.

Przykład:

```text
[E] Interakcja z krową

┌─────────────────────────────────┐
│ Przyjrzyj się krowie            │
│                                 │
│ To jest piękna krowa.            │
│                                 │
│ [Napełnij wiadro drewniane]     │
│ [Napełnij wiadro miedziane]     │
│ [Nakarm jabłkiem]               │
└─────────────────────────────────┘
```

System domenowy powinien dostarczać **dane i warunki akcji**, a system UX będzie odpowiedzialny za:

- prezentowanie akcji,
- filtrowanie niedostępnych akcji,
- wybór akcji,
- komunikaty,
- wejście `[E]`.

Po implementacji systemu UX należy wrócić do tego planu i uzupełnić konkretne punkty integracji.

---

# 10. Źródła i lokacje przedmiotów

## 10.1. Bukłaki

Przyszłe źródła:

- leatherworker / żona Huntera,
- kupiec.

Docelowo:

```text
hide
 ↓
leatherworking
 ↓
waterskin_small / medium / large
```

Na tym etapie bez craftingu.

Nie dodawać losowego world spawnu.

## 10.2. Plecak

Przyszłe źródła:

- leatherworker / żona Huntera,
- kupiec.

Nie dodawać losowego world spawnu.

## 10.3. Juki

Przyszłe źródła:

- leatherworker / żona Huntera,
- kupiec.

Nie dodawać losowego world spawnu.

## 10.4. Drewniane wiadro

Przyszłe źródła:

- produkcja z drewna,
- odpowiedni NPC/profesja,
- kupiec.

Na tym etapie bez receptury.

## 10.5. Miedziane wiadro

Przyszłe źródła:

- kowal,
- kupiec.

Na tym etapie bez receptury.

## 10.6. Ruda miedzi

Źródło:

- złoża miedzi w świecie.

Należy wykorzystać istniejący system generowania i zbierania minerałów.

Nie tworzyć osobnego systemu placementu tylko dla miedzi.

## 10.7. Miedź

Źródło:

- przyszłe przetwarzanie `copper_ore`.

---

# 11. World placement

Nowe przedmioty **nie powinny być automatycznie rozmieszczane losowo w świecie**.

W szczególności:

- bukłaki → nie jako random pickup,
- plecaki → nie jako random pickup,
- juki → nie jako random pickup,
- wiadra → nie jako random pickup,
- miedziane wiadra → nie jako random pickup.

Jeżeli późniejszy etap będzie potrzebował stałego przedmiotu w konkretnym miejscu osady, należy użyć istniejącego mechanizmu `createItemSpawners.ts`.

Dla rudy miedzi należy wykorzystać istniejący mechanizm zasobów/minerałów.

Nie tworzyć nowego `ItemPlacementManager`.

---

# 12. Modele 3D

Przed dodaniem assetów sprawdzić istniejące:

- `src/items/itemModels.ts`
- `public/models/`
- `docs/assets/MODELS.md`

Potrzebne docelowo modele:

- mały bukłak,
- średni bukłak,
- duży bukłak,
- drewniane wiadro,
- miedziane wiadro,
- plecak,
- juki.

Jeżeli odpowiedni GLB nie istnieje:

- item nadal ma działać,
- wykorzystać istniejący proceduralny fallback,
- nie tworzyć nowego systemu renderowania itemów.

---

# 13. Waga

Orientacyjne wartości do zweryfikowania względem istniejącego katalogu:

| Item | Pojemność | Waga pustego itemu |
|---|---:|---:|
| `waterskin_small` | 2 l | ~0,25 kg |
| `waterskin_medium` | 5 l | ~0,35 kg |
| `waterskin_large` | 10 l | ~0,50 kg |
| `wooden_bucket` | 10 l | ~1,0 kg |
| `copper_bucket` | 10 l | ~3,0 kg |

Waga płynu **nie powinna być udawana przez zmianę `ITEM_DEFS.weight`**, jeżeli obecny inventory przechowuje tylko wagę jednostki itemu.

Masa zawartości będzie wymagała rozwiązania razem z docelowym systemem częściowych itemów/pojemników.

---

# 14. Dokumentacja

Zaktualizować:

- `docs/items/CATALOG.md`

Dla każdego nowego itemu opisać:

- `ItemKind`,
- nazwę,
- opis,
- kategorię,
- wagę,
- materiał,
- pojemność,
- zawartość,
- przyszłe zastosowania,
- źródło/pochodzenie.

Jeżeli zmieni się status modeli, odpowiednio zaktualizować:

- `docs/assets/MODELS.md`.

---

# 15. Poza zakresem

Nie implementować:

- ❌ craftingu,
- ❌ receptur,
- ❌ stanowiska kowala,
- ❌ stanowiska leatherworkera,
- ❌ pancerza skórzanego,
- ❌ sztućców,
- ❌ kubka,
- ❌ beczki,
- ❌ cyny,
- ❌ brązu,
- ❌ pełnej metalurgii,
- ❌ systemu trwałości,
- ❌ nowego systemu inventory,
- ❌ nowego systemu interakcji/UI.

---

# 16. Weryfikacja

## Itemy

- [x] `waterskin_small` — 2 l
- [x] `waterskin_medium` — 5 l
- [x] `waterskin_large` — 10 l
- [x] `wooden_bucket` — 10 l
- [x] `copper_bucket` — 10 l
- [x] `backpack` (already existed — plan 186)
- [x] `saddlebags`
- [x] `copper_ore`
- [x] `copper`
- [x] brak `copper_cup`

## Pojemniki

- [x] pojemniki mają określoną maksymalną pojemność,
- [x] możliwa jest częściowa zawartość (per-instance `LiquidContainerItemInstance` — two carried units of the same kind can hold different amounts, see implementation notes §19),
- [x] stan zawartości nie tworzy osobnych `ItemKind`,
- [x] woda może być przechowywana w bukłakach,
- [x] woda może być przechowywana w wiadrach,
- [x] mleko może być przechowywane w wiadrach (domain model only — no bucket-milk gameplay path exists yet),
- [x] bukłaki nie są pojemnikami na mleko.

## Picie

- [x] jedna porcja = 1 l,
- [x] można pić tylko przy dostępnej zawartości,
- [x] picie zmniejsza zawartość pojemnika,
- [x] pusty pojemnik pozostaje dostępny do ponownego użycia.

## Integracja

- [x] `ItemKind`, `ITEM_DEFS` i `ITEM_CATALOG` są spójne,
- [x] istniejące inventory/save pozostają kompatybilne — legacy `waterskin_empty`/`waterskin_full` kept as valid `ItemKind`s and converted to `waterskin_medium` instances on load (`migrateLegacyWaterskinsToInstances`), same pattern as plan 161's weapon-instance migration,
- [x] wykorzystane są istniejące mechanizmy itemów,
- [x] nie powstaje drugi system itemów,
- [x] nie powstaje drugi system placementu,
- [x] ruda miedzi korzysta z istniejącego systemu zasobów.

## UX — późniejsza integracja

- [ ] plan UX/interactions istnieje przed integracją,
- [ ] akcje pojemników mogą być wystawione jako akcje kontekstowe,
- [ ] lista akcji może zależeć od posiadanych itemów i ich stanu,
- [ ] ten plan zostanie uzupełniony po implementacji systemu interakcji.

## Techniczne

- [x] `npx tsc --noEmit`
- [x] `pnpm run lint:fix`
- [x] `pnpm run build`
- [x] `pnpm run test`
- [ ] browser/manual verification dla zmian widocznych w grze.

---

# 17. Następny etap

Kolejny etap powinien zająć się **procesem wytwarzania** nowych przedmiotów, w szczególności:

```text
surowce
 ↓
receptura
 ↓
profesja
 ↓
stanowisko pracy
 ↓
czas produkcji
 ↓
gotowy item
```

W pierwszej kolejności dotyczy to:

- leatherworker / żony Huntera,
- kowala,
- bukłaków,
- plecaka,
- juków,
- drewnianych wiader,
- miedzianych wiader.

Proces powinien zostać zintegrowany z istniejącymi NPC, gospodarką, profesjami i settlementami.

**Zrób git commit i push do main, rebase jeżeli trzeba**
