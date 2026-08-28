# MPFB2 → Mixamo → GLB — Delete Groups & Export

## Status

**Status:** 🟡 In progress — Delete Groups działają, problem pozostał na etapie GLB export/renderingu.

### Działający workflow

1. **Bazowa postać MPFB2**
2. **Dodanie rig Mixamo**
3. **Przygotowanie animacji**
   - export Mixamo reduced doll
   - import na Mixamo Web
   - export animacji
   - import animacji
   - Snap to Mixamo
   - Bake
   - rename Action
4. **Assets / Library Settings**
   - `GameEngine (PBR)` ✅
   - `Material Instances` ❌
5. **Dodanie skóry, oczu i ubrań**
6. **Wygenerowanie MPFB2 Delete Groups** ✅
7. **MPFB2 Export Copy** ✅
8. **Eksport Export Copy do GLB** ✅
9. **Zewnętrzna inspekcja GLB** ✅

---

## Delete Groups

MPFB2 poprawnie tworzy osobne grupy na basemesh:

```text
Human
└── Vertex Groups
    ├── Delete.rehmanpolanski_viking_tunic
    └── Delete.rehmanpolanski_viking_pants
```

Nazwa grupy jest generowana jako:

```python
group_name = f"Delete.{clothes.name.split('.')[-1]}"
```

Następnie na `Human` tworzone są odpowiadające maski:

```text
Human
└── Modifiers
    ├── Armature
    ├── Hide helpers
    ├── Delete.rehmanpolanski_viking_tunic
    └── Delete.rehmanpolanski_viking_pants
```

Maski mają:

```text
Delete.* → Vertex Group odpowiadający ubraniu
Invert → True
```

Dzięki temu skóra znajdująca się pod ubraniem jest poprawnie ukrywana.

---

# Aktualny problem

Po wykonaniu:

```text
MPFB2 Export Copy
        ↓
GLB Export
        ↓
Seedvale / GLB viewer
```

postać nadal renderuje się niepoprawnie.

### Objawy w GLB

- ubranie wygląda jak częściowo przezroczyste,
- przez ubranie można zobaczyć geometrię znajdującą się z tyłu,
- włosy / elementy z alpha prześwitują,
- przez skórę twarzy można zobaczyć gałkę oczną.

**Istotne:** problem występuje dopiero w wyeksportowanym GLB. `Export copy` w Blenderze jest poprawna.

---

# Inspekcja GLB

Zewnętrzny inspektor wykazał:

### Materiały opaque

Tunika:

```text
Human.rehmanpolanski_viking_tunic
PNG RGB
has alpha: False
alphaMode: BLEND
```

Spodnie:

```text
Human.rehmanpolanski_viking_pants
PNG RGB
has alpha: False
alphaMode: BLEND
```

Buty:

```text
Human.rehmanpolanski_viking_boots
PNG RGB
has alpha: False
alphaMode: BLEND
```

Skóra:

```text
Human.body
PNG RGB
has alpha: False
alphaMode: BLEND
```

### Materiały rzeczywiście używające Alpha

Broda:

```text
Human.culturalibre_faun_beard
PNG RGBA
transparent: 91.12%
alphaMode: BLEND
```

Pozostałe elementy włosów również mają RGBA i znaczną część pikseli transparentnych.

---

# Wniosek

GLB zawiera obecnie:

```text
Human.body                         → BLEND ❌
viking_tunic                       → BLEND ❌
viking_pants                       → BLEND ❌
viking_boots                       → BLEND ❌

faun_beard                         → BLEND ✅
hair / alpha materials             → BLEND ✅
```

Czyli **nie możemy po prostu wyłączyć `BLEND` globalnie**.

Potrzebujemy rozdzielić:

```text
OPAQUE materials
        ↓
OPAQUE

Alpha materials
        ↓
BLEND / MASK
```

---

# Co trzeba teraz ustalić

Nie wiemy jeszcze, **dlaczego Blender glTF exporter eksportuje materiały RGB bez Alpha jako `alphaMode: BLEND`.**

Należy sprawdzić materiał **przed eksportem**, w `Export copy`.

Dla:

```text
Human.body
Human.rehmanpolanski_viking_tunic
Human.rehmanpolanski_viking_pants
Human.rehmanpolanski_viking_boots
Human.culturalibre_faun_beard
Human.short02.001
Human.short04
```

trzeba odczytać:

```text
Material
└── Node Tree
    └── Principled BSDF
        ├── Base Color
        └── Alpha
```

oraz ustawienia materiału związane z transparency / surface render method.

---

# Następny krok

Przygotować **read-only Blender Python inspector**, który dla wszystkich materiałów `Export copy` wypisze:

```text
material name
surface/render method
Principled BSDF
Base Color connection
Alpha connection
Alpha default value
Base Color texture
texture color space
texture channels
```

Nie modyfikuje sceny.

Celem jest ustalenie dokładnego łańcucha:

```text
MPFB2 material
      ↓
Blender Material / Node Tree
      ↓
glTF exporter
      ↓
alphaMode: BLEND
      ↓
niepoprawny rendering GLB
```

Dopiero po tym należy zdecydować, czy problem naprawiamy:

- w ustawieniach materiałów MPFB2,
- w `Export copy`,
- w konfiguracji eksportera glTF,
- czy potrzebny jest mały preprocessing przed eksportem.

---

## Ważne ustalenia

- ❌ Problem nie leży w `Delete.*` groups.
- ❌ Problem nie leży w `Export copy`.
- ❌ Nie należy na razie ręcznie poprawiać GLB.
- ❌ Nie należy globalnie ustawiać wszystkich materiałów na `OPAQUE`.
- ✅ Delete Groups są generowane poprawnie.
- ✅ MPFB2 `ClothesService.create_new_delete_group(...)` działa.
- ✅ Export Copy poprawnie ukrywa skórę pod ubraniem.
- ✅ GLB zawiera poprawne osobne materiały dla ubrań.
- 🔎 Do ustalenia pozostaje źródło niepoprawnego `alphaMode: BLEND`.

**Cel:** uzyskać GLB, w którym materiały skóry i zwykłych ubrań są rzeczywiście opaque, a materiały wymagające alpha (np. włosy) zachowują prawidłową przezroczystość.
