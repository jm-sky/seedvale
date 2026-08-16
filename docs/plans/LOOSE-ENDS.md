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
