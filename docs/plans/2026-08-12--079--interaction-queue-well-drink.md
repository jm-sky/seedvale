# Plan: Interaction queue — well drink (first client)

**Status:** `done`
**Created:** 2026-08-12
**Priority:** 🟡 medium
**Effort:** M
**Depends on:** ~~020~~

## Cel

NPC-e idące po wodę do studni osady ustawiają się w FIFO kolejkę ze slotami pozycji; jednocześnie tylko jedna osoba pije przy studni. Rdzeń jest generyczny (`InteractionQueue`), żeby później podłączyć garden / stoisko / surowce bez przepisywania mechanizmu.

## Stan wyjściowy

`beginNeed('water')` celował w `landmarks.well` (~55%) lub dom (~45%). Wielu NPC wchodziło w ten sam punkt — brak rezerwacji.

## Zakres (zrobione)

1. **`src/simulation/interactionQueue.ts`** — czysta FIFO kolejka: `join` / `leave` / `claimServing` / `releaseServing`, `worldDestination`, `servingCapacity`, overflow slotów.
2. **`createSettlement`** — rejestr `queues` z wpisem `${settlementId}:well`; stabilne `npcId` (`${settlementId}:npc:${i}`).
3. **`NpcAgent`** — drink@well: join → goTo ze slotem → claim serving → execute + SFX; home drink bez kolejki; leave przy complete / fail / dispose / time-skip.
4. Guard/fisher `work` przy well **nie** wchodzi do kolejki picia.

## Poza zakresem

- Podłączenie garden / stockpile / piekarni.
- Pathfinding omijający kolejkę.
- Zmiana `HOME_WATER_CHANCE` / ekonomia wody.

## Done when

- [x] Generyczny `InteractionQueue` + testy jednostkowe.
- [x] Studnia podłączona jako pierwszy klient.
- [x] Picie w domu bez kolejki.
- [ ] Ręczna weryfikacja: linia przy studni, jeden serving, SFX raz na osobę.
