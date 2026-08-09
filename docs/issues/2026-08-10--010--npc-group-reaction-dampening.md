# NPC w grupie powinni rzadziej reagować głosowo na gracza

**Status:** `verification needed` — zaimplementowane 2026-08-10: `NpcAgent.update()` przyjmuje teraz `nearbyNpcCount`, reakcja (`Hmm?`/`lookAtPlayer`) jest losowana z szansą zależną od liczby pobliskich NPC i ich `openness` (Big Five). Wymaga weryfikacji w przeglądarce (podejdź do samotnego NPC vs. grupy kilku NPC i porównaj częstość reakcji).
**Created:** 2026-08-10
**Źródło:** zgłoszenie użytkownika

## Objaw / prośba

NPC-e reagują głosowo ("Hmm?", `NpcAgent.ts`'s `lookAtPlayer`/`playReactionSound()`) na zbliżającego się gracza zawsze wtedy, gdy spełniony jest warunek dystansu (`triggerDistance`, z `pausePersonalityParams()`), niezależnie od tego, czy NPC stoi sam, czy w grupie kilku innych NPC. W grupie to się mnoży — kilku NPC "Hmm?"-uje niemal jednocześnie, co czuje się nienaturalnie. Samotny NPC powinien mieć **większą** szansę na reakcję niż ten sam NPC w grupie, a siła tego tłumienia powinna współgrać z jego charakterem (otwartość/`openness`) — bardziej otwarty NPC mniej się przejmuje obecnością innych.

## Diagnoza

`src/ai/NpcAgent.ts`'s `update()` (linia ok. 411-422) sprawdza tylko dystans do gracza:

```ts
if (this.pauseCooldown <= 0 && PAUSE_INTERRUPTIBLE_PHASES.has(this.phase)) {
  if (Math.hypot(dx, dz) < params.triggerDistance) {
    this.phase = 'lookAtPlayer'
    this.playReactionSound()
  }
}
```

Brak jakiejkolwiek zależności od liczby innych NPC w pobliżu. `src/ai/dialogue.ts`'s `pausePersonalityParams(p: BigFivePersonality)` już liczy `triggerDistance`/`lookDurationRange`/`cooldownRange` z `openness`/`extraversion`/`neuroticism` — naturalne miejsce do dodania kolejnego, analogicznego czynnika.

## Naprawa

1. `src/settlement/createSettlement.ts`'s `Settlement.update()` liczy dla każdego NPC, ilu innych NPC z tej samej osady jest w promieniu `GROUP_REACTION_RADIUS` (nowa stała, 6 jednostek) — O(n²), ale n to zwykle kilka-kilkanaście NPC per osada, więc tanie.
2. `NpcAgent.update()` dostaje nowy parametr `nearbyNpcCount: number`. Gdy warunek dystansu jest spełniony, zamiast reagować zawsze, losuje szansę:
   ```ts
   reactionChance = 1 / (1 + GROUP_SUPPRESSION_STRENGTH * nearbyNpcCount * (1 - openness))
   ```
   Samotny NPC (`nearbyNpcCount === 0`) → szansa 1 (zachowanie bez zmian, zgodnie z prośbą "jeżeli jest samotny NPC to jest większa szansa"). Więcej pobliskich NPC → niższa szansa, silniej dla NPC o niskiej otwartości; wysoka otwartość prawie eliminuje tłumienie.
3. Nieudany rzut nie blokuje reakcji na stałe — ustawia krótki `SUPPRESSED_RETRY_COOLDOWN` (1.5s, dużo krótszy niż normalny cooldown po reakcji), więc NPC wciąż może "spróbować ponownie" jeśli gracz zostanie w pobliżu, tylko rzadziej niż co klatkę.

## Poza zakresem teraz

Współdzielenie `nearbyNpcCount` między NPC a zwierzętami gospodarskimi (`AnimalAgent`/`livestock`) — prośba dotyczyła wyłącznie NPC.
