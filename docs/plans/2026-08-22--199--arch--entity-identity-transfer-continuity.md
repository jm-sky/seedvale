# Plan: Entity Identity & Transfer Continuity

**Created:** 2026-08-22  
**Status:** `planned` 📋  
**Priority:** high · **Effort:** M  
**Depends on:** ~~194~~ ~~197~~ ~~198~~

## Cel

Ustabilizować identity entity w miejscach, gdzie trwała referencja jest obecnie zależna od runtime object, nazwy albo ponownego wygenerowania identyfikatora.

Plan obejmuje trzy potwierdzone obszary:

1. `ItemInstance` — inventory → drop → world → pickup,
2. NPC jako quest giver / quest target,
3. fauna jako konkretny quest target.

Docelowy invariant:

> **Streaming, rebuild, dispose ani transfer runtime representation nie może zmienić tego, które entity reprezentuje trwała referencja.**

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

---

## 2. Dropped items a streaming

Zweryfikować przypadki:

```text
drop
 ↓
chunk unload/load
```

i:

```text
drop
 ↓
WorldBundle rebuild
```

Jeżeli dropped item jest obecnie objęty streaming/rebuild lifecycle, jego runtime representation musi po reconstruction wskazywać tę samą `ItemInstance`.

Zabezpieczyć przed:

- duplikacją,
- utratą itemu,
- ponownym wygenerowaniem itemu,
- zmianą identity.

Jeżeli obecny system świadomie nie utrzymuje dropped items przez określoną granicę lifecycle, udokumentować tę granicę zamiast wprowadzać pełną persistence warstwę.

---

## 3. Quest references do NPC

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

Nie migrować mechanicznie wszystkich questów, jeżeli część z nich celowo opisuje kategorię zamiast konkretnego entity.

---

## 4. Minimalne resolution NPC

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

## 5. Fauna jako konkretny quest target

Rozdzielić dwa istniejące semantycznie różne przypadki:

```text
kill / interact with any animal of type X
```

vs.

```text
kill / interact with this specific animal
```

Dla drugiego przypadku quest musi posiadać stabilną identity konkretnego zwierzęcia.

Zweryfikować:

- fauna spawn/identity,
- quest target creation,
- runtime reconstruction,
- streaming,
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

Wykorzystać lifecycle semantics z **197** i **198**.

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
- pełna przebudowa item systemu.

---

## Weryfikacja

### Testy

Dodać/rozszerzyć testy dla:

- inventory → drop → pickup,
- dropped item reconstruction,
- NPC quest reference po unload/reload,
- NPC quest reference po `WorldBundle` rebuild,
- fauna-specific quest target,
- dead/removed target,
- rozróżnienie specific entity vs category target.

Kluczowe scenariusze:

```text
ItemInstance A
 ↓
drop
 ↓
rebuild / reload
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

---

### Browser verification

Zweryfikować:

1. upuścić konkretny item,
2. wymusić odpowiednią granicę streamingu/rebuild,
3. podnieść item,
4. potwierdzić brak duplikacji i zachowanie identity,
5. rozpocząć quest związany z konkretnym NPC,
6. wymusić unload/reload lub rebuild,
7. potwierdzić poprawnego quest target/givera,
8. rozpocząć quest związany z konkretnym zwierzęciem,
9. wymusić reconstruction/streaming,
10. potwierdzić poprawnego targetu,
11. sprawdzić zachowanie po śmierci/usunięciu targetu.

---

## Kryteria akceptacji

- [ ] `ItemInstance` zachowuje identity przez drop/pickup.
- [ ] Obowiązujące granice streamingu/rebuild nie zmieniają identity dropped itemów.
- [ ] Quest references do konkretnych NPC używają stabilnej identity.
- [ ] NPC quest target resolution działa po runtime reconstruction.
- [ ] Fauna-specific quest target zachowuje identity konkretnego zwierzęcia.
- [ ] Nowe entity tego samego typu nie mogą przejąć starego quest targetu.
- [ ] Specific-entity quest i category quest zachowują odrębną semantykę.
- [ ] Death/removal targetu ma deterministyczne zachowanie.
- [ ] Istniejące mechanizmy identity/lifecycle z 197/198 są wykorzystywane zamiast duplikowane.
- [ ] Nie powstaje globalny Entity Manager ani drugi system lifecycle/persistence.
- [ ] Testy przechodzą.
- [ ] Zachowanie zostało zweryfikowane w przeglądarce.

> **Zrób git commit i push do main, rebase jeżeli trzeba**