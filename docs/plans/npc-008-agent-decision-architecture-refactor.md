# Plan: Agent Decision Architecture Refactor

**Created:** 2026-09-01
**Status:** `in progress` 🔄 — etap 1 (recon + projekt implementacji) zrobiony
**Priority:** high · **Effort:** L
**Depends on:** none
**Domain:** `npc`
**Subdomains:** `decision-making` `fauna`
**Tags:** `AnimalAgent` `NPCAgent` `DecisionContext` `scoring`

> Implementation notes: [`npc-008-agent-decision-architecture-refactor-implementation-notes.md`](./implementation-notes/npc-008-agent-decision-architecture-refactor-implementation-notes.md)
> — recon obecnego decision flow (tabela priorytetów, hard gates, throttling, findings F1–F6)
> oraz projekt kroków 2–4. Zacznij od niego, nie od ponownego czytania `AnimalAgent.ts`.
>
> Consider review: `docs/research/2026-09-01-npc-animal-threat-forwarding.md`

## Cel

Uporządkować warstwę podejmowania decyzji agentów, przede wszystkim `AnimalAgent`, tak aby priorytety zachowań nie były zakodowane głównie jako kolejność rozbudowanego drzewa `if / else if`.

Refaktor ma wykorzystać istniejące mechanizmy Seedvale — `DecisionContext`, kandydatów, scoring i `pickHighestScore` / `pickActionKind` — zamiast tworzyć równoległy system AI.

Docelowy kierunek:

```
hard gates / overrides
        ↓
perception / DecisionContext
        ↓
candidate generation
        ↓
validity filtering
        ↓
scoring / ranking
        ↓
best decision
        ↓
intent / phase transition
        ↓
existing execution
```

Pierwsza migracja musi zachować dotychczasową semantykę gameplayu. Refaktor nie jest zmianą zachowania agentów.

## Zakres

### AnimalAgent

Przekształcić centralną arbitrażę zachowań w jawny mechanizm decyzji:

- wydzielić kontekst decyzji od wykonania decyzji,
- wydzielić generowanie kandydatów,
- jawnie reprezentować priorytety istniejących zachowań,
- zachować hard overrides, które nie są właściwymi kandydatami,
- zachować istniejące throttling/cache decyzji,
- zachować `intent`, movement i combat execution,
- zachować caller-side bounded NPC threat inputs,
- zachować rabid/frenzy semantics,
- zachować kolejność i znaczenie istniejących priorytetów w pierwszym etapie.

Szczególną uwagę poświęcić interakcjom:

- player threat,
- NPC threat,
- fire avoidance,
- frenzy strategic village,
- predator/prey behaviour,
- rabid override.

### NPCAgent

Nie przepisywać istniejącej FSM.

Zidentyfikować i wydzielić jedynie te elementy decyzji, które korzystają z tego samego wzorca co fauna. Istniejący:

```
needs → pressures → candidates → personality/role scoring → selection
```

powinien zostać wykorzystany i ewentualnie uporządkowany, a nie zastąpiony.

Pozostawić phase state machine (`choose`, `goTo`, `execute`, `combat`, `sleep`, itd.) jako warstwę wykonawczą/lifecycle.

### Wspólne mechanizmy

Jeżeli recon implementacyjny potwierdzi rzeczywistą potrzebę, wyodrębnić małe, reusable primitives dla:

- decision candidate,
- decision context,
- scoring,
- selection.

Nie tworzyć uniwersalnego `AgentAIManager`, `BehaviourManager` ani analogicznej warstwy God Object.

## Hard gates vs decyzje

Nie wszystko powinno być rankingowane.

Hard gates / lifecycle overrides pozostają poza rankingiem, jeżeli ich semantyka tego wymaga, np.:

- dead/corpse,
- mounted,
- frozen,
- rabid,
- inne bezwarunkowe lifecycle overrides znalezione w reconie.

Interrupts powinny pozostać osobną warstwą, jeżeli są reaktywne i mają pierwszeństwo przed normalnym wyborem decyzji.

Ranking ma odpowiadać na pytanie:

> Co agent powinien teraz robić?

Nie:

> W jakim stanie wykonawczym znajduje się agent?

## Ograniczenia architektoniczne

- Repository jest source of truth.
- Najpierw reuse istniejących mechanizmów.
- Nie tworzyć równoległego systemu decyzji dla NPC i fauna bez uzasadnienia.
- Nie łączyć decision layer z execution/state machine.
- Nie wykonywać szerokiego rewrite'u `AnimalAgent.ts` tylko w celu zmniejszenia liczby linii.
- Nie zmieniać modelu symulacji ani ownership stanu bez potrzeby.
- Nie wykonywać niepowiązanych refaktorów.
- Zachować bounded/local perception i brak globalnych skanów agentów.
- Zachować throttling decyzji oraz rozdział sensing per tick od ponownego wyboru decyzji.
- Zachować deterministyczne części scoringu i istniejącą semantykę randomness.
- Dodać JSDoc dla ważnych nowych architektonicznych/public functions/classes, używając `@domain` tam, gdzie pomaga to preflight discovery.

## Strategia migracji

Refaktor powinien być inkrementalny:

1. Udokumentować istniejący decision flow i jego priorytety w kodzie/testach.
2. Wydzielić z `AnimalAgent.update()` kontekst i arbitraż decyzji bez zmiany zachowania.
3. Przenieść istniejące gałęzie do candidate generation/scoring/selection.
4. Zachować istniejące execution methods i lifecycle/bookkeeping.
5. Zweryfikować interakcje predator/prey, player, NPC, fire, frenzy i rabid.
6. Dopiero po stabilizacji ocenić, czy część decyzji `NPCAgent` powinna korzystać z tych samych małych primitives.
7. Nie wprowadzać nowych gameplayowych priorytetów w ramach kroków 2-5.

## Follow-up: ogólne zagrożenie animals ↔ NPC

Recon (F1) pokazał, że `npcThreat` w `AnimalAgent.update()` jest bramkowane przez `frenzied`, przez co gałąź `npc-attack`/`npc-ignore`/`npc-flee` i `decideNpcResponse()` są martwym kodem.

Decyzja (2026-09-02): to jest za wąskie. Zagrożenie i walka animals ↔ NPC mają być zachowaniem ogólnym, a `frenzy` jest mechanizmem wymuszania combatu (testy) i overridem, który pomija scoring — nie warunkiem zauważania NPC.

Zakres i konsekwencje: implementation notes §5.6 (krok 6 w kolejności z §5.4 — nie mylić z punktem 6 listy powyżej, który dotyczy `NPCAgent`). Wykonać **po** krokach 2-5, osobnym commitem, bo to pierwsza realna zmiana zachowania w tym wątku — parytet jest jedynym sposobem weryfikacji samego refaktoru (F6). Jeżeli kierunek urośnie poza zmianę bramki + strojenie, zakłada się osobny plan `npc-018`.

## Weryfikacja

- Istniejące testy przechodzą.
- Dodać testy decyzji/priorytetów tam, gdzie obecna semantyka nie jest wystarczająco zabezpieczona.
- Zweryfikować, że dla tych samych wejść pierwszy refaktor wybiera te same zachowania co obecny kod.
- Zweryfikować cooldowny/throttling i cached decisions.
- Zweryfikować hard overrides i interrupts.
- Zweryfikować combat, frenzy, rabid oraz player/NPC threat.
- Zweryfikować brak globalnych skanów i zachowanie bounded candidate lists.
- Zweryfikować build/typecheck/lint zgodnie z istniejącym repo workflow.

## Non-goals

- Projektowanie nowego systemu osobowości.
- Zmiana gameplayowego balansu agresji/strachu.
- Dodawanie nowych zachowań zwierząt lub NPC.
- Przepisywanie całej FSM NPC.
- Wprowadzanie LLM do decyzji.
- Generalny refaktor całego `AnimalAgent.ts` lub `NPCAgent.ts`.
- Zmiana symulacji off-screen/hybrid simulation.

## Kryterium sukcesu

Po refaktorze priorytety decyzji są jawne, testowalne i możliwe do rozszerzania bez dokładania kolejnych warstw do centralnego `if / else if`, przy zachowaniu istniejącego gameplayu i wydajności.

**Zrób git commit i push do main, rebase jeżeli trzeba**
