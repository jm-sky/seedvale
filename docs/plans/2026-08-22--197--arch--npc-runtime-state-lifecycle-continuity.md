# Plan: NPC Runtime State & Lifecycle Continuity

**Created:** 2026-08-22  
**Status:** `planned` 📋  
**Priority:** critical · **Effort:** L  
**Depends on:** ~~194~~ ~~196~~

## Cel

Zapewnić ciągłość identity i authoritative runtime state NPC niezależnie od:

- settlement streaming,
- settlement unload/load,
- `WorldBundle` rebuild,
- rekonstrukcji runtime representation.

Obecnie `NpcAgent` łączy identity NPC z runtime representation. Po zniszczeniu agenta i jego ponownym utworzeniu część stanu może zostać zainicjalizowana ponownie. Najpoważniejszym skutkiem jest możliwość „ożycia” NPC po unload/reload.

Docelowy model:

```text
NPC identity + authoritative state
             │
             ▼
       NpcAgent runtime
             │
       ┌─────┴─────┐
       ▼           ▼
   simulation   presentation
```

`NpcAgent` może zostać zniszczony i odtworzony, ale **NPC jako entity nie może przez to utracić swojego stanu**.

---

## 1. Ustalić authoritative NPC state

Przeprowadzić focused audit aktualnego `NpcAgent` i jego ownerów, aby określić dokładnie, które pola są:

- identity,
- persistent state,
- runtime simulation state,
- transient presentation/navigation state.

W szczególności przeanalizować:

- `id`,
- alive/dead state,
- HP,
- needs,
- vigor/stamina,
- inventory,
- equipment/tools,
- schedule/work state,
- simulation phase,
- inne pola powodujące trwałe konsekwencje świata.

Nie przenosić automatycznie całego `NpcAgent`.

Wynikiem ma być jawny kontrakt:

```text
authoritative NPC state
        ≠
NpcAgent runtime representation
```

---

## 2. Wybrać właściwego ownera state

Na podstawie istniejącej architektury ustalić, gdzie state NPC powinien żyć przez cały wymagany lifetime.

Owner musi przeżyć:

```text
NpcAgent dispose
       ↓
settlement unload
       ↓
settlement reload
       ↓
WorldBundle rebuild
```

Preferowany jest istniejący settlement/world-level ownership, np. registry/map keyed by stable NPC ID, **ale mechanizm ma wynikać z aktualnego ownership**, a nie być wprowadzony jako ogólny framework.

Nie tworzyć:

- globalnego `EntityManager`,
- globalnego `StateManager`,
- ogólnego persistence frameworka.

---

## 3. Rozdzielić entity identity od runtime representation

Zapewnić następujący lifecycle:

```text
NPC entity
   │
   ├── exists / state owned independently
   │
   ├── NpcAgent created
   │      ↓
   │   hydrated from authoritative state
   │
   └── NpcAgent destroyed
          ↓
      entity state survives
```

Każda ścieżka tworzenia `NpcAgent` musi respektować ten kontrakt.

Jeżeli state dla istniejącego ID istnieje, agent nie może zostać utworzony z domyślnym stanem.

Jeżeli entity jest rzeczywiście nowe, musi zostać utworzony jego initial state.

---

## 4. Zdefiniować synchronizację state ↔ NpcAgent

Określić jednoznacznie, kiedy authoritative state jest:

- tworzony,
- odczytywany podczas hydration,
- aktualizowany po zmianach symulacji,
- zapisywany przed dispose,
- usuwany przy rzeczywistym zakończeniu lifecycle.

Unikać dwóch niezależnych mutable copies state, które mogą się rozjechać.

Jeżeli `NpcAgent` pozostaje głównym miejscem wykonywania mutacji podczas aktywnej symulacji, mechanizm continuity powinien zapewniać, że jego authoritative state jest aktualizowany bez tworzenia drugiego równoległego źródła prawdy.

---

## 5. NPC death jako lifecycle transition

Śmierć NPC ma być zmianą authoritative entity state, a nie wyłącznie zmianą `NpcAgent`.

Model:

```text
alive
  ↓ die()
dead
  ↓
agent/corpse may be disposed
  ↓
entity remains dead
```

Śmierć musi przeżyć:

- settlement unload/load,
- `WorldBundle` rebuild,
- ponowne utworzenie `NpcAgent`.

Nie może istnieć ścieżka:

```text
dead NPC
   ↓ rebuild
new NpcAgent(default alive state)
```

---

## 6. Death consequences

Zidentyfikować istniejące systemy, które muszą zareagować na śmierć NPC:

- Household membership,
- settlement population,
- relationships,
- quests,
- profession/work assignments,
- inne aktywne referencje.

Wykorzystać istniejące mechanizmy orchestration/lifecycle.

Nie tworzyć event busa tylko po to, aby rozpropagować `death`.

Jeżeli potrzebny jest nowy lifecycle hook, powinien mieć:

- jasno określonego ownera,
- jedną odpowiedzialność,
- deterministyczny moment wykonania.

---

## 7. Streaming i WorldBundle rebuild

Przejść przez rzeczywiste ścieżki:

```text
settlement unload
settlement load
WorldBundle rebuild
settlement regeneration
```

Dla każdej ustalić:

1. co jest niszczone,
2. co pozostaje authoritative,
3. co jest rekonstruowane,
4. skąd reconstruction pobiera state,
5. kiedy state jest aktualizowany.

Naprawić tylko te granice, które faktycznie naruszają continuity.

Nie zmieniać mechanizmu streamingowego jako takiego.

---

## 8. Household — tylko potwierdzona continuity

Household ma osobny ownership lifecycle i nie powinien być traktowany jako część `NpcAgent`.

W ramach tego planu naprawić jedynie potwierdzony problem:

```text
WorldBundle rebuild
    ↓
Household recreated
    ↓
runtime state reset
```

Zastosować istniejący wzorzec persistence/carry używany przez `SettlementEconomy`, odpowiednio do rzeczywistego ownership Household.

Nie projektować generalnego systemu persistence dla wszystkich domen.

---

## 9. Identity references

Sprawdzić najważniejsze referencje do NPC pod kątem używania:

```text
stable npc.id
runtime NpcAgent reference
name
```

Priorytetem jest zapewnienie, że lifecycle continuity nie zależy od nazwy ani lifetime obiektu runtime.

Nie wykonywać tutaj pełnej migracji questów i fauna identity.

Znane problemy:

- quest giver `name`,
- fauna quest IDs,

pozostają w **199**.

---

## Poza zakresem

- time-skip semantics — **196**,
- resource deposit continuity — **198**,
- ItemInstance transfer — **199**,
- quest giver / fauna quest identity — **199**,
- starvation/dehydration persistence — **200**,
- pełny save/load system NPC,
- multiplayer persistence,
- globalny Entity/State Manager,
- generalny event bus,
- przebudowa AI NPC,
- pełny off-screen simulation system.

---

## Weryfikacja

### Testy

Dodać lub rozszerzyć testy dla:

- initial NPC state creation,
- hydration istniejącego NPC,
- state mutation,
- agent dispose/recreate,
- settlement unload/load,
- `WorldBundle` rebuild,
- NPC death,
- dead NPC reconstruction,
- death consequences,
- Household continuity.

Kluczowe scenariusze:

```text
NPC
 ↓
modify state
 ↓
dispose agent
 ↓
recreate agent
 ↓
same entity + same state
```

oraz:

```text
NPC alive
 ↓
die()
 ↓
unload/rebuild
 ↓
NPC remains dead
```

---

### Browser verification

Zweryfikować rzeczywisty gameplay:

1. wybrać/obserwować konkretnego NPC,
2. doprowadzić do zauważalnej zmiany jego state,
3. wymusić settlement unload,
4. wrócić do settlementu,
5. potwierdzić continuity,
6. doprowadzić NPC do śmierci,
7. opuścić settlement,
8. wykonać rebuild/streaming,
9. wrócić,
10. potwierdzić, że NPC pozostaje martwy,
11. potwierdzić spójność Household i settlement population.

---

## Kryteria akceptacji

- [ ] Identity NPC jest niezależna od lifetime `NpcAgent`.
- [ ] Authoritative NPC state ma jasno określonego ownera.
- [ ] `NpcAgent` może zostać zniszczony i odtworzony bez resetowania entity state.
- [ ] Settlement unload/load zachowuje NPC state.
- [ ] `WorldBundle` rebuild zachowuje NPC state.
- [ ] Śmierć NPC jest authoritative lifecycle transition.
- [ ] Martwy NPC nie może zostać odtworzony jako żywy.
- [ ] Death consequences są zastosowane do odpowiednich domen.
- [ ] Household continuity zostaje naprawione bez tworzenia ogólnego persistence frameworka.
- [ ] Lifecycle nie zależy od NPC name ani runtime object reference.
- [ ] Nie powstaje globalny Entity/State Manager ani drugi system persistence.
- [ ] Testy przechodzą.
- [ ] Continuity została zweryfikowana w przeglądarce.

> **Zrób git commit i push do main, rebase jeżeli trzeba**