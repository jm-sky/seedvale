# Plan: Hunter Profession and Household

**Created:** 2026-08-20
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** 177 · 188 · 155 · 161 · 162 · 175
**Domain:** settlements-npcs
**Tags:** [fauna, economy, items-player, food]

## Goal

Dodać profesję `hunter` oraz gospodarstwo, którego głównym źródłem utrzymania jest polowanie.

Hunter ma korzystać z istniejących systemów:

- NPC roles / schedule / decisions,
- DecisionPressure + personality/role modifiers,
- NPC Combat,
- fauna i dead-animal lifecycle,
- inventory / item instances,
- household,
- storage,
- cooking / preservation,
- production,
- economy / trading.

Nie tworzyć równoległych systemów dla tych mechanizmów.

Główny cykl:

```text
world / household state
→ pressure
→ hunter decision
→ hunting expedition
→ ranged combat
→ animal death
→ harvest
→ inventory
→ household
→ food / storage / trade
→ production / preparation
→ kolejna wyprawa
```

## 1. Profession `hunter`

Dodać `hunter` do istniejącego modelu `Role` oraz deterministycznej generacji NPC.

Hunter pozostaje normalnym NPC. Profesja wpływa na jego decyzje i główny wkład w gospodarkę, ale nie zastępuje normalnych potrzeb, relacji, odpoczynku ani innych aktywności.

Hunter powinien preferować polowanie, gdy istniejące pressures i stan świata uzasadniają taką decyzję.

Wykorzystać istniejący:

```text
state
→ needs / problems / goals
→ pressures
→ role/personality modifiers
→ decision
```

Nie tworzyć `HunterSystem`, osobnego AI ani osobnego schedulera.

## 2. Hunting expedition

Polowanie jest rzeczywistą aktywnością NPC zajmującą czas świata.

Przed wyprawą Hunter powinien przygotować wymagane wyposażenie i podstawowe zapasy:

- łuk,
- strzały,
- nóż,
- wodę,
- prowiant,
- opatrunek.

Wykorzystać istniejący NPC inventory i mechanizmy potrzeb.

Domyślne preferowane cele:

- zając,
- sarna,
- jeleń,
- dzik.

Jedna wyprawa może zakończyć się pozyskaniem maksymalnie **1–3 zwierząt**.

Hunter może zakończyć wyprawę wcześniej, np. po uzyskaniu wystarczającej zdobyczy albo gdy dalsze polowanie nie jest możliwe.

Nie wymaga to osobnego systemu „expedition AI”; jest to aktywność zbudowana na istniejących mechanizmach NPC.

## 3. Target selection and population protection

Wybór celu wykorzystuje istniejący stan fauny i spawn point population limits.

Jeżeli spawn point posiada dokładnie jedno żywe zwierzę:

- istnieje 50% szans na pominięcie tego celu,
- Hunter powinien spróbować znaleźć alternatywę,
- jeżeli odpowiedniej alternatywy nie ma, wyprawa może zakończyć się bez zabicia zwierzęcia.

Mechanizm ma wykorzystywać istniejący stan populacji, bez tworzenia osobnego systemu ekologicznego.

Target selection nie może wykonywać globalnego skanu całej fauny każdego ticka.

## 4. NPC ranged combat

Hunter korzysta z istniejącego NPC ranged combat z planu 177.

Nie implementować nowego combat systemu.

Hunter powinien:

- używać istniejącego `CombatIntent`,
- używać istniejącego projectile lifecycle,
- używać zwykłych item instances dla łuku i strzał,
- zużywać amunicję zgodnie z istniejącym systemem.

Należy obsłużyć istniejące przypadki przerwania:

- brak amunicji,
- brak/utrata broni,
- nieprawidłowy cel,
- ucieczka celu,
- brak możliwości dotarcia do celu,
- obrażenia / ważniejsza potrzeba NPC.

Po przerwaniu Hunter wraca do normalnego decision flow.

## 5. Animal death and harvest

Po udanym ataku:

```text
ranged combat
→ existing animal death lifecycle
→ dead animal / carcass
→ existing harvesting
→ loot/resources
```

Nie usuwać zwierzęcia bezpośrednio po zabiciu i nie tworzyć osobnego „hunting loot” lifecycle.

Podstawowe rezultaty polowania:

- mięso,
- skóra.

Skóra jest zwykłym itemem/resource i może być przechowywana lub sprzedawana.

Dalsze zastosowania skóry pozostają poza zakresem.

## 6. Hunter inventory and household

Rezultaty polowania trafiają najpierw do istniejącego NPC inventory.

Następnie są dostarczane do household/storage zgodnie z istniejącymi mechanizmami.

```text
animal
→ harvest
→ NPC inventory
→ household/storage
→ consumption / processing / trade
```

Nie tworzyć:

- `HunterInventory`,
- `huntedFood`,
- osobnego household storage dla Huntera.

Gospodarstwo Huntera jest normalnym household i może zawierać NPC o różnych rolach.

## 7. Hunter household

Hunter i jego żona tworzą normalne gospodarstwo domowe.

Dom korzysta z istniejących elementów infrastruktury, w szczególności:

- ogniska,
- rusztu.

Ruszt i gotowanie wykorzystują mechanizmy z planu 175.

Żona pozostaje zwykłym NPC z własnymi potrzebami, decyzjami i aktywnościami.

W ramach gospodarstwa może:

- przygotowywać żywność,
- piec mięso,
- suszyć mięso,
- wykonywać normalne prace gospodarcze,
- korzystać ze wspólnego ogrodu wioski.

Nie tworzyć „Hunter Wife AI” ani prywatnego ogrodu.

## 8. Food processing

Przepływ mięsa:

```text
hunting
  ↓
meat
  ├─→ fresh food
  ├─→ cooking on grate
  ├─→ preservation / drying
  ├─→ household storage
  └─→ surplus → trade
```

Gotowanie korzysta z istniejącego systemu cooking.

Suszenie/preservation korzysta z istniejącego systemu z planu 159.

Nie tworzyć specjalnych mechanizmów gotowania dla gospodarstwa Huntera.

## 9. Bow and arrow production

Gospodarstwo Huntera powinno móc produkować łuki i strzały z istniejących materiałów oraz istniejącego systemu produkcji.

Produkcja ma dwa cele:

1. utrzymanie własnego wyposażenia,
2. sprzedaż nadwyżki.

Gospodarstwo utrzymuje minimalny zapas potrzebny do własnych wypraw.

Produkcja ponad ten poziom tworzy rzeczywistą nadwyżkę handlową.

Wykorzystać istniejące:

- item instances,
- inventory,
- production/crafting,
- storage,
- trading.

Jeżeli któryś element produkcji łuku/strzał nie istnieje, rozszerzyć istniejący system minimalnie zamiast tworzyć Hunter-specific production system.

## 10. Economy and trade

Gospodarstwo może dostarczać do handlu:

- mięso,
- przetworzone/suszone mięso,
- skóry,
- łuki,
- strzały.

Sprzedaż korzysta z istniejącego systemu economy/trading.

Nie tworzyć osobnego systemu handlu dla Huntera.

## 11. Supplies

Na początku gospodarstwo może otrzymać istniejący item `bandage` w ilości:

**5 × bandage**

Hunter może zabierać je na wyprawę.

Nie implementować w tym planie produkcji opatrunków przez żonę, zielarza ani lekarza.

Uzupełnianie zapasów powinno docelowo korzystać z normalnej ekonomii/handlu.

## 12. Schedule and simulation

Hunter korzysta z istniejącego schedule i activity availability.

Nie hard-code'ować pełnego harmonogramu Huntera.

Polowanie powinno działać również:

- bez obecności gracza,
- poza kamerą,
- w normalnej symulacji off-screen.

Nie wprowadzać player-centric warunków wykonywania polowania.

## 13. Performance

Target discovery musi być ograniczone i wykonywane podczas decyzji/aktywności, a nie globalnie co tick.

Nie skanować całej populacji fauny dla każdego Huntera.

Rozwiązanie musi być kompatybilne z istniejącą adaptive/off-screen simulation.

## 14. Diagnostics

Rozszerzyć istniejące diagnostyki NPC tak, aby można było sprawdzić:

- `role = hunter`,
- wybraną pressure/decision,
- cel polowania,
- combat state/intent,
- equipment/ammunition,
- rezultat harvest,
- delivery do household.

Wykorzystać istniejące mechanizmy diagnostyczne.

## 15. Verification

### Automated

Zweryfikować:

- `hunter` jest poprawną wartością `Role`,
- generacja jest deterministyczna,
- istniejące reserved NPC nie zmieniają się,
- Hunter korzysta z istniejącego pressure/decision system,
- ranged combat wykorzystuje istniejący NPC combat,
- ammo/inventory działa poprawnie,
- animal death korzysta z istniejącego lifecycle,
- harvest produkuje prawidłowe itemy/resources,
- rezultat może trafić do household/storage,
- cooking/preservation wykorzystują istniejące mechanizmy,
- production/trade wykorzystują istniejącą ekonomię,
- target selection nie wykonuje nieograniczonego skanu co tick.

### Browser / gameplay

Zweryfikować rzeczywisty cykl:

1. Hunter istnieje jako NPC settlementu.
2. Posiada wymagane wyposażenie.
3. Podejmuje decyzję o polowaniu.
4. Wyrusza na wyprawę.
5. Znajduje prawidłowy cel.
6. Atakuje dystansowo.
7. Zwierzę przechodzi normalny death/carcass lifecycle.
8. Hunter pozyskuje mięso/skórę.
9. Rezultat trafia do household/storage.
10. Żona może wykorzystać mięso przez istniejące cooking/preservation.
11. Nadwyżki mogą wejść do handlu.
12. Łuki/strzały mogą być produkowane i utrzymywane jako własny zapas + nadwyżka.
13. Hunter poprawnie reaguje na brak celu, amunicji lub przerwanie aktywności.
14. Cykl działa również bez udziału gracza.

## 16. Out of scope

- advanced tracking / stealth,
- traps,
- group hunting,
- species-specific hunting skills,
- Hunter skill tree,
- nowy combat system,
- nowy inventory/storage system,
- nowa ekonomia,
- leatherworking,
- dalsze zastosowania skóry,
- produkcja opatrunków,
- zielarz/lekarz,
- prywatny ogród,
- LLM-driven hunting decisions.

## Expected result

Hunter jest zwykłym mieszkańcem Seedvale, którego profesja tworzy rzeczywisty łańcuch ekonomiczny:

```text
fauna
→ hunting decision
→ expedition
→ ranged combat
→ meat / hide
→ household
→ cooking / preservation / storage
→ consumption / trade
```

Jednocześnie gospodarstwo produkuje łuki i strzały, utrzymuje własny zapas wyposażenia i generuje nadwyżkę handlową.

Całość korzysta z istniejących systemów NPC, fauna, inventory, household, production, cooking i economy zamiast tworzyć ich równoległe wersje.

> **Zrób git commit i push do main, rebase jeżeli trzeba**