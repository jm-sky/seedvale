# Plan: Missing Merchant systemic investigation

**Created:** 2026-09-18
**Status:** `draft` 📝
**Priority:** high · **Effort:** L
**Depends on:** world-032
**Domain:** `quests-progression`
**Type:** `feature`
**Roadmap:** `quests-travelling-merchant-journeys.md`

## Goal

Missing Merchant quest ma obserwować realnie nieudaną podróż Travelling Merchant i zamieniać istniejące world evidence w systemic quest opportunity.

Nie:

```text
quest starts
→ spawn dead merchant
```

Tylko:

```text
real merchant journey fails
→ evidence persists
→ somebody notices/discovers problem
→ quest opportunity emerges
```

---

## 1. Two valid entry paths

### Discovery-first

```text
Player znajduje corpse/cart/cargo/signet/other evidence
→ identity/failure becomes known
→ investigation opportunity
```

### Missing-arrival-first

```text
expected journey does not arrive / return
→ justified NPC/settlement notices absence
→ investigation opportunity
```

Obie ścieżki mają prowadzić do tego samego underlying failure identity, nie dwóch questów.

---

## 2. Quest source is real failure

Quest musi bindować się do stable failure/journey/merchant identity z `world-032`.

Nie spawnujemy:

- corpse;
- cargo;
- cart;
- signet;
- pack animal;
- killer threat

na potrzeby questa.

---

## 3. Quest giver resolution

Potential givers, zależnie od real context:

- family member;
- home settlement guard;
- another Trader;
- destination settlement representative;
- other NPC with justified social/professional relation.

Resolver ma wybierać z realnych NPC, deterministycznie.

Brak idealnego givera nie może wymuszać fake NPC.

---

## 4. Objective composition

Quest objectives wynikają z dostępnych evidence/facts.

Candidate objectives:

- locate merchant/failure site;
- identify corpse;
- inspect cart/pack/cargo;
- recover signet;
- recover selected cargo;
- determine cause;
- locate responsible predator/den/bandit group if real binding exists;
- eliminate active threat where justified;
- report outcome.

Nie każdy failure musi mieć pełną listę.

---

## 5. Evidence-first objective selection

Przykład:

```text
corpse exists + signet present
→ locate → identify/recover signet → report

corpse gone but cart/cargo remains
→ investigate site → infer identity/cause from remaining evidence → report

predator binding exists
→ optional locate/kill threat objective

cause unknown
→ do not invent culprit
```

---

## 6. Signet recovery

Jeżeli merchant rzeczywiście posiadał `signet_ring` i ring pozostaje recoverable:

- quest używa exact physical item;
- hand-in transferuje ten sam item;
- brak itemu nie jest uzupełniany synthetic tokenem.

Jeżeli signet nie istnieje w danym failure, quest nie może go wymagać.

---

## 7. Cargo recovery

Cargo recovery powinno korzystać z real ownership/world container state.

Nie tworzyć quest-only shipment copy.

Plan ma ustalić podczas reconu, czy objective wymaga:

- recovery konkretnego shipment quantity;
- recovery selected valuable items;
- inspection only.

Nie zmuszać każdego przypadku do pełnego zwrotu cargo.

---

## 8. Threat binding

Jeżeli real failure posiada stable culprit/threat identity i threat nadal istnieje:

quest może dostać systemic revenge/safety branch.

Jeżeli culprit jest już martwy/usunięty:

- objective może auto-resolve z real fact;
- albo zostać pominięty.

Nie spawnujemy nowego wilka/bandyty jako replacement.

---

## 9. Quest opportunity lifecycle

Reuse existing systemic quest opportunity/offer rules:

- no duplicate offers;
- decline/abandon nie cofa world failure;
- failure persists niezależnie od quest state;
- if world problem resolves before acceptance, offer updates/withdraws zgodnie z existing external-resolution semantics.

---

## 10. Reporting and consequences

Report target zależy od giver/context.

Possible outcomes:

- evidence recovered;
- merchant fate confirmed;
- cargo partly/fully recovered;
- threat removed;
- threat unresolved.

Relationship/reputation consequences mają korzystać z existing systems.

Nie inventować nowych social currencies.

---

## 11. Persistence

Persistować quest progress/binding, nie kopiować evidence.

Quest po save/load re-resolveuje world owners po stable IDs.

Nie trzymać transient live references do NPC/animal/cart.

---

## 12. Recon required before planned

Sprawdzić:

- final `world-032` failure/evidence API;
- current quest opportunity binding pattern;
- external resolution / abandonment semantics;
- stable NPC giver selection;
- exact interact/discovery objectives already available;
- exact-item hand-in support;
- relation/reputation reward APIs;
- whether destination/home settlement can notice overdue journey without new polling system;
- how long evidence remains physically discoverable.

---

## 13. Explicit non-goals

Nie implementować:

- merchant failure itself;
- fake road encounter;
- generic detective subsystem;
- universal clues system;
- new relationship store;
- route safety consequence;
- respawning evidence after cleanup merely for quest convenience.

---

## 14. Draft verification direction

Future scenarios:

- player discovers failure first;
- settlement notices missing merchant first;
- both paths bind same quest;
- exact signet hand-in where available;
- missing signet does not soft-lock;
- already-dead culprit does not respawn;
- decline/abandon leaves world consequence intact;
- save/load preserves binding without duplicating evidence/quest.

Manualne/browser gameplay verification wykonuje User.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
