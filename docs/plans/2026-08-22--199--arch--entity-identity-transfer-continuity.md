# Plan: Entity Identity & Transfer Continuity

**Created:** 2026-08-22  
**Status:** `planned` 📋  
**Priority:** high · **Effort:** M  
**Depends on:** ~~194~~ ~~197~~

## Cel

Ustabilizować identity entity w miejscach, gdzie trwała referencja jest obecnie zależna od runtime object, nazwy albo ponownego wygenerowania identyfikatora.

Plan obejmuje trzy potwierdzone obszary:

1. `ItemInstance` — inventory → drop → world → pickup,
2. NPC jako quest giver / quest target,
3. fauna jako konkretny quest target.

Docelowy invariant:

> **Streaming, rebuild, dispose ani transfer runtime representation nie może zmienić tego, które entity reprezentuje trwała referencja.**

Plan **nie zależy od resource deposit continuity z 198**. Jeżeli podczas implementacji okaże się, że konkretna ścieżka dropped-item korzysta z mechanizmu 198, należy wykorzystać istniejący mechanizm, ale nie jest to dependency architektoniczne planu.

---

## 1. ItemInstance — transfer identity

Przeanalizować rzeczywisty lifecycle:

```text
inventory item
    ↓
drop
    ↓
world item representation
    ↓
pickup
    ↓
inventory item
```

Zweryfikować, czy ta sama `ItemInstance` / `itemInstanceId` przechodzi przez cały lifecycle.

W szczególności sprawdzić:

- creation,
- inventory ownership,
- drop,
- world representation,
- pickup,
- inventory insertion,
- disposal po pickup.

Nie generować nowej identity podczas transferu, jeżeli istniejący `itemInstanceId` już pełni tę rolę.

Nie tworzyć nowego item identity systemu.

### Streaming boundary

Sprawdzić tylko te streaming/rebuild paths, które faktycznie obejmują dropped items.

Jeżeli obecny system **nie obiecuje** persistence dropped items przez konkretną granicę lifecycle, nie rozszerzać 199 o pełną dropped-item persistence. Udokumentować istniejący kontrakt i pozostawić szerszy problem poza zakresem.

---

## 2. Quest references do NPC

Zidentyfikować questy, które przechowują NPC przez:

- name,
- runtime object reference,
- inne niestabilne dane,

zamiast stabilnej identity NPC.

Przejść przez:

- quest creation,
- quest state/persistence,
- target/giver resolution,
- NPC unload/load,
- `WorldBundle` rebuild,
- completion.

Dla questów wymagających konkretnego NPC referencja powinna wskazywać jego stabilne `NpcId`.

Po rekonstrukcji:

```text
NpcId
  ↓
current NpcAgent
```

musi rozwiązywać się do tego samego NPC.

Nie migrować questów, które celowo opisują kategorię zamiast konkretnego entity.

---

## 3. Minimalne resolution NPC

Ujednolicić istniejący sposób uzyskania aktualnej runtime representation z `NpcId`.

Resolution powinno poprawnie obsługiwać:

```text
NPC entity exists
        ↓
NpcAgent loaded
```

i:

```text
NPC entity exists
        ↓
NpcAgent currently unloaded
```

W drugim przypadku system nie może stworzyć innego NPC ani uznać braku runtime object za zmianę identity.

Wykorzystać ownership/state continuity ustalone w **197**.

Nie tworzyć globalnego `EntityManager` ani ogólnego lookup frameworka.

---

## 4. Quest target semantics — specific entity vs category

Przed zmianami sklasyfikować istniejące quest targets jako:

```text
specific entity
```

albo:

```text
category / predicate
```

Przykładowo:

```text
"kill this animal"
→ stable animal identity
```

vs.

```text
"kill an animal of type X"
→ type/category predicate
```

Nie zastępować category targetów stable IDs tylko dlatego, że system posiada identity entity.

Zmiana ma dotyczyć wyłącznie przypadków, w których semantyka questa wymaga konkretnego entity.

---

## 5. Fauna jako konkretny quest target

Dla questów wymagających konkretnego zwierzęcia zapewnić stabilną identity targetu.

Zweryfikować:

- fauna spawn/identity,
- quest target creation,
- runtime reconstruction,
- streaming, jeżeli fauna jest przez niego objęta,
- death,
- corpse/removal,
- quest completion.

Nie zmieniać semantyki questów, które celowo nie wskazują konkretnego osobnika.

---

## 6. Dead / removed targets

Ustalić zachowanie quest targetu po:

```text
entity exists
   ↓
death
   ↓
removed / unloaded
```

Jeżeli quest wymaga konkretnego entity, jego identity nie może zostać przejęta przez nowe entity tego samego typu.

Przykład:

```text
Animal A → quest target
Animal A dies
Animal B spawns

Quest must NOT silently target B.
```

Wykorzystać lifecycle semantics z **197**.

Nie tworzyć nowego fauna lifecycle systemu w 199.

---

## 7. Focused identity audit

Przeszukać kod tylko w zakresie:

- `ItemInstance` transfer,
- NPC quest references,
- fauna quest references,
- reconstruction/hydration tych entity.

Szukane wzorce obejmują:

- name-based lookup,
- runtime object references stored as durable state,
- generated IDs podczas reconstruction,
- porównania runtime objectów zamiast stable IDs,
- tworzenie nowej identity podczas hydration.

Nie wykonywać generalnego refaktoru identity całego projektu.

---

## Poza zakresem

- NPC authoritative state — **197**,
- resource deposit identity/state — **198**,
- time-skip — **196**,
- starvation/dehydration persistence — **200**,
- pełny save/load redesign,
- multiplayer identity,
- globalny `EntityManager`,
- migracja wszystkich entity na UUID,
- nowy quest framework,
- pełna przebudowa item systemu,
- generalna persistence dropped items poza istniejącym lifecycle.

---

## Weryfikacja

### Testy

Dodać/rozszerzyć testy dla faktycznie zmienianych ścieżek:

- inventory → drop → pickup,
- dropped item reconstruction, jeżeli jest obecnie wspierana,
- NPC quest reference po unload/reload,
- NPC quest reference po `WorldBundle` rebuild,
- specific fauna quest target,
- dead/removed target,
- rozróżnienie specific entity vs category target.

Kluczowe scenariusze:

```text
ItemInstance A
 ↓
drop
 ↓
rebuild / reload (jeżeli objęte lifecycle)
 ↓
pickup
 ↓
ItemInstance A
```

```text
NPC A
 ↓
quest targets A
 ↓
rebuild / reload
 ↓
quest still targets NPC A
```

```text
Animal A
 ↓
quest targets A
 ↓
Animal A dies
 ↓
Animal B spawns
 ↓
quest must NOT target B
```

### Browser verification

Zweryfikować:

1. upuścić konkretny item i sprawdzić transfer identity,
2. jeżeli dropped items są objęte streamingiem — wymusić odpowiednią granicę i potwierdzić brak duplikacji/utraty,
3. rozpocząć quest związany z konkretnym NPC,
4. wymusić unload/reload lub rebuild,
5. potwierdzić poprawnego quest target/givera,
6. rozpocząć quest związany z konkretnym zwierzęciem,
7. wymusić reconstruction/streaming, jeżeli fauna jest nim objęta,
8. potwierdzić poprawnego targetu,
9. sprawdzić zachowanie po śmierci/usunięciu targetu.

---

## Kryteria akceptacji

- [ ] `ItemInstance` zachowuje identity przez drop/pickup.
- [ ] Jeżeli dropped items są objęte streaming/rebuild lifecycle, reconstruction nie zmienia ich identity.
- [ ] Quest references do konkretnych NPC używają stabilnej identity.
- [ ] NPC quest target resolution działa po runtime reconstruction.
- [ ] Specific-entity questy i category/predicate questy zachowują odrębną semantykę.
- [ ] Fauna-specific quest target zachowuje identity konkretnego zwierzęcia.
- [ ] Nowe entity tego samego typu nie mogą przejąć starego specific quest targetu.
- [ ] Death/removal targetu ma deterministyczne zachowanie.
- [ ] Istniejący NPC identity/lifecycle mechanism z 197 jest wykorzystywany zamiast duplikacji.
- [ ] Nie powstaje globalny Entity Manager ani drugi system lifecycle/persistence.
- [ ] Nie rozszerzono zakresu o pełną dropped-item persistence bez potwierdzonego wymagania.
- [ ] Testy przechodzą.
- [ ] Zachowanie zostało zweryfikowane w przeglądarce.

> **Zrób git commit i push do main, rebase jeżeli trzeba**