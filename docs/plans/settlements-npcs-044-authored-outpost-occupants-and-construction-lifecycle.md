# Plan: Authored Outpost Occupants & Construction Lifecycle

**Created:** 2026-09-17
**Status:** `draft` 📝
**Priority:** high · **Effort:** L
**Depends on:** world-031
**Domain:** `settlements-npcs`
**Type:** `feature`
**Subdomains:** `household` `schedules` `social`
**Tags:** `outpost` `construction` `npc-identity` `authored-place`
**Roadmap:** `quests-professions-and-world-consequences.md`

## Cel

Pozwolić authored consequence, takiej jak nowy posterunek, stać się realnym funkcjonującym miejscem z persistent NPC i rzeczywistą budową zamiast dekoracyjnym spawnem po zakończeniu questa.

Plan jest draftem. Przed zmianą na `planned` wymaga focused reconu stable NpcId, household injection, Place/settlement ownership, construction targets i persistence.

## Docelowy flow

```text
cleared site
→ authored consequence unlocked
→ construction targets appear
→ builders/workers perform real work
→ outpost completes
→ assigned persistent NPCs remain
→ ordinary schedules/work/threat behavior continue
```

## Zakres draftu

- stable authored NPC identities;
- deterministic creation/injection z reuse istniejących NPC/household conventions;
- persistent assignment do outpost/place;
- real construction targets podczas etapu budowy;
- reuse istniejących work/construction seams;
- transition `construction → active`;
- po aktywacji NPC korzystają z normalnych potrzeb, schedule, combat, work i persistence;
- minimalna kompozycja V1: np. palisada, ognisko/standing torches, mały istniejący shelter/structure, 1-2 NPC.

## Możliwe składy NPC

- dwóch guardów;
- guard + worker/woodcutter;
- inna para wynikająca z konkretnego authored story.

Nie wprowadzać tym planem ogólnego systemu staffing wszystkich outpostów.

## Do rozstrzygnięcia przy dopracowaniu planu

1. Czy outpost jest subtype istniejącego settlement/place czy osobnym world place reprezentowanym przez istniejące prymitywy.
2. Jak stable NPC są tworzeni bez dublowania settlement family/staffing ownership.
3. Jakie istniejące construction targets można bezpośrednio reuse'ować w V1.
4. Jak zapewnić construction progression również po oddaleniu gracza bez budowania nowego schedulera.
5. Jak outpost NPC otrzymują home/work context po aktywacji.

## Guardrails

- brak temporary quest puppets;
- brak `OutpostNpcRegistry`, jeżeli stable NpcId/household/place może być ownerem;
- brak quest-owned construction progress;
- brak teleportowania budowy bez świadomego authored/off-screen contractu;
- brak dużego nowego settlement subtype frameworku tylko dla jednego questa.

## Weryfikacja docelowa

- outpost construction state przetrwa save/load;
- assigned NPC mają te same stable identities po reloadzie;
- real work zwiększa real construction progress;
- po ukończeniu miejsce staje się active;
- NPC pozostają na świecie i wykonują zwykłe zachowania;
- quest completion nie jest ownerem dalszego lifecycle outpostu.

Dla ważnych publicznych/architektonicznych funkcji i typów dodać JSDoc z odpowiednim `@domain`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
