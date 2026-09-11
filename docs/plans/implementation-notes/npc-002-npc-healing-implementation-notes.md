# Implementation Notes: NPC Healing

**Reviewed:** 2026-09-11  
**Plan:** `npc-002-npc-healing.md`  
**Status:** `implementation notes`  
**Source of truth:** current code on `main` + tests/build configuration.

## Follow-up recon — personal treatment ownership

Aktualny kod po wprowadzeniu trwałego `NpcAuthoritativeState.personalInventory` ma nadal historyczną niespójność w healing path:

```text
healing pressure
→ this.carried.findInjuryTreatment(...)

beginHeal()
→ this.carried.findInjuryTreatment(...)
```

Tymczasem personal medicine/bandages są zwykłymi durable belongings NPC i powinny należeć do `personalInventory`; `NpcAgent.carried` pozostaje transient work/logistics cargo.

Przy najbliższej korekcie `npc-002` należy utrzymać jeden spójny contract:

```text
personalInventory
→ shared catalog-driven treatment lookup
→ healing feasibility / pressure
→ beginHeal() revalidation
→ consume exact item from the same authoritative inventory
```

Nie tworzyć osobnego planu ani companion-specific healing branch. Jeżeli istnieje konkretny legacy/work use case dla treatmentu w `carried`, może być jawnie wspieranym dodatkowym źródłem, ale pressure i execution muszą zachowywać source identity i zużyć item z faktycznego ownera.

Najważniejsze regression tests:

- suitable treatment tylko w `personalInventory` daje healing candidate;
- `beginHeal()` zużywa treatment z `personalInventory`;
- item znika między planning i execution → brak heal i brak ghost consumption;
- treatment obecny tylko w unrelated `carried` nie staje się automatycznie personal medicine;
- pressure i execution korzystają z tego samego suitability resolvera z `npc-025`.

## Historical notes

Poniższe ustalenia opisują oryginalny implementation recon `npc-002`; current code pozostaje source of truth. Follow-up ownership correction powyżej ma pierwszeństwo przed historycznymi wzmiankami o `carried health item`.

### Architecture

Healing pozostaje częścią normalnego NPC pipeline:

```text
physicalInjury
→ healing pressure
→ npcDecision arbitration
→ heal action
→ goTo / execute
→ catalog-driven treatment
→ actual HP/injury accounting
```

Nie jest `NeedId`, nie ma osobnego managera/FSM i nie przerywa aktywnego combat automatycznie.

### Current owners

- `src/shared/HealthState.ts` — HP primitive; bez NPC-specific policy.
- `src/settlement/npcState.ts` — authoritative `physicalInjury` i trwały `personalInventory`.
- `src/ai/healingPressure.ts` — pure healing feasibility/pressure.
- `src/ai/npcDecision.ts` — top-level arbitration.
- `src/ai/npcAction.ts` — generic action lifecycle.
- `src/ai/NpcAgent.ts` — thin glue, damage bookkeeping, `beginHeal()`.
- `src/items/Inventory.ts` / `src/items/itemCatalog.ts` — catalog-driven treatment lookup.

### Damage and injury

Accepted physical damage zapisuje `physicalInjury`; healing nie uruchamia się bezpośrednio z damage callbacku. Low HP bez physical injury nie powinno tworzyć healing candidate.

### Treatment execution

Execution musi revalidować:

1. NPC żyje;
2. injury nadal istnieje;
3. current severity/treatment suitability;
4. selected treatment nadal istnieje w tym samym authoritative inventory;
5. HP może zostać przywrócone.

Dopiero wtedy item jest zużywany, `healHealth()` stosowane, a `physicalInjury` zmniejszane o actual restored HP.

### Destination

Healing używa istniejącego action/pathing lifecycle. Historyczny V1 preferował home jako destination; późniejsze generic travel/expedition plans mogą rozszerzyć locality semantics bez tworzenia hospital/CompanionHealing.

### Persistence

`physicalInjury` i `personalInventory` round-tripują przez `NpcAuthoritativeState` / snapshot / `SaveData.npcStates`. Nie dodawać drugiego healing inventory ani treatment snapshotu.

## Verification

Agent implementujący correction:

- uruchamia najmniejszy odpowiedni zestaw testów/typecheck/lint/build zgodnie z `CLAUDE.md`;
- nie uruchamia browser verification;
- nie tworzy nowego healing planu/systemu;
- aktualizuje `docs/state/npc.md`, jeśli finalny ownership contract zmieni obecny opis.

Użytkownik wykonuje manualną weryfikację w przeglądarce.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
