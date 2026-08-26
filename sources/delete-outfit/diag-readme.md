Tak — **mamy przyczynę**.

MPFB2 w Blenderze 5.2 jest ładowane jako:

```python
bl_ext.extensions_blender_org.mpfb
```

a nie:

```python
mpfb
```

Dlatego poprzedni skrypt nie mógł znaleźć API.

Co ważniejsze: **natywne API jest już faktycznie załadowane**, więc możemy użyć dokładnie tego samego kodu, którego używa MPFB2:

```text
ClothesService.create_mhclo_from_clothes_matching()
        ↓
MHCLO matching
        ↓
ClothesService.create_new_delete_group()
        ↓
Delete
```

Czyli jesteśmy już na właściwym tropie. Nie trzeba implementować własnego BVH ani zgadywać geometrii.

### Następny krok

Poprawimy skrypt tak, żeby importował:

```python
from bl_ext.extensions_blender_org.mpfb.services.clothesservice import ClothesService
from bl_ext.extensions_blender_org.mpfb.services.objectservice import ObjectService
```

i używał **natywnego MPFB2**.

Jedna istotna rzecz: `gendelete.py` MPFB2 robi jeszcze:

```python
clothes_copy = clothes.copy()
clothes_copy.data = clothes.data.copy()

for group in clothes_copy.vertex_groups:
    clothes_copy.vertex_groups.remove(group)

clothes_copy.vertex_groups.new(name="body")
```

czyli dokładnie to, co powinniśmy zachować.

Następny skrypt możemy więc zrobić już bardzo mały: **zaznaczasz `Human` + jedno ubranie → Generate Native Delete → MPFB2 tworzy `Delete`**. Bez naszego BVH i bez własnej detekcji.
