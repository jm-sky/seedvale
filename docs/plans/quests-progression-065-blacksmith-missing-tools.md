# Plan: Blacksmith — Missing Tools

**Created:** 2026-09-17
**Status:** `draft` 📝
**Priority:** medium · **Effort:** M
**Depends on:** none
**Domain:** `quests-progression`
**Type:** `feature`
**Subdomains:** `quests` `rewards`
**Tags:** `blacksmith` `tools` `production` `economy`
**Roadmap:** `quests-professions-and-world-consequences.md`

## Cel

Dodać krótki quest profesyjny Blacksmitha, w którym realna potrzeba narzędzia lub inputu w settlement economy staje się konkretnym zadaniem dla gracza, a wynik trafia do normalnego inventory/stock/work flow.

Plan jest draftem i wymaga focused reconu current Blacksmith production, profession stock, vendor/household inventory oraz konkretnych tool requirements innych profesji.

## Scenariusz

Przykładowe realne potrzeby:

- woodcutter potrzebuje `axe`;
- miner potrzebuje `pickaxe`;
- Farmer potrzebuje `sickle`, `pitchfork` lub `shovel`;
- Blacksmithowi brakuje `iron`, `iron_rod`, `coal` lub `whetstone` potrzebnego do wykonania pracy.

Docelowy flow:

```text
real work/economic need
→ Blacksmith identifies missing input/tool
→ player supplies material or required item
→ normal production / inventory transfer completes
→ worker/household/settlement owns the resulting tool
```

## Zakres draftu

- quest powinien wynikać z konkretnego, możliwego do zweryfikowania stanu świata tam, gdzie current systems go expose'ują;
- preferować existing items i production rules;
- finalny tool/item nie znika w quest completion;
- transfer trafia do realnego NPC personal inventory, Household albo właściwego settlement stocku zgodnie z aktualnym ownership;
- Blacksmith work/production pozostaje ownerem craft/maintenance logic;
- quest może być authored, ale jego material consequence ma być realna.

## Do rozstrzygnięcia przy dopracowaniu planu

1. Który konkretny tool need ma najlepszy existing system seam jako pierwszy vertical slice.
2. Czy current professions faktycznie blokują/ograniczają pracę przy braku danego toola, czy potrzebny jest wcześniej mały domain extension.
3. Gdzie finalny tool powinien być przechowywany: personal inventory, Household czy settlement stock.
4. Czy gracz dostarcza gotowy tool, input do produkcji, czy obie ścieżki są dopuszczalne.
5. Jak quest reaguje, gdy economy/NPC sam rozwiąże shortage przed graczem.
6. Jak nie dublować vendor/trader stock mechanics.

## Guardrails

- brak quest-only `tool_needed` scalar, jeśli można czytać realny state;
- brak fake tool token;
- brak drugiego Blacksmith crafting systemu;
- brak nowego profession inventory tylko dla questa;
- używać istniejących ItemKind, economy i production ownership.

## Weryfikacja docelowa

- quest jest związany z konkretną potrzebą/material shortage;
- supplied input jest rzeczywiście konsumowany/przenoszony przez normalny system;
- resulting tool/item ma realnego ownera po completion;
- NPC/settlement state pozostaje poprawny po save/load;
- quest poprawnie reaguje, gdy potrzeba zostanie rozwiązana inną realną drogą;
- brak regresji Blacksmith production i trade stock.

Dla ważnych publicznych/architektonicznych funkcji i typów dodać JSDoc z odpowiednim `@domain`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
