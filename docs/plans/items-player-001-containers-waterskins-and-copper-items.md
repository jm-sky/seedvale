# Plan: Containers, Waterskins & Copper Items

**Created:** 2026-08-27  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** S  
**Depends on:** `none`  
**Domain:** `items-player`

## 1. Cel

Dodać do Seedvale podstawowe pojemniki potrzebne do dalszego rozwoju:

- gospodarki wodą,
- dojenia i mleka,
- farm,
- transportu płynów,
- wyposażenia gracza i NPC.

Na tym etapie dodajemy **itemy, ich definicje, pojemności, materiały, podstawowe dane domenowe oraz przygotowanie pod interakcje**.

**Nie implementujemy jeszcze procesu wytwarzania.**

System okien interakcji będzie realizowany w osobnym planie i powinien istnieć przed integracją pełnych interakcji tych przedmiotów.

---

# 2. Zakres itemów

## 2.1. Bukłaki

Dodać trzy rozmiary:

| ItemKind | Nazwa | Pojemność |
|---|---|---:|
| `waterskin_small` | Mały bukłak | **2 l** |
| `waterskin_medium` | Średni bukłak | **5 l** |
| `waterskin_large` | Duży bukłak | **10 l** |

Istniejący bukłak należy odpowiednio zmienić/rozszerzyć zamiast tworzyć równoległy system.

### Zawartość

Bukłak jest przeznaczony do **wody**.

Docelowy stan:

```
water: 2 / 5 l
water: 4 / 10 l
```

Nie tworzyć osobnych itemów dla różnych ilości wody.

### Picie

Jedna porcja picia zużywa:

**1 l wody**

Przykład:

```
5 / 5 l
→ picie
→ 4 / 5 l
```

Pusty bukłak pozostaje tym samym przedmiotem:

```
0 / 5 l
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

## 3.1. Zastosowania wiadra

Wiadro jest pojemnikiem dla:

- wody,
- mleka.

Docelowo powinno obsługiwać:

```
empty
water: X / 10 l
milk: X / 10 l
```

Przykład:

```
Drewniane wiadro
Mleko: 6 / 10 l
```

---

# 4. Dodatkowe naczynia

### Kubek — NIE dodajemy na tym etapie

Ponieważ przyjmujemy, że można:

- pić wodę bezpośrednio z wiadra,
- pić mleko bezpośrednio z wiadra,

`copper_cup` nie ma obecnie wystarczającego zastosowania mechanicznego.

Nie dodawać go tylko jako dekoracyjnego itemu.

Można wrócić do niego w przyszłości, gdy pojawi się mechanika:

- porcji napojów,
- serwowania jedzenia,
- karczm,
- przygotowywania napojów,
- podawania mleka.

---

# 5. Miedź

Na tym etapie wprowadzamy **miedź jako jedyny nowy metal**.

## `copper_ore`

**Nazwa:** Ruda miedzi

Reprezentuje wydobywaną rudę.

Powinna zostać zintegrowana z istniejącym systemem zasobów/minerałów.

## `copper`

**Nazwa:** Miedź

Materiał wykorzystywany przez późniejszy crafting.

Na tym etapie **nie implementować pełnego procesu przetwarzania rudy**.

Jeżeli istniejący system wymaga minimalnego źródła `copper`, należy wykorzystać istniejące mechanizmy zamiast tworzyć osobny system metalurgii.

---

# 6. Mleko

Ten plan przygotowuje itemy pod przyszły system mleka.

Docelowy przepływ:

```
krowa
 ↓
dojenie
 ↓
odpowiedni pojemnik
 ↓
milk: X / 10 l
```

Przykład:

```
wooden_bucket
milk: 7 / 10 l
```

### Dojenie

**Wiadro nie musi być jedynym możliwym typem naczynia w abstrakcyjnym systemie.**

Na obecnym etapie jednak to ono jest podstawowym przewidzianym pojemnikiem do dojenia.

Bukłaki **nie są przeznaczone do mleka**.

### Picie

Mleko można pić bezpośrednio z wiadra.

Jedno picie:

```
7 / 10 l
→
6 / 10 l
```

Szczegółowa akcja interakcji będzie podłączona do systemu interakcji z osobnego planu.

---

# 7. System pojemników

Nie tworzyć osobnego `BucketSystem`.

Jeżeli obecna architektura tego wymaga, należy wprowadzić **minimalny, wspólny model pojemnika**, możliwy do wykorzystania przez:

- bukłak,
- wiadro,
- później beczkę.

Koncepcyjnie:

```
Container
├── capacity
├── content type
└── content amount
```

Przykłady:

```
waterskin_small
capacity: 2 l
content: water
amount: 1 l
```

```
copper_bucket
capacity: 10 l
content: milk
amount: 6 l
```

Nie należy jednak wprowadzać pełnej architektury `ItemInstance`, jeśli nie jest ona jeszcze potrzebna. Jeżeli obecne `Inventory` (`ItemKind → count`) uniemożliwia poprawną reprezentację częściowej zawartości, należy zastosować **minimalne rozwiązanie zgodne z istniejącą architekturą** i odnotować ewentualną potrzebę przyszłego `ItemInstance` w dokumentacji.

---

# 8. Przyszłe akcje domenowe

Plan powinien przygotować przedmioty pod następujące akcje:

### Bukłak

```
fill water
drink
empty
```

### Wiadro

```
fill water
drink water
fill milk / milk cow
drink milk
empty
```

Nie oznacza to implementacji UI tych akcji.

Akcje powinny być możliwe do wywołania przez przyszły system interakcji.

---

# 9. Interakcje i UI/UX

**Poza zakresem tego planu.**

System okien interakcji zostanie przygotowany wcześniej w osobnym planie.

Docelowo powinien umożliwiać sytuację:

```
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

System domenowy powinien dostarczać **dane/warunki akcji**, a system UX będzie odpowiedzialny za:

- prezentowanie akcji,
- filtrowanie niedostępnych akcji,
- wybór akcji,
- komunikaty,
- wejście `[E]`.

Po zakończeniu planu UX należy uzupełnić ten plan o konkretne punkty integracyjne.

---

# 10. Lokacje i źródła itemów

## Bukłaki

Przyszłe źródło:

**Leatherworker / żona Huntera**

Docelowo:

```
hide
 ↓
leatherworking
 ↓
waterskin_small / medium / large
```

Na tym etapie **bez craftingu**.

Możliwe późniejsze źródło:

- kupiec.

Nie dodawać losowego world spawnu.

## Drewniane wiadro

Przyszłe źródło:

- produkcja z drewna,
- odpowiedni NPC/profesja,
- kupiec.

Na tym etapie bez receptury.

## Miedziane wiadro

Przyszłe źródło:

- kowal,
- kupiec.

Na tym etapie bez receptury.

## Ruda miedzi

Źródło:

- złoża miedzi w świecie.

Należy wykorzystać istniejący system generowania/zbierania minerałów.

Nie tworzyć osobnego systemu placementu tylko dla miedzi.

## Miedź

Źródło:

- przyszłe przetwarzanie `copper_ore`.

---

# 11. World placement

Nowe przedmioty **nie powinny być automatycznie rozmieszczane losowo w świecie**.

W szczególności:

- bukłaki → nie jako random pickup,
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
- miedziane wiadro.

Jeżeli odpowiednie GLB nie istnieje:

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

Dla każdego itemu opisać:

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
- ❌ plecaka,
- ❌ juków,
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

### Itemy

- [ ] `waterskin_small` — 2 l
- [ ] `waterskin_medium` — 5 l
- [ ] `waterskin_large` — 10 l
- [ ] `wooden_bucket` — 10 l
- [ ] `copper_bucket` — 10 l
- [ ] `copper_ore`
- [ ] `copper`
- [ ] brak `copper_cup`

### Pojemniki

- [ ] pojemniki mają określoną maksymalną pojemność,
- [ ] możliwa jest częściowa zawartość,
- [ ] stan zawartości nie tworzy osobnych `ItemKind`,
- [ ] woda może być przechowywana w bukłakach,
- [ ] woda może być przechowywana w wiadrach,
- [ ] mleko może być przechowywane w wiadrach,
- [ ] bukłaki nie są pojemnikami na mleko.

### Picie

- [ ] jedna porcja = 1 l,
- [ ] można pić tylko przy dostępnej zawartości,
- [ ] picie zmniejsza zawartość pojemnika,
- [ ] pusty pojemnik pozostaje dostępny do ponownego użycia.

### Integracja

- [ ] `ItemKind`, `ITEM_DEFS` i `ITEM_CATALOG` są spójne,
- [ ] istniejące inventory/save pozostają kompatybilne,
- [ ] wykorzystane są istniejące mechanizmy itemów,
- [ ] nie powstaje drugi system itemów,
- [ ] nie powstaje drugi system placementu,
- [ ] ruda miedzi korzysta z istniejącego systemu zasobów.

### UX — późniejsza integracja

- [ ] plan UX/interactions istnieje przed integracją,
- [ ] akcje pojemników mogą być wystawione jako akcje kontekstowe,
- [ ] lista akcji może zależeć od posiadanych itemów i ich stanu,
- [ ] ten plan zostanie uzupełniony po implementacji systemu okien interakcji.

### Techniczne

- [ ] `npx tsc --noEmit`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm run test`
- [ ] browser/manual verification dla zmian widocznych w grze.

---

# 17. Następny etap

Po zakończeniu tego planu osobny plan powinien zająć się:

**Leatherworker + Blacksmith Crafting**

obejmując:

```
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

oraz integrację z istniejącymi NPC, gospodarką i settlementami.

Po zakończeniu wcześniejszego planu UX/interactions należy wrócić do sekcji 9 i uzupełnić ją o konkretne punkty integracji.

**Zrób git commit i push do main, rebase jeżeli trzeba**
