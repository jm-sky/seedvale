# Plan: Seedvale Character Preparation Panel

**Created:** 2026-08-31
**Status:** `planned` 📋
**Priority:** high · **Effort:** M
**Depends on:** none
**Domain:** `tools`
**Tags:** `blender` `mpfb2` `characters` `decimate`

## Cel

Rozbudować istniejący panel **Seedvale Character Tools** w Blenderze o automatyczne przygotowanie postaci przed ręcznym MPFB2 Export Copy oraz automatyczne przygotowanie geometrii do eksportu GLB.

Docelowy pipeline:

```
model + animacje
    ↓
Seedvale → Prepare Character
    ├─ Generate Delete Groups + Masks
    └─ Fix Clothing / Hair Alpha
    ↓
MPFB2 → Export Copy (manual)
    ↓
Seedvale → Generate Decimate
    ↓
GLB export
```

## Scope

### 1. Generate Delete Groups + Masks

Zastąpić obecne rozpoznawanie ubrań oparte głównie na nazwach przez wspólny detector obiektów postaci.

Detector powinien:

- znaleźć właściwy MPFB2 Human;
- znaleźć rig/root postaci;
- zebrać mesh'e należące do tej postaci;
- rozpoznać clothing candidates na podstawie strukturalnych cech;
- wykluczyć Human, eyes oraz elementy head-attached, jeżeli klasyfikacja daje wystarczającą pewność;
- raportować niejednoznaczne przypadki zamiast po cichu wybierać przypadkowy obiekt;
- przekazać wykryte clothing meshes do istniejącego mechanizmu generowania Delete Groups.

Istniejący algorytm `create_delete_group_for_clothing()` należy zachować/reużywać.

Automatyczne rozpoznawanie clothing zostało już zweryfikowane na Blacksmith character dla trzech ubrań.

### 2. Fix Clothing / Hair Alpha

Zweryfikować istniejącą implementację i ograniczyć ją do rzeczywiście wymagających materiałów.

Obecna implementacja:

- znajduje materiały po nazwie;
- usuwa link z Principled BSDF Alpha;
- ustawia `surface_render_method = "DITHERED"`.

Przed zmianą należy sprawdzić rzeczywistą strukturę materiałów dla clothing/hair oraz wymagania końcowego GLB.

Nie zmieniać zachowania materiałów, które nie wymagają korekty.

### 3. Generate Decimate

Dodać nową operację panelu:

**Generate Decimate**

Operacja ma automatycznie wykryć właściwe mesh'e w przygotowanym charakterze/export copy i dodać odpowiedni modifier `DECIMATE`.

Detector nie może opierać się wyłącznie na nazwach obiektów.

Pierwszy zakres obejmuje:

- body/clothing i inne właściwe mesh'e eksportowe;
- wykluczenie eyes;
- pominięcie armature/non-mesh;
- idempotentne zachowanie przy ponownym uruchomieniu;
- centralne ustawienia ratio, bez hardcodowania wartości w wielu miejscach.

Początkowy zakres ratio: około `0.2–0.5`, ale dokładna wartość oraz różnicowanie per mesh type wymagają testów na reprezentatywnych postaciach.

Operacja powinna działać zarówno na wykrytym Export Copy, jak i jasno raportować brak odpowiedniego celu.

## Panel

Panel **Seedvale Character Tools** powinien zawierać trzy główne operacje:

- **Generate Delete Groups + Masks**
- **Fix Clothing / Hair Alpha**
- **Generate Decimate**

`Prepare Character` może pozostać jako wygodny skrót dla pierwszych dwóch operacji, ale nie powinien wykonywać Decimate automatycznie, ponieważ Decimate jest wykonywany dopiero po ręcznym MPFB2 Export Copy.

## Poza zakresem

- automatyczne MPFB2 Export Copy;
- naprawianie kontekstu operatora `mpfb.export_copy`;
- automatyczny import animacji;
- bake animacji;
- GLB export;
- pełna automatyzacja całego pipeline'u.

Te elementy pozostają osobnym etapem.

## Istniejące mechanizmy do reuse

- `scripts/blender/delete-outfit/seedvale_character_tools.py`
- `generate_delete_groups_and_masks()`
- `create_delete_group_for_clothing()`
- MPFB2 `ClothesService.create_new_delete_group()`
- `MeshCrossRef` / `VertexMatch`
- MPFB2 Character/ObjectService identification where reliable
- istniejące character identification heuristics w `docs/blender/CHARACTER_IDENTIFICATION_HEURISTICS.md`

Nie tworzyć drugiego mechanizmu generowania Delete Groups.

## Weryfikacja

Minimum:

1. Uruchomić panel na obecnym Blacksmith character.
2. Potwierdzić automatyczne wykrycie Human i clothing.
3. Potwierdzić poprawne `Delete.*` groups + inverted Masks.
4. Sprawdzić clothing/hair alpha na materiałach faktycznie występujących w postaci.
5. Ręcznie wykonać MPFB2 Export Copy.
6. Uruchomić Generate Decimate na Export Copy.
7. Potwierdzić:
   - właściwe mesh'e mają Decimate;
   - eyes nie mają Decimate;
   - armature nie jest dotykany;
   - ponowne uruchomienie nie tworzy duplikatów.
8. Sprawdzić wynik wizualnie przed GLB exportem.
9. Wykonać techniczne testy repozytorium, jeżeli zmiany obejmą wspólne skrypty.

## Ważne ograniczenie

Heurystyki identyfikacji elementów postaci nadal są częściowo draftem. Nie należy uznawać nazwy assetu, UUID ani pojedynczej grupy vertexów za wystarczającą podstawę klasyfikacji. Detektor powinien używać warstwowych dowodów i jawnie raportować przypadki niepewne.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
