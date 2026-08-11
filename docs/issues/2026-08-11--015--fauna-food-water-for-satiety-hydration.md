# Fauna: źródła jedzenia i wody dla sytości / nawodnienia

**Status:** `todo`  
**Created:** 2026-08-11  
**Źródło:** obserwacja po paskach statusu nad zwierzętami (HP / stamina / sytość / nawodnienie)

## Kontekst

`AnimalLifeState` ma `hunger` i `thirst` (`0…1`, rosną z czasem). Nad głową zwierzęcia pokazywane są paski:

- **sytość** = `1 - hunger`
- **nawodnienie** = `1 - thirst`

Dziś jedyny mechanizm obniżający potrzeby to abstrakcyjny `relieveElevatedNeeds()` przy dojściu do celu wander — flat relief, bez realnego jedzenia/wody w świecie. Bez właściwych źródeł paski sytości i nawodnienia w praktyce głównie **maleją** (albo lekko odbijają przy wanderze), a nie rosną w wiarygodny sposób.

## Pożądany kierunek

Zwierzęta muszą mieć **co jeść i pić**, żeby wskaźniki sytości / nawodnienia mogły rosnąć:

- jedzenie (np. flora / dropy / habitat-specific forage),
- woda (np. brzeg jeziora / rzeki / oceanu — z regułami dostępności),
- decyzja AI / wander bias, która celuje w te źródła, gdy need jest elevated (dziś jest tylko szerszy wander).

To uzupełnia plan 021 (Animal Life) i obecne UI pasków; nie jest bugiem UI.

## Poza zakresem tej notatki

- Zmiana semantyki pasków (zostaje sytość / nawodnienie).
- NPC needs food/water (osobny tor Needs).
- Pełny ecosystem / farming.
