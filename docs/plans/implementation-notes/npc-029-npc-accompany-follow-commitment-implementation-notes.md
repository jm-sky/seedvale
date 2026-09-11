# Implementation Notes: NPC accompany/follow commitment

**Plan:** `npc-029-npc-accompany-follow-commitment.md`  
**Reviewed:** 2026-09-11  
**Status:** `planned` 📋

## Review result

Plan jest architektonicznie spójny z aktualnym NPC stackiem. Najważniejsze zastrzeżenie: `settlements-npcs-019-persistent-and-off-screen-transport` jest nadal `planned`, więc `npc-029` nie powinien implementować własnej pozycji/off-screen travel ani stabilizować API pod założenia z planu 019. Najpierw należy zaimplementować 019, potem podczas preflight `npc-029` zweryfikować jego finalny handoff/checkpoint contract.

Poza tym główne decyzje z planu są poprawne: commitment powinien należeć do `NpcAuthoritativeState`, wykonywanie powinno wracać przez zwykły `NpcAgent` decision/action loop, a follow nie może być osobnym companion AI.

## 1. Ownership: commitment w `NpcAuthoritativeState`

Dodać mały source-neutral typ, np. w nowym `src/ai/npcAccompanyCommitment.ts`, a do `src/settlement/npcState.ts` tylko pole i snapshot.

Minimalny kształt powinien trzymać semantykę, nie execution internals:

```ts
type NpcAccompanyCommitment = {
  target: { kind: 'player' }
  source: AccompanySourceRef
  mode: 'follow' | 'stay'
  stayAnchor?: { x: number, y: number, z: number }
  startedAtDays: number
}
```

`source` powinien pozwolić później odróżnić co najmniej `voluntary` od `work-contract` bez zmiany executorów. Nie zapisywać pathów, bieżącego dystansu, watchdog state, `Phase`, `pendingAction` ani live references.

Snapshot powinien być optional dla backward compatibility. `createNpcAuthoritativeState()` ustawia `null`; `fromSnapshot()` klonuje plain data; `serialize()` zapisuje commitment.

## 2. Nie używać `activePlan`

`activePlan` jest obecnie Goal/Strategy state dla NeedId-driven celów. Nie rozszerzać `NpcPlan` o accompany goal.

Powód praktyczny: `markPlanInterrupted()` i `ensurePlanForNeed()` mają istniejącą semantykę interruption/resume dla potrzeb. Accompany ma przeżyć te przerwania niezależnie. Wspólny lifecycle z `activePlan` spowodowałby konflikt dwóch persistent intents o różnych zasadach wygaszania.

## 3. Najlepszy punkt integracji: idle-duty seam

Aktualne `beginIdle()` najpierw daje szansę `tryPursueWorkContract(scheduledActivity)`, a dopiero potem wykonuje schedule/idle. To jest właściwy poziom dla accompany.

Nie dodawać accompany jako `NpcPressure` ani `NeedId`.

Warto przy okazji wydzielić mały prywatny dispatch zamiast dokładać drugi niezależny `if`:

```text
beginIdle
→ tryPursueIdleDuty
   → accompany commitment
   → work contract
→ schedule / social / profession / idle
```

Dokładna kolejność accompany vs Work Contract powinna być deterministyczna i sprawdzana już na granicy tworzenia commitmentu. Aktywnego accompany i niekompatybilnego Work Contract nie należy arbitrować co tick.

## 4. Interruption działa już przez istniejący NPC lifecycle

Nie potrzeba companion-specific interrupt API.

`resetInFlightAction()` już czyści transient action/path/watchdog state przy combat/flee/collapse/interruption. Accompany commitment ma pozostać nietknięty; po powrocie do `choose()` i dojściu do idle-duty executor ponownie go podejmie.

Uwaga: nie wywoływać `markPlanInterrupted()` specjalnie dla accompany — ta funkcja dotyczy `activePlan` i powinna dalej robić tylko to.

## 5. Follow nie pasuje 1:1 do obecnego `NpcPlannedAction`

`NpcPlannedAction.destination` jest dokumentowany i używany jako snapshot stałego celu. To jest dobre dla home/workplace/landmark, ale słabe dla długotrwałego moving target.

Nie aktualizować `pendingAction.destination` ad hoc z wielu miejsc.

Najmniejsza sensowna zmiana to rozdzielić:

- semantic action: `followPlayer` / accompany executor,
- transient current navigation destination: aktualny snapshot pozycji gracza,
- okresowe retargetowanie tylko gdy gracz przesunął się wystarczająco daleko lub follow hysteresis nadal wymaga ruchu.

Nie trzeba generalizować całego `PlannedAction` na callback destination resolver, jeżeli tylko accompany tego potrzebuje. Lepszy jest wąski branch w `NpcAgent` korzystający z tych samych `steerTo` / watchdog / local A* primitives.

## 6. Hysteresis: wyciągnąć z domeny fauna

`src/fauna/followHysteresis.ts::resolveFollowHysteresis()` jest już właściwym pure primitive.

Przenieść go do neutralnego miejsca, np. `src/shared/followHysteresis.ts`, zachowując API i testy fauny bez zmian semantyki. Nie kopiować funkcji do NPC.

Stan `following` jest transient executor state; nie powinien być częścią persistent commitmentu.

## 7. Stay: anchor należy do commitmentu

Dla `stay` nie przechowywać bieżącej pozycji gracza. Przy zmianie `follow → stay` zapisać world-space anchor raz.

Stay nie powinien blokować reakcji survival/combat. Po takim przerwaniu NPC wraca do anchor, jeśli commitment nadal istnieje.

Po `stay → follow` anchor może zostać wyczyszczony.

## 8. Separation / abandonment

Nie implementować prostego `distance > X => cancel`.

Sugerowany podział:

- local trailing: detailed follow;
- local recovery: zwykłe navigation rescue / repath;
- off-screen separation: generic travel continuity z 019;
- abandonment: jawna reguła lifecycle, nie side effect pathfinding failure.

`isAbandonedDestination()` w `startAction()` dotyczy bieżącego destination/action i nie powinno automatycznie oznaczać zakończenia accompany commitmentu.

Jeżeli 019 nie dostarczy generic travel intent niezależnego od TransportOrder, to jest blocker/kontrakt do poprawienia w 019, a nie powód do tworzenia `CompanionOffscreen*` w 029.

## 9. Return po zakończeniu

Po cancel/end usunąć commitment natychmiast jako źródło intentu. Powrót do home/locality powinien być neutralnym NPC travel intent z mechanizmu 019, jeśli taki istnieje.

Nie trzymać commitmentu w stanie `returning`, jeśli jedynym powodem jest doprowadzenie NPC do domu. Gdy return intent się zakończy, zwykły schedule ponownie przejmuje kontrolę.

Needs/combat muszą móc przerwać return tak samo jak inne ruchy.

## 10. Śmierć i reconstruction

Death powinien wyłączyć executable accompany bez companion-specific corpse state. Najprościej czyścić commitment na alive→dead edge albo traktować `health.dead/postDeath` jako terminal gate i wyczyścić rekord idempotentnie przy lifecycle cleanup.

Reconstruction live `NpcAgent` nie może tworzyć nowego commitmentu ani resetować mode/anchor. Agent tylko czyta istniejący `NpcAuthoritativeState`.

## 11. API potrzebne późniejszym planom

Nie wiązać tworzenia commitmentu bezpośrednio z dialogue/UI.

Dobrze wydzielić małe funkcje lifecycle nad authoritative state, np.:

- `startNpcAccompanyCommitment(...)`
- `setNpcAccompanyMode(...)`
- `endNpcAccompanyCommitment(...)`

Powinny być source-neutral i walidować single-active-commitment. `npc-030` i voluntary join mają korzystać z tego samego API.

Nie dodawać jeszcze personality/relationship/reputation scoring.

## 12. Persistence

Commitment idzie wyłącznie przez istniejący:

```text
NpcAuthoritativeState
→ NpcStateSnapshot
→ SettlementsManager/NpcStateRegistry serialize
→ SaveData.npcStates
```

Nie dodawać top-level save section.

W `src/persistence/saveData.ts` dodać walidację optional pola. Starszy save bez commitmentu = `null`. Save version bump tylko jeśli obecny migration/validator contract rzeczywiście tego wymaga; sam additive optional field nie jest powodem.

## 13. Debug / trace

Rozszerzyć istniejący NPC trace/debug line zamiast nowego UI.

Wystarczy widzieć:

- active commitment source,
- `follow|stay`,
- execution: detailed/off-screen/recovering jeśli 019 to udostępnia,
- terminal/end reason w trace eventach.

Nie persistować debug state.

## 14. Najważniejsze testy

Najwyższą wartość mają boundary tests:

- snapshot/restore commitmentu przez `NpcStateRegistry`;
- `follow ↔ stay` bez tworzenia nowego commitmentu;
- critical need / combat resetuje action, ale nie commitment;
- po kolejnym `choose()` accompany executor wraca;
- ordinary NPC bez commitmentu zachowuje obecne `beginIdle()` semantics;
- Work Contract conflict jest odrzucany na creation/acceptance boundary;
- fauna Follow/Lead zachowuje zachowanie po przeniesieniu hysteresis;
- death cleanup jest idempotentny;
- po 019: detailed ↔ off-screen ownership dokładnie raz, bez resetu do home spawn i bez teleport catch-up.

## 15. Zalecana kolejność implementacji

```text
1. Zaimplementować settlements-npcs-019 i sprawdzić jego finalne travel/handoff API.
2. Dodać pure commitment type + lifecycle helpers.
3. Dodać NpcAuthoritativeState snapshot/restore/save validation.
4. Przenieść followHysteresis do shared i zachować fauna regressions.
5. Dodać idle-duty dispatch + detailed follow/stay executor.
6. Podpiąć interruption/resume przez istniejący choose lifecycle.
7. Podpiąć separation/off-screen/return do API z 019.
8. Dodać trace/debug i boundary tests.
```

## 16. Najważniejsze pliki

- `src/settlement/npcState.ts`
- `src/ai/NpcAgent.ts`
- `src/ai/npcAction.ts`
- `src/fauna/followHysteresis.ts` → neutral shared location
- `src/navigation/navigation.ts`
- `src/settlement/SettlementsManager.ts`
- `src/settlement/createSettlement.ts`
- `src/persistence/saveData.ts`
- finalne travel/handoff files dodane przez `settlements-npcs-019`

Po implementacji zaktualizować `docs/state/npc.md` i `docs/state/persistence.md` o rzeczywisty commitment/travel contract. Dodać JSDoc `@domain npc` do publicznego lifecycle API commitmentu i ewentualnego shared executor seam.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
