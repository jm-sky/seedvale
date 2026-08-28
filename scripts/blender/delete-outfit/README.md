# MPFB2 → Mixamo → GLB — Character Asset Workflow

Ten katalog dokumentuje sprawdzony workflow przygotowania postaci Seedvale
z użyciem MPFB2, Mixamo i eksportu do GLB.

Celem jest uzyskanie postaci:

- z poprawną skórą i ubraniami,
- z riggingiem Mixamo,
- z animacjami,
- z poprawnie wygenerowanymi grupami `Delete.*`,
- gotowej do użycia w Three.js / Seedvale.

---

## Files

- [PROBLEM.md](./PROBLEM.md) - opis problemu jaki mamy na pliku GLB (widać skórę przez ubranie)
- [STATUS.md](./STATUS.md) - status postępu tworzenia rozwiązania

---

## 1. Ustalony workflow

### 1. Bazowa postać MPFB2

Tworzymy bazową postać w MPFB2.

Postać pozostaje natywną postacią MPFB2 (`Human` / basemesh).

---

### 2. Dodanie rig Mixamo

Do postaci dodajemy rig kompatybilny z Mixamo.

Rig jest później używany przez animacje eksportowane z Mixamo.

---

### 3. Przygotowanie animacji

Workflow animacji:

1. Export reduced doll z Mixamo.
2. Import modelu na stronie Mixamo.
3. Rigowanie postaci przez Mixamo.
4. Wybór i eksport potrzebnych animacji.
5. Import animacji do Blendera.
6. `Snap to Mixamo`.
7. `Bake` animacji.
8. Zmiana nazwy Action na docelową nazwę używaną przez Seedvale.

Przykładowo:

```text
Mixamo animation
    ↓
Blender import
    ↓
Snap to Mixamo
    ↓
Bake
    ↓
Rename Action
```

Animacje powinny zostać przygotowane przed wykonaniem finalnej kopii
eksportowej.

---

### 4. Ustawienia Asset Library

Dla assetów używanych przez postać ustawiamy:

```text
Asset Library Settings

Rendering:
    GameEngine (PBR) = ON
    Material Instances = OFF
```

Te ustawienia są częścią workflow eksportowego i powinny być zachowane
dla wszystkich assetów używanych przez postać.

---

### 5. Dodanie skóry, oczu i ubrań

Do bazowej postaci dodajemy:

- skin,
- eyes,
- clothing/outfits.

Ubrania pozostają obiektami MPFB2.

Na tym etapie mogą posiadać między innymi:

```text
Armature
Subdivision
```

Nie należy ręcznie usuwać `Subdivision`, jeśli jest potrzebny przez asset.

---

### 6. Wygenerowanie `Delete.*` vertex groups

To jest **istotny krok przed eksportem GLB**.

MPFB2 używa grup `Delete.*` na basemeshu do ukrywania fragmentów skóry
znajdujących się pod ubraniem.

Przykład:

```text
Delete.boots
Delete.pants
Delete.shirt
...
```

Grupy są tworzone na bazemeshu `Human`, na podstawie konkretnego ubrania.

#### Sprawdzony sposób

Używamy natywnego:

```python
ClothesService.create_new_delete_group(...)
```

z MPFB2.

Nie implementujemy własnego algorytmu generowania grup `Delete.*`,
jeżeli można wykorzystać natywną funkcję MPFB2.

---

## 7. Przygotowanie Delete group przez skrypt

W Blenderze zaznaczamy:

1. `Human` — bazową postać MPFB2,
2. jedno ubranie, dla którego chcemy wygenerować `Delete.*`.

Skrypt tworzy tymczasową kopię ubrania.

Proces:

```text
Human + clothing
        ↓
temporary clothing copy
        ↓
apply ARMATURE modifier
        ↓
remove temporary vertex groups
        ↓
create temporary "body" vertex group
        ↓
build basemesh CrossRef
        ↓
build clothing CrossRef
        ↓
VertexMatch
        ↓
ClothesService.create_new_delete_group(...)
        ↓
Delete.* na Human
        ↓
remove temporary copy
```

### Dlaczego używamy kopii ubrania?

Oryginalny asset ubrania nie powinien być modyfikowany przez testowy
proces generowania grupy.

Skrypt działa na:

```text
Human.rehmanpolanski_viking_pants__DELETE_TEST
```

a następnie usuwa kopię.

Oryginalne ubranie pozostaje nietknięte.

---

## 8. Ważne odkrycia dotyczące MPFB2 API

MPFB2 jest instalowane przez Blender Extension System.

W Blenderze moduły znajdują się pod:

```text
bl_ext.extensions_blender_org.mpfb
```

Dlatego importy natywnego API powinny używać tej przestrzeni nazw,
np.:

```python
from bl_ext.extensions_blender_org.mpfb.services.clothesservice import (
    ClothesService,
)
```

Nie działa:

```python
import mpfb
```

ani:

```python
from mpfb.services...
```

---

### GeneralObjectProperties

`GeneralObjectProperties` nie znajduje się w:

```text
mpfb.services.properties
```

Poprawna lokalizacja:

```text
mpfb/entities/objectproperties
```

czyli:

```python
from bl_ext.extensions_blender_org.mpfb.entities.objectproperties import (
    GeneralObjectProperties,
)
```

---

### LocationService

Nie zakładamy istnienia:

```text
mpfb.services.locations
```

W aktualnej instalacji MPFB2 taki moduł nie istnieje.

Cache dla `MeshCrossRef` może być tymczasowo wyłączony:

```python
cache_dir = None
```

---

## 9. Problemy z modifierami

Natywne generowanie `Delete.*` może odmówić działania, jeśli ubranie
posiada modyfikatory.

Zaobserwowany przypadek:

```text
Armature (ARMATURE)
Subdivision (SUBSURF)
```

Rozwiązanie stosowane przez skrypt:

```text
ARMATURE → Apply
Subdivision → pozostaje
```

Nie stosujemy automatycznie `Apply` dla wszystkich modifierów.

---

## 10. CrossRef i VertexMatch

Proces generowania `Delete.*` wykorzystuje natywne klasy MPFB2:

```python
MeshCrossRef
VertexMatch
ClothesService
```

Dla przykładowych spodni:

```text
Basemesh vertices:    19,158
Clothes vertices:      1,312

Basemesh CrossRef:     28.6 s
Clothes CrossRef:       0.2 s
Vertex matching:        0.1 s
```

Największym kosztem jest obecnie budowanie `MeshCrossRef` bazowego
mesha.

---

## 11. Export copy

Po zakończeniu przygotowania postaci używamy funkcji MPFB2:

```text
Export copy
```

### Options

- Mask -> `Bake mask modifiers`
- Subdiv -> `Make subdiv modifiers`
- [x] Bake modelling shapekeys
- [x] Delete helpers
- [ ] Remove basebesh

Nie eksportujemy bezpośrednio roboczej postaci.

### Workflow:

```text
MPFB2 Human
    +
skin
    +
eyes
    +
clothes
    +
Delete.* groups
    +
Mixamo rig
    +
animations
        ↓
MPFB2 Export Copy
        ↓
final GLB
```

Export copy jest wersją przeznaczoną do eksportu i dalszego użycia
w silniku.

---

## 12. Finalny eksport GLB

Export copy eksportujemy jako:

```text
.glb
```

### Options

- Include 🔽
  - [x] Selected Objects
- Transform 🔽
  - [x] +Y Up
- Data 🔽
  - Scene Grapth 🔽
  - Mesh 🔽
    - [ ] Apply Modifiers
    - [x] UVs
    - [x] Normals
    - [ ] Tangenets
    - [ ] Attributes
    - [ ] Loose Edges
    - [ ] Loose Points
    - [ ] Shared Accessors
  - Material 🔽
    - Materials: `Export`
    - Images: `Automatic`
    - Image Quality: `75`
  - [x] Shape Keys 🔽
    - [x] Shape Key Normals
    - [ ] Shake Key Tangents
    - Optimize Shape Keys 🔽
  - Armature 🔽
    - [x] Use Rest Position Armeture
    - [ ] Export Deformation Bones Only
    - [ ] Remove Armature Object
    - [ ] Flatten Bone Hierarchy
  - [x] Skinning 🔽
    - Bone Influences: `4`
    - [ ] Include All Bone Influences
  - Lighting 🔽
    - Lighting Mode: `Standard`
  - [ ] Draco Compression 🔽
  - [ ] Meshopt Compression 🔽
- [x] Animation 🔽
  - Animation Mode: `Actions`
  - Bake & Merge 🔽
    - [ ] Bake All Objects Animations
  - Rest & Ranges 🔽
  - Armature 🔽
  - [x] Shape Keys Animation 🔽
  - [x] Sampling Animations 🔽
  - Optimize Animations 🔽
  - Extra Animations 🔽
  - [ ] Action filter 🔽


Finalny asset powinien zawierać:

- mesh postaci,
- skórę,
- oczy,
- ubrania,
- rig,
- animacje,
- poprawnie zastosowane `Delete.*`.

---

# Final checklist

Przed eksportem:

- [ ] Bazowa postać jest MPFB2 Human.
- [ ] Mixamo rig jest dodany.
- [ ] Animacje zostały zaimportowane.
- [ ] Animacje zostały `Snap to Mixamo`.
- [ ] Animacje zostały `Bake`.
- [ ] Actions mają docelowe nazwy.
- [ ] Assety mają `GameEngine (PBR)`.
- [ ] `Material Instances` są wyłączone.
- [ ] Skin jest dodany.
- [ ] Eyes są dodane.
- [ ] Wszystkie potrzebne ubrania są dodane.
- [ ] Dla każdego ubrania wygenerowano odpowiednią grupę `Delete.*`.
- [ ] `Delete.*` znajdują się na bazemeshu `Human`.
- [ ] Utworzono MPFB2 `Export copy`.
- [ ] GLB został wyeksportowany z `Export copy`.

---

# Verified Delete Group Workflow

Aktualnie potwierdzony działający przypadek:

```text
Human
+
Human.rehmanpolanski_viking_pants
        ↓
temporary copy
        ↓
Armature → Apply
        ↓
MeshCrossRef
        ↓
VertexMatch
        ↓
ClothesService.create_new_delete_group()
        ↓
SUCCESS: Delete group created
        ↓
temporary copy removed
        ↓
DONE
```

Oryginalny obiekt ubrania nie jest modyfikowany.

---

# Open Questions / Further Investigation

Do dalszego sprawdzenia:

- [ ] Czy wygenerowane `Delete.*` prawidłowo eliminują prześwity skóry
      po eksporcie GLB.
- [ ] Czy wszystkie typy ubrań działają identycznie.
- [ ] Czy `Subdivision` powinien być zawsze pozostawiany przed
      generowaniem Delete group.
- [ ] Czy finalny GLB zachowuje poprawne materiały i animacje.
- [ ] Czy workflow można bezpiecznie zautomatyzować jednym skryptem.
- [ ] Czy można zoptymalizować koszt budowania `basemesh CrossRef`.

---

# Files

```text
scripts/blender/delete-outfit/
├── README.md
└── blender-delete-group-addon-v2.py
```

`blender-delete-group-addon-v2.py` jest obecnie narzędziem pomocniczym
do generowania `Delete.*` dla pojedynczego ubrania.

Nie traktujemy go jeszcze jako finalnego pipeline'u produkcyjnego.

---

# History

## Initial problem

Po eksporcie postaci do GLB skóra bazowego mesha była widoczna przez
niektóre elementy ubioru.

Pierwsze podejście polegało na ręcznym tworzeniu grup:

```text
Delete.*
```

Okazało się jednak, że samo utworzenie grupy nie gwarantuje poprawnego
zachowania zgodnego z MPFB2.

Dlatego rozpoczęto analizę natywnego mechanizmu MPFB2.

## Current solution

Ustalono, że MPFB2 posiada natywny mechanizm:

```python
ClothesService.create_new_delete_group(...)
```

oraz mechanizmy:

```text
MeshCrossRef
VertexMatch
Mhclo
```

Pozwala to odtworzyć proces wymagany przez MPFB2 bez implementowania
własnego algorytmu dopasowania vertexów.

Stan na:

```text
2026-08-27
```

Natywny workflow został pomyślnie wykonany dla ubrania:

```text
Human.rehmanpolanski_viking_pants
```

i zakończył się:

```text
SUCCESS: Delete group created
DONE
```
