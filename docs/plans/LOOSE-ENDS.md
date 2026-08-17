# Seedvale — Loose Ends

Krótkie, jednowierszowe notatki o pobocznych blokadach, pomysłach i wątkach
do dokończenia, które pojawiają się podczas implementacji planu, a nie
mieszczą się w jego zakresie. To nie jest issue tracker — gdy wpis dojrzeje
do realnej pracy, przenieś go do `docs/issues/` (nowy plik + wiersz w
`docs/issues/README.md`) i usuń stąd. Wpisy nieaktualne / już nieistotne też
usuwaj — lista ma zostać krótka.

Format: `- [ ] YYYY-MM-DD — opis (plan/plik, jeśli istotne)`

## Wpisy

- [ ] 2026-08-16 — `NpcAgent.getCurrentActivity()` pokazuje ore-deliver leg (`deposit` po `mine`) jako `need: idle` zamiast `work`, bo chain traci informację o rodzicu po promocji `next` → `pendingAction`; kosmetyczny błąd etykiety dialogowej, bez wpływu na gathering/ekonomię (plan `2026-08-16--131--natural-resource-gathering.md`)
- [ ] 2026-08-16 — spawn-point lifecycle (`PreySpawner.state`/`deathsThisCycle`/`disabledAtDay`) nie jest persystowany; reload po `[E] Zniszcz` odradza wypaloną spawn point z powrotem jako `active` (dead reckoning z seeda, tak jak przed planem 125). Zamierzone ograniczenie zakresu L-effortu (plan nie testuje tego w kryteriach akceptacji) — jeśli konsekwencja ma przetrwać reload, potrzebna jest zwarta kolekcja w `SaveData` keyed by `PreySpawner.id` (plan `2026-08-16--125--fauna-spawn-point-population-limits.md`, patrz implementation notes §Persistence)
- [ ] 2026-08-17 — repo ma dwa lockfile'e: `packageManager: pnpm@11.20.0` + `pnpm-lock.yaml`, ale CI robi `npm ci` na `package-lock.json`. Rozjazd już raz wywalił CI na `main` (n8ao 2.0.0 vs 2.0.1); zresynchronizowane, ale rozjedzie się znowu — wybrać jeden menedżer (research `2026-08-17--017--threejs-rendering-audit.md` §4 F8)
