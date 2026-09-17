# Plan: Builder — Repair or Complete the Palisade

**Created:** 2026-09-17
**Status:** `draft` 📝
**Priority:** medium · **Effort:** M
**Depends on:** none
**Domain:** `quests-progression`
**Type:** `feature`
**Subdomains:** `quests` `progression`
**Tags:** `builder` `palisade` `construction` `repair`
**Roadmap:** `quests-professions-and-world-consequences.md`

## Cel

Dodać krótki quest profesyjny Buildera związany z realnym uszkodzonym albo niedokończonym fragmentem palisady osady.

Plan jest draftem i wymaga reconu aktualnego palisade construction/repair ownership, structure condition oraz quest binding do konkretnego segmentu.

## Scenariusz

```text
unfinished/damaged palisade
→ Builder requests help
→ player brings materials and/or contributes work
→ real segment completes/repairs
→ persistent physical consequence remains
```

## Zakres draftu

- quest targetuje istniejący realny palisade/structure record;
- reuse obecnego construction/repair session i material requirements;
- możliwość współpracy z NPC, jeżeli existing work seams na to pozwalają;
- completion oparty o authoritative structure state;
- efekt pozostaje w świecie po zakończeniu questa;
- brak konieczności dodawania settlement-defense score w V1.

## Do rozstrzygnięcia przy dopracowaniu planu

1. Czy lepszym V1 jest damaged existing segment czy intentionally unfinished segment.
2. Jak stable structure ID jest expose'owane do quest objective.
3. Czy istniejący `SettlementsManager.listRepairProblems` / structure registry wystarcza bez nowej reprezentacji.
4. Co dzieje się, gdy repair zostanie wykonany przez NPC lub inny mechanizm przed graczem.
5. Jakie reward/relation/reputation consequence pasują do krótkiego profession questu.

## Guardrails

- brak quest-only palisade state;
- brak osobnego repair systemu;
- brak literalnych kosztów materiałów, jeśli istniejący domain już je definiuje;
- quest obserwuje domain state zamiast go dublować.

## Weryfikacja docelowa

- konkretna palisada ma rozpoznawalny problem;
- quest wiąże się z właściwym segmentem;
- normalna praca/repair zmienia strukturę;
- quest reaguje na realne completion;
- repair pozostaje po save/load;
- brak regresji zwykłej budowy/napraw palisad.

Dla ważnych publicznych/architektonicznych funkcji i typów dodać JSDoc z odpowiednim `@domain`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
