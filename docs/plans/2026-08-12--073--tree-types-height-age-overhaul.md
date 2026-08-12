# Tree Types, Height & Age Overhaul

**Status:** `planned`
**Created:** 2026-08-12
**Priority:** 🟡 medium
**Effort:** ?
**Depends on:** ?

## Cel

Urozmaicić drzewa w Seedvale poprzez:

* dodanie **3 klas wielkości drzew**,
* poprawienie zakresów wysokości,
* dodanie nowego wieku `old`,
* ograniczenie występowania dużych/starych drzew, aby las nie wyglądał nienaturalnie.

## 1. Klasy wielkości

Każde drzewo otrzymuje `sizeClass`:

```text
small
medium
large
```

Klasa wielkości jest niezależna od wieku.

Przykładowo:

* `small + mature` → niewielkie dorosłe drzewo,
* `medium + old` → duże, stare drzewo,
* `large + old` → bardzo wysokie, stare drzewo.

Dzięki temu nie trzeba tworzyć dodatkowych kategorii wieku tylko po to, aby uzyskać różnorodne rozmiary drzew.

## 2. Wiek drzewa

Docelowe stadia:

```text
sapling
young
mature
old
```

Zakresy wysokości:

| Age       |      Height |
| --------- | ----------: |
| `sapling` | **0.5–2 m** |
| `young`   | **1.5–6 m** |
| `mature`  |  **4–15 m** |
| `old`     | **12–25 m** |

Zakresy mogą się nakładać. Wiek nie powinien być bezpośrednio determinowany wyłącznie przez wysokość.

## 3. Występowanie `old`

`old` powinno być stosunkowo rzadkie.

Proponowane ograniczenia:

* `small` → **brak `old`**
* `medium` → `old` możliwe, ale rzadkie
* `large` → `old` możliwe
* dodatkowo `old` może mieć np. **50% szansy** tylko w przypadku drzew `medium/large`

Przykładowo:

```text
small:
  sapling / young / mature

medium:
  sapling / young / mature / old (~50%)

large:
  sapling / young / mature / old (~50%)
```

Ostateczne prawdopodobieństwa powinny być konfigurowalne.

## 4. Cel wizualny

Las powinien zawierać mieszankę:

* małych młodych drzew,
* średnich drzew w różnym wieku,
* kilku dużych drzew,
* **rzadkich starych, wysokich drzew**.

Nie chcemy, aby każdy las był wypełniony drzewami 20–25 m wysokości.

`old` powinno być więc elementem wyróżniającym — duże, stare drzewa mogą pełnić również funkcję charakterystycznych punktów w lesie.

## 5. Konfiguracja

Parametry powinny być możliwe do łatwej zmiany bez modyfikowania logiki generowania.

Docelowo konfiguracja powinna obejmować:

```text
sizeClass:
  small
  medium
  large

age:
  sapling
  young
  mature
  old

height ranges
age probabilities
size probabilities
old eligibility
```

### Efekt końcowy

System powinien rozdzielać dwie kwestie:

**Jak duże jest drzewo?**

→ `sizeClass`

**W jakim jest wieku?**

→ `age`

Dzięki temu uzyskamy znacznie większą różnorodność wizualną przy stosunkowo prostej logice generowania.
