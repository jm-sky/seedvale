# Implementation Notes: Krajobraz — sosna, poszycie, trzcina, pień, bruk

## Sosny — naturalniejsze preferencje biome

Plan nie powinien traktować sosny jako gatunku przede wszystkim górskiego. Sosny naturalnie występują również w strefach przybrzeżnych, więc `coast` powinien mieć sensowny bias.

Sugerowane preferencje:

- `mountain/highland` → wysoki bias,
- `forest` → średni/wysoki bias,
- `coast` → średni bias, szczególnie na suchszym/piaszczystym terenie za bezpośrednią strefą plaży,
- `swamp` → niski bias.

Nie robić jednak reguły „coast = sosna”. Ostateczny wybór powinien wynikać z połączenia `biome + altitude + moisture + ridge/coast`.

Cel wizualny: nadmorskie sosny są możliwe i naturalne, ale powinny tworzyć sensowne skupiska zamiast pojawiać się losowo na każdej plaży.

## Paprocie — poszycie, nie tylko „paproć przy sośnie”

Obecny pomysł z `forestDensity`, `swamp` i obecnością sosny jest dobry, ale obecność sosny nie powinna być konieczna dla paproci.

Paprocie powinny móc występować również pod lasem liściastym. `pine in radius` traktować jako dodatkowy sygnał zwiększający prawdopodobieństwo, a nie podstawowy warunek.

Preferowana logika:

- wysoka `forestDensity` → możliwe paprocie,
- `swamp` / wilgotny teren → możliwe paprocie,
- sosna w pobliżu → dodatkowy bonus,
- pustynia, droga, treeline i strome stoki → odrzut,
- niska gęstość kandydatów, żeby powstało poszycie zamiast dywanu.

## Bruk — dekoracja osady, nie drugi system dróg

Bruk powinien pozostać bardzo oszczędnym clutterem przy placu/studni. Nie należy rozszerzać tego mechanizmu na `VillagePathPlan` ani tworzyć z niego alternatywnego systemu dróg.

Sugerowane zachowanie:

- `OUTPOST` / `SM` → 0,
- `MD` → 2–4 płyty,
- `LG` → 4–6,
- `XL` → 6–8.

Płyty powinny tworzyć luźny, naturalny fragment utwardzonego miejsca przy studni lub w centrum placu. Unikać regularnej siatki, tapetowania i nachodzenia na studnię/ognisko/wodę.

`pathCorridors` powinny pozostać wykluczone. Bruk ma wzbogacać wygląd większej osady, a nie zastępować istniejącą logikę dróg.

## Ogólna zasada

Te trzy elementy powinny rozszerzać istniejące systemy, a nie tworzyć równoległą logikę krajobrazu:

`biome + terrain + existing vegetation systems → weighted spawn/clutter`

Priorytetem jest naturalny wygląd i zachowanie istniejących mechanizmów chunków, instancingu oraz deterministycznego spawnu.
