# 037 — Ognisko wioskowe bez równego kawałka terenu

**Status:** `todo`
**Created:** 2026-08-19
**Źródło:** playtest; colliders ([036](./2026-08-19--036--settlement-prop-colliders.md)) tego nie rozwiązują

## Objaw / prośba

Ognisko wioskowe (MD+) stoi na zwykłym heightfieldzie. Brakuje małego, równego pada — ognisko może wisieć na stoku albo wnikać w trawę/dirt o nierównej wysokości.

## Kierunek

Reuse istniejącego flatten/clearing osady (`villageClearing`, pady domów), nie osobnego mechanizmu. Zakres: tylko plac pod `landmarks.campfire`, nie przebudowa całego core dirt.

Nie ruszać collidersa ogniska z [036](./2026-08-19--036--settlement-prop-colliders.md).
