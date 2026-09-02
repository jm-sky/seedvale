# WebGL Program Compilation — Research Summary

**Data:** 2026-09-02  
**Status:** investigation 🔎

## Cel

Zidentyfikować źródło WebGL shader/program first-use hitch podczas streamingu sceny.

Początkowa hipoteza zakładała problem z dużym przejściem liczby programów, np. `43 → 54`.

## Co ustaliliśmy

### 1. Sama liczba programów nie jest wystarczającym wskaźnikiem problemu

Program Census pokazuje około:

```text
73 programs created
72 programs final
```

Duży burst występuje przede wszystkim podczas inicjalizacji, ale późniejsze bursty pojawiają się również podczas streamingu.

Numer konkretnej klatki nie jest stabilny pomiędzy benchmarkami, dlatego nie należy optymalizować np. „frame 7” jako takiego.

---

## 2. Frame 0 to głównie inicjalizacja

W pierwszym benchmarku:

```text
frame 0  +31
```

W drugim:

```text
frame 0  +48
```

Programy obejmują m.in.:

- Sky,
- terrain,
- water,
- grass,
- vegetation,
- SMAA,
- post-processing,
- god rays,
- output shader,
- inne systemowe shadery.

Nie ma obecnie podstaw, aby traktować samą liczbę programów z frame 0 jako główny target optymalizacji.

---

## 3. Późniejsze bursty są związane ze streamingiem assetów

### Benchmark #1

Najciekawszy burst:

```text
frame 7 +8
```

Zidentyfikowane programy:

```text
#58 → /models/nature/tree_a.glb
       MeshStandardMaterial "Green"
       foliage-wind-v3

#59 → /models/nature/tree_c.glb
       MeshStandardMaterial "BirchTree_Bark"

#60 → /models/nature/tree_c.glb
       MeshStandardMaterial "BirchTree_Leaves"
       foliage-wind-v3

#61 → /models/items/branch.glb
       MeshStandardMaterial "Pond_Pack_MAT"

#54–57 → MeshDepthMaterial
          asset/object unknown
```

---

### Benchmark #2

Najciekawsze bursty:

```text
frame 49 +11
frame 58 +7
```

#### Frame 49

Nowe programy były związane m.in. z:

```text
/models/settlement/campfire_unlit.glb
/models/settlement/crops.glb
/models/parked/anvil.glb
/models/settlement/megakit/door_1_flat.glb
house-static-batch
settlement-household-troughs
MI_WindowGlass
```

Szczególnie:

```text
crops.glb
MeshStandardMaterial "Green"
foliage-wind-v3
```

#### Frame 58

Ponownie pojawiła się vegetation + foliage:

```text
tree-living-1
tree-living-4
tree-living-7
branch.glb
```

Programy:

```text
#57 → tree-living-1
       MeshStandardMaterial "Green"
       foliage-wind-v3

#58 → tree-living-4
       MeshStandardMaterial "MapleTree_Bark"

#59 → tree-living-7
       MeshStandardMaterial "MapleTree_Leaves"
       foliage-wind-v3

#60 → branch.glb
       MeshStandardMaterial "Pond_Pack_MAT"

#61–63 → MeshDepthMaterial
            asset/object unknown
```

---

## 4. Powtarzalny wzorzec: `foliage-wind-v3`

To obecnie najsilniejszy trop.

Mechanizm:

```text
MeshStandardMaterial
    +
onBeforeCompile
    +
foliage-wind-v3
```

pojawił się w obu niezależnych benchmarkach.

Dotyczył różnych assetów:

```text
Benchmark #1:
  tree_a.glb
  tree_c.glb

Benchmark #2:
  crops.glb
  tree-living-1
  tree-living-7
```

To sugeruje, że potencjalnym targetem jest **wspólny mechanizm shaderowy**, a nie konkretny model GLB.

---

## 5. Depth shader variants również powtarzają się przy vegetation streaming

W obu benchmarkach pojawiają się nowe:

```text
MeshDepthMaterial
```

często w tym samym okresie co vegetation.

Przykład:

```text
vegetation
    ↓
foliage-wind-v3
    ↓
depth/shadow variants
```

Obecna diagnostyka nie potrafi jeszcze przypisać `MeshDepthMaterial` bezpośrednio do konkretnego object/asset.

To jest luka diagnostyczna, ale nie musi być uzupełniana przed pomiarem kosztu.

---

# Aktualna hipoteza

Najbardziej prawdopodobny scenariusz:

```text
streaming asset
    ↓
material/shader variant first-use
    ↓
new WebGL program
    ↓
shader compilation/linking
    ↓
possible frame-time hitch
```

Szczególnie podejrzany jest:

```text
vegetation / foliage
    ↓
MeshStandardMaterial
    ↓
onBeforeCompile
    ↓
foliage-wind-v3
```

oraz towarzyszące warianty depth/shadow.

Jednocześnie settlement streaming również tworzy nowe programy, więc nie należy zakładać, że vegetation jest jedynym źródłem kosztu.

---

# Co zostało potwierdzone

```text
Program Census                         ✅
Program → material                     ✅
Program → object                       ✅ częściowo
Program → asset/GLB                    ✅ częściowo
Powtarzalność między benchmarkami     ✅
foliage-wind-v3 jako wspólny mechanizm ✅
Depth variants przy vegetation         🟡 prawdopodobne
Rzeczywisty koszt kompilacji           ❌ jeszcze niezmierzony
Konkretny optymalizacyjny fix          ⏸️ jeszcze nie
```

---

# Czego jeszcze nie wiemy

Najważniejsze pytanie:

> **Czy utworzenie tych programów rzeczywiście powoduje istotny koszt CPU/GPU i hitch?**

Census pokazuje *kiedy* program powstał, ale nie pokazuje jeszcze *ile czasu kosztowało jego utworzenie/kompilacja*.

Dlatego obecnie nie należy jeszcze optymalizować `foliage-wind-v3`, depth shaders ani konkretnych assetów na ślepo.

---

# Następny krok

Dodać **minimalny pomiar czasu kompilacji nowych WebGL programs**, powiązany z istniejącym Program Census.

Docelowo chcemy uzyskać dane w rodzaju:

```text
frame 58

#57 tree-living-1 / foliage-wind-v3
    compile/link: X ms

#59 tree-living-7 / foliage-wind-v3
    compile/link: X ms

#61 depth
    compile/link: X ms
```

Następnie porównać koszt:

```text
foliage-wind
vs
normal MeshStandardMaterial
vs
depth/shadow variants
vs
settlement materials
```

Dopiero na podstawie tego wybrać konkretną optymalizację.

---

# Zasada dalszego researchu

Nie optymalizujemy:

```text
"73 programs"
```

Szukamy:

```text
konkretny streaming
    →
konkretne programy
    →
konkretny koszt kompilacji
    →
konkretny hitch
    →
konkretny fix
```

To pozwoli uniknąć optymalizacji shaderów, które są liczne, ale tanie, oraz skupić się na programach faktycznie odpowiedzialnych za spadek frame time.
