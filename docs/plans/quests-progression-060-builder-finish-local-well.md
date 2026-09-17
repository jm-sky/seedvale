# Plan: Builder — Finish the Local Well

**Created:** 2026-09-17
**Status:** `draft` 📝
**Priority:** high · **Effort:** M
**Depends on:** settlements-npcs-043
**Domain:** `quests-progression`
**Type:** `feature`
**Subdomains:** `quests` `progression`
**Tags:** `builder` `well` `construction` `settlement`
**Roadmap:** `quests-professions-and-world-consequences.md`

## Cel

Dodać krótki quest profesyjny Buildera dotyczący dokończenia istniejącej, fizycznej studni przy polu, ogrodzie lub innym lokalnym miejscu pracy.

Po ukończeniu studnia ma wejść do normalnego world/water flow i realnie skrócić trasę po wodę, szczególnie dla Farmer NPC po `settlements-npcs-043`.

Plan jest draftem i wymaga focused reconu quest materialization, existing well construction, Builder identity oraz placementu unfinished well w non-home settlement.

## Scenariusz

```text
unfinished local well
→ workers/Farmers use farther water source
→ Builder asks for help
→ player supplies materials and/or contributes work
→ well construction completes
→ normal WaterSource becomes available
```

## Zakres draftu

- quest targetuje realny well construction record;
- niedokończona studnia istnieje przed quest completion i nie jest fake quest propem;
- giver to stabilny Builder / odpowiedni authored NPC;
- wykorzystać istniejące construction stages, requirements i work contribution;
- gracz może dostarczać materiały i/lub wykonywać część pracy;
- NPC mogą dalej pracować przy tym samym targetcie, jeśli current work seams to wspierają;
- completion wynika z realnego ukończenia studni, nie z osobnej quest flag;
- po ukończeniu studnia jest normalnym usable water source.

## Do rozstrzygnięcia przy dopracowaniu planu

1. Jak unfinished well jest deterministicznie materializowana w wybranej osadzie i jak nie koliduje z settlement generation.
2. Czy quest ma wymagać material hand-in, bezpośredniej construction contribution czy obu.
3. Jak wybrać settlement/garden/field, aby lokalna studnia miała rzeczywisty sens przestrzenny.
4. Jak quest reaguje, jeśli NPC sam dokończy studnię przed graczem.
5. Jakie rewards/reputation/relation są właściwe dla krótkiego profession questu.

## Guardrails

- brak quest-only studni;
- brak ręcznego ustawiania `completed` bez normalnego construction domain;
- brak specjalnego watering bonusu z questa;
- brak dodatkowego WaterSource systemu;
- completion ma śledzić authoritative world state.

## Weryfikacja docelowa

- unfinished well istnieje i jest widoczna przed ukończeniem;
- quest poprawnie wiąże się z jej stable identity;
- realna construction work kończy studnię;
- quest kończy się przy realnym completion;
- studnia działa jak zwykłe źródło wody;
- Farmer może później preferować tę bliższą studnię;
- save/load nie rozdziela quest state i well state.

Dla ważnych publicznych/architektonicznych funkcji i typów dodać JSDoc z odpowiednim `@domain`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
