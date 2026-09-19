# Plan: Dangerous Merchant route and persistent world consequence

**Created:** 2026-09-18
**Status:** `draft` 📝
**Priority:** medium-high · **Effort:** L
**Depends on:** quests-progression-067, world-032, world-031, settlements-npcs-051
**Domain:** `quests-progression`
**Type:** `feature`
**Roadmap:** `quests-travelling-merchant-journeys.md`

## Goal

Realne zagrożenie na merchant route ma móc zostać rozpoznane jako problem świata, prowadzić do systemic quest/work opportunity i — po rozwiązaniu — pozostawić trwałą konsekwencję reprezentowaną przez normalny world state/place.

Target:

```text
real merchant failure / repeated threat
→ route problem becomes known
→ investigation / removal
→ persistent world consequence
→ later journeys observe changed world
```

Nie tworzyć jedynie quest flagi `routeSafe=true`.

---

## 1. Threat must be real

Candidate threats tylko jeśli istnieją w normalnej symulacji:

- predator pack/den;
- bandit group/camp;
- other implemented route hazard.

Nie tworzyć hazardu wyłącznie po to, żeby quest miał przeciwnika.

---

## 2. Trigger / recognition

Plan ma rozstrzygnąć po reconie, co wystarcza do uznania route problem za meaningful:

- ważny pojedynczy failure;
- repeated failures;
- confirmed culprit from Missing Merchant investigation;
- settlement-known evidence.

Nie dodawać globalnego per-frame route-risk scan.

Preferować event/fact-driven recognition.

---

## 3. Route identity

Jeżeli potrzebna jest route identity, ma wynikać z istniejących endpoints/journey facts:

```text
home settlement
↔ destination settlement
```

plus ewentualnie stable corridor/hazard binding.

Nie budować pełnego graph-based trade-route economy w tym planie.

---

## 4. Quest/work opportunity

Opportunity może dotyczyć:

- zlokalizowania threat;
- usunięcia realnego threat;
- potwierdzenia bezpieczeństwa;
- wsparcia budowy persistent safety consequence.

Reuse existing quest/work/world consequence foundations.

---

## 5. Persistent consequence

Possible outputs, tylko jeśli są reprezentowalne przez current world consequence/place systems:

- guard post;
- safe roadside camp;
- road stop;
- small authored outpost;
- other normal persistent place.

Final choice wymaga reconu `world-031` oraz settlement/world placement ownership.

---

## 6. No quest-only safe-road flag

Po rozwiązaniu problemu later systems powinny móc odczytać real consequence:

```text
threat removed
+ persistent place/consequence exists
→ later merchant preparation/route policy may react
```

Nie:

```text
questCompleted = true
→ magic route safety
```

---

## 7. Relationship with route risk

Ten plan nie musi tworzyć pełnego dynamic route-risk modelu.

Jeżeli późniejszy Merchant decision potrzebuje risk input, może derive bounded signal z:

- known unresolved threat;
- historical failure facts;
- persistent safety consequence.

Exact consumer ma wejść przez route-policy seam przygotowany przez `settlements-npcs-051`, bez modyfikowania canonical road geometry ani tworzenia drugiego graphu.

Rozdzielić dwa poziomy:

```text
npc-057
= current observable danger przy konkretnym next destination/road-leg decision

068 consequence/history
= known persistent route problem / known safety improvement
```

Historyczny signal może wpływać na przyszłe przygotowanie/route choice tylko przy nowym journey/leg commitment albo uzasadnionym replanie — nigdy jako per-frame global route-risk scan.

---

## 8. World independence

Threat i consequence istnieją niezależnie od Playera.

Player może pomóc, ale:

- NPC/world może wcześniej odkryć problem;
- threat może zginąć z innych przyczyn;
- consequence nie znika po zamknięciu questa;
- future journeys nie zależą od camera/quest UI.

---

## 9. External resolution

Jeżeli threat zostanie usunięty zanim Player zaakceptuje quest:

- opportunity musi to zauważyć;
- nie respawnować threat;
- ewentualny world-consequence branch może nadal pozostać możliwy, jeśli ma realny sens.

Reuse existing external-resolution quest semantics.

---

## 10. Connection to Missing Merchant

`quests-progression-067` może być jednym źródłem wiedzy o dangerous route, ale nie jedynym możliwym w przyszłości.

Nie kopiować jego quest state.

Consume normal world/failure facts.

---

## 11. Persistence

Persistować:

- normal quest progress/binding;
- normal persistent world consequence through its owner;
- only minimal recognition/history facts if current systems cannot derive them.

Nie kopiować threat entity state do quest save.

---

## 12. Recon required before planned

Przed promocją sprawdzić:

- final `world-032` failure facts;
- implementation/current status `world-031`;
- current authored persistent consequence APIs;
- available predator-den / bandit stable identities;
- quest opportunity external-resolution hooks;
- whether merchant journey code has any route-risk consumer yet;
- suitable placement ownership for guard post/camp/outpost;
- cleanup semantics if threat resolves naturally.

---

## 13. Explicit non-goals

Nie implementować:

- full dynamic trade-route economy;
- global path heatmap;
- universal hazard scoring;
- merchant insurance;
- disposable guards;
- fake bandit/predator spawn;
- generic settlement expansion system;
- magic route-safe boolean as final state.

---

## 14. Draft verification direction

Future scenarios:

- real failure identifies real threat;
- threat already gone → no respawn;
- accepted quest removes actual threat;
- persistent consequence appears once;
- save/load does not duplicate consequence;
- future world can query consequence without quest state;
- abandoning quest does not restore threat or erase consequence;
- no player observation required for persistence.

Manualne/browser gameplay verification wykonuje User.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
