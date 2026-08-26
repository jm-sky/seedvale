### Co ustaliliśmy

1. **Problem**

   * Po `Export copy → Export GLB` skóra nadal przebija przez ubrania.
   * Wygenerowany przez nas `Delete.outfit` istnieje, ale MPFB2 najwyraźniej nie traktuje go tak samo jak natywne grupy `Delete.*`.

2. **Nasza pierwsza metoda**

   * Zrobiliśmy własne wykrywanie geometrii outfitu przez BVH.
   * Działa technicznie:

     * znalazł `Human` jako skin,
     * znalazł 3 elementy outfitu,
     * wygenerował `Delete.outfit`,
     * zaznaczył 100% vertexów skóry.
   * Ale efekt GLB pokazuje, że **samo utworzenie grupy vertexów nie gwarantuje poprawnego działania MPFB2**.

3. **Ważne odkrycie**
   Początkowo nie znaleźliśmy API, bo szukaliśmy po złych nazwach/importach.

   Teraz mamy faktyczną strukturę MPFB2:

   ```text
   ...\Blender\5.2\extensions\extensions_blender_org\mpfb\
   ```

4. **Znaleźliśmy natywne mechanizmy MPFB2:**

   ```text
   entities\clothes\mhclo.py
   services\clothesservice.py

   ui\create_assets\makeclothes\operators\gendelete.py
   ui\create_assets\makeclothes\operators\markclothes.py
   ui\create_assets\makeclothes\operators\checkclothes.py
   ui\create_assets\makeclothes\operators\extractclothes.py
   ```

   Szczególnie:

   **`gendelete.py`** ← bardzo istotny

   Nazwa sugeruje, że jest to właśnie operator MPFB2 odpowiedzialny za **generowanie Delete groups dla ubrań**.

---

### Kierunek

**Porzucamy własny BVH jako rozwiązanie docelowe.**

Chcemy:

```text
wybrane ubrania
      ↓
natywny mechanizm MPFB2
      ↓
MHCLO / ClothesService
      ↓
natywne Delete.*
      ↓
MPFB2 Export copy
      ↓
GLB
      ↓
brak przebijającej skóry
```

Czyli zamiast:

```text
outfit geometry
      ↓
nasz BVH
      ↓
Delete.outfit
```

chcemy wykorzystać **dokładnie ten sam mechanizm, którego używa MPFB2 przy tworzeniu/oznaczaniu assetów clothing**.

### Następny krok

Nie zgadujemy już API.

Odczytujemy tylko:

```text
gendelete.py
clothesservice.py
mhclo.py
```

i na ich podstawie ustalimy:

* jaki operator wywołać,
* jakie dane musi mieć outfit,
* czy potrzebny jest `.mhclo`,
* jak MPFB2 tworzy `Delete.*`,
* czy możemy uruchomić natywną funkcję bezpośrednio dla istniejących ubrań.

**To jest obecnie właściwy kierunek.**
