# Plan: Horse acquisition through merchant purchase and quest reward

**Created:** 2026-09-08
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** fauna-020
**Domain:** `quests-progression`
**Subdomains:** `quests` `rewards`
**Tags:** `horse` `merchant` `ownership` `wolves`

## Cel

Dodać dwa spójne sposoby zdobycia konia przez gracza:

1. zakup istniejącego konia od handlarza,
2. otrzymanie tego samego persistent zwierzęcia jako nagrody za rozwiązanie realnego problemu z wilkami.

Oba flow mają korzystać z ownership-transfer contract dostarczonego przez `fauna-020`.

Koń nie jest `ItemKind`, quest-only reward ani obiektem tworzonym po sukcesie. Jest konkretnym persistent `AnimalAgent`, który fizycznie istnieje w świecie przed acquisition i zachowuje tę samą identity po transferze do gracza.

Docelowy lifecycle:

```text
                 ┌─ purchase ───────────────→ player-owned
available horse ─┤
                 └─ accept wolf quest
                         ↓
                      reserved
                         ↓
                  resolve real threat
                         ↓
                 ownership transfer
                         ↓
                    player-owned
```

Nie tworzyć `HorseItem`, `PlayerHorse`, osobnego questowego horse spawnu ani drugiego ownership path.

## 1. Existing horse as acquisition target

Obecny merchant wagon posiada już prawdziwego konia tworzonego przez istniejący fauna/livestock pipeline.

Wykorzystać realne persistent zwierzę jako podstawowy acquisition target zamiast tworzyć nową reprezentację konia dla handlu lub questa.

Plan nie powinien jednak uzależniać authored quest logic od technicznego ID w rodzaju `merchant-horse-<settlementId>`. Scenariusz powinien przechowywać stable identity konkretnego konia wybranego jako acquisition target i operować na tej identity.

Przed acquisition koń:

- istnieje w świecie,
- ma normalny health/hunger/thirst/stamina,
- może umrzeć lub stać się niedostępny,
- nie należy do gracza.

Po acquisition ten sam animal staje się player-owned przez `fauna-020`.

## 2. Shared ownership transfer

Zakup i quest reward muszą kończyć się tą samą domenową operacją ownership transfer.

Merchant i QuestManager decydują **dlaczego** ownership ma się zmienić. Fauna pozostaje właścicielem **jak** ownership konkretnego zwierzęcia jest zmieniany i utrwalany.

```text
merchant / authored quest outcome
→ request transfer of specific animal identity
→ fauna ownership transfer
→ same AnimalAgent becomes player-owned
```

Nie mutować ownership bezpośrednio z UI, merchant stock ani QuestManager.

## 3. Acquisition state and reservation

Dla konkretnego acquisition target potrzebny jest jednoznaczny lifecycle:

```text
available
reserved
transferred
unavailable
```

Znaczenie:

- `available` — może zostać kupiony albo stać się nagrodą questa,
- `reserved` — quest został przyjęty i koń nie może być już sprzedany,
- `transferred` — ownership został skutecznie przeniesiony do gracza,
- `unavailable` — zwierzę nie istnieje / umarło / nie może już zostać przekazane.

Rezerwacja nie zmienia ownership. Koń nadal pozostaje fizycznie przy dotychczasowym właścicielu do momentu faktycznego reward outcome.

Stan musi przetrwać save/load.

## 4. Merchant purchase

Rozszerzyć istniejący merchant flow o możliwość zakupu konkretnego konia, bez dodawania konia do `ItemKind` ani `MERCHANT_STOCK`.

To ma być mały special/world-entity offer korzystający z istniejących merchant payment semantics, a nie początek generycznego marketplace dla wszystkich encji świata.

Minimalny flow:

```text
acquisition target is available
→ merchant exposes horse offer
→ player sees premium price
→ payment validated
→ ownership transfer succeeds
→ acquisition state becomes transferred
→ offer disappears
```

Cena powinna być deklaratywna i stanowić zakup premium: wyraźnie droższy od zwykłych dóbr, tak aby quest był atrakcyjną alternatywą, ale nadal osiągalny w aktualnej ekonomii.

## 5. Atomic purchase

Zakup musi mieć semantycznie atomowy rezultat.

Sukces oznacza jednocześnie:

```text
coins deducted
AND
ownership transferred
AND
acquisition marked transferred
```

Failure oznacza:

```text
coins unchanged
AND
ownership unchanged
AND
acquisition remains available
```

Nie może wystąpić częściowy stan, w którym gracz płaci bez otrzymania konia albo ownership zmienia się bez skutecznej płatności.

Ponowne wykonanie tej samej transakcji dla `transferred`, `reserved` lub `unavailable` targetu musi być niemożliwe.

## 6. Wolf quest alternative

Dodać authored quest, w którym handlarz / właściciel konia ma rzeczywisty problem z lokalnym zagrożeniem ze strony wilków.

Założenie:

```text
wolf pressure threatens transport / horses / local safety
→ merchant asks player for help
→ player resolves real world problem
→ reserved horse is transferred as reward
```

Quest nie powinien sprowadzać się do abstrakcyjnego `kill N wolves`, jeśli aktualny world/fauna state pozwala sprawdzić rzeczywiste rozwiązanie problemu.

Preferować wykorzystanie istniejącego persistent fauna/world state, np. konkretnej grupy, den/location albo innego realnego threat state dostępnego w aktualnym kodzie.

Quest obserwuje i interpretuje świat; nie jest właścicielem osobnego wolf simulation.

## 7. Quest acceptance reserves the horse

Przyjęcie wariantu questa obiecującego konia musi atomowo zarezerwować acquisition target.

```text
available
→ quest accepted
→ reserved
```

Od tego momentu:

- merchant nie oferuje już zakupu tego konia,
- save/load nie może przywrócić horse offer,
- ownership nadal pozostaje bez zmian,
- koń nadal jest normalnym zwierzęciem świata.

Jeżeli gracz kupił konia wcześniej, horse-reward variant nie może zostać później uruchomiony dla tego samego targetu.

Sam problem z wilkami może nadal istnieć niezależnie, ale ten plan nie wymaga fallback reward ani alternatywnego wariantu nagrody po wcześniejszym zakupie konia.

## 8. Quest objective and completion

Minimalny przebieg:

```text
merchant communicates real wolf problem
→ player accepts horse-reward quest
→ horse becomes reserved
→ player resolves relevant world threat
→ quest verifies world outcome
→ reward outcome executes once
→ ownership transfer
```

Completion powinno wynikać z rzeczywistego state świata dostępnego w momencie implementacji.

Nie tworzyć quest-only kill countera, jeśli aktualne mechanizmy potrafią jednoznacznie rozpoznać, że konkretne zagrożenie zostało usunięte.

Nie przebudowywać systemu wilków tylko dla tego questa.

## 9. Reward semantics

Horse reward ma korzystać z istniejącego authored quest outcome/reward/consequence exact-once path.

Reward reprezentuje semantycznie:

```text
transfer ownership of reserved animal identity to player
```

a nie:

```text
spawn horse
```

Po sukcesie:

- target staje się `transferred`,
- ten sam animalId pozostaje w świecie,
- current life state nie jest resetowany,
- pozycja nie jest teleportowana,
- `Follow` przechodzi do domyślnego zachowania zgodnie z `fauna-020`,
- istniejący riding działa przez normalny player-owned animal contract.

## 10. Death and unavailable target

Śmierć konia jest realną persistent consequence i nie może być automatycznie cofana przez merchant ani quest system.

Jeżeli koń umrze przed purchase:

- oferta zakupu znika,
- acquisition target staje się `unavailable`.

Jeżeli koń umrze po przyjęciu questa, ale przed reward transfer:

```text
reserved
→ horse dies
→ unavailable
```

Quest nie może wskrzesić zwierzęcia, stworzyć replacement horse ani zduplikować reward.

Quest powinien zakończyć się lub przejść do sensownego failure/unavailable outcome zgodnego z istniejącym authored quest contract, bez obowiązku przyznawania nagrody zastępczej.

## 11. Persistence and duplicate prevention

Save/load oraz settlement unload/reload muszą zachować spójność acquisition targetu.

Po transferze lub rezerwacji nie może zostać ponownie wystawiony świeży merchant horse pełniący tę samą rolę tylko dlatego, że settlement został odtworzony.

Kluczowe invarianty:

- jeden persistent target może zostać acquired najwyżej raz,
- `reserved` przetrwa reload,
- `transferred` przetrwa reload,
- merchant offer nie odradza się po reservation/transfer,
- quest reward nie wykonuje się drugi raz,
- settlement spawn logic respektuje ownership/spawn suppression z `fauna-020`,
- nie istnieje jednocześnie player-owned original i świeży replacement merchant horse.

## 12. Dialogue and UI feedback

Merchant dialogue/UI powinny odzwierciedlać authoritative acquisition + quest state zamiast utrzymywać niezależne UI booleans.

Potrzebne stany feedbacku obejmują:

- horse available for purchase,
- insufficient coins,
- wolf problem / quest available,
- horse reserved as quest reward,
- horse already transferred,
- horse unavailable/dead.

Nie tworzyć osobnego horse management screen.

## Testy

Dodać testy kluczowych invariantów:

- merchant horse acquisition target wskazuje istniejącego `AnimalAgent`, nie `ItemKind`,
- purchase targetuje stable animal identity,
- brak środków nie zmienia coins, ownership ani acquisition state,
- successful purchase pobiera cenę i przenosi ownership tego samego animal,
- purchase nie tworzy nowego horse,
- drugi purchase jest niemożliwy,
- quest acceptance przełącza `available → reserved`,
- reserved horse znika z merchant offer,
- save/load zachowuje reservation,
- reserved horse nie może zostać kupiony,
- quest completion wynika z rzeczywistego world state,
- reward używa ownership transfer zamiast spawn,
- reward wykonuje się exact-once,
- reward zachowuje ten sam animalId i current life state,
- wcześniejszy purchase uniemożliwia horse-reward reservation dla tego samego targetu,
- quest reward uniemożliwia późniejszą sprzedaż tego samego targetu,
- death przed purchase powoduje unavailable i usuwa offer,
- death podczas reservation uniemożliwia reward transfer bez respawnu,
- settlement reload nie tworzy duplicate/replacement horse po reservation ani transferze.

## Manual verification

Użytkownik sprawdza w przeglądarce:

1. Konkretny koń fizycznie istnieje przy handlarzu przed acquisition.
2. Można go kupić, jeśli acquisition state jest `available`.
3. Bez wystarczających monet purchase nie zmienia świata.
4. Successful purchase przenosi ownership tego samego konia.
5. Koń zaczyna działać jako player-owned animal i może Follow/riding przez istniejące systemy.
6. Alternatywnie można przyjąć wolf quest przed zakupem.
7. Po przyjęciu questa koń nadal stoi w świecie, ale nie jest już na sprzedaż.
8. Rozwiązanie realnego wolf threat progresuje quest.
9. Reward przenosi istniejącego zarezerwowanego konia zamiast tworzyć nowy spawn.
10. Save/load zachowuje reservation i acquisition result.
11. Settlement reload nie tworzy drugiego horse.
12. Śmierć konia przed purchase usuwa możliwość zakupu.
13. Śmierć zarezerwowanego konia przed reward jest respektowana i nie powoduje respawnu.

## Non-goals

Poza zakresem:

- breeding horses,
- horse equipment/saddle economy,
- horse inventory,
- selling player-owned animals,
- stealing horses,
- taming wild horses,
- dynamic livestock market,
- multiple horse merchants,
- replacement merchant horses,
- procedural horse quests,
- generic world-entity marketplace,
- generic reward scripting language,
- wolf population redesign,
- new riding mechanics,
- trough/watering implementation,
- affinity requirements for ownership/riding,
- fallback horse reward po śmierci lub wcześniejszym zakupie targetu.

## Implementation guidance

Przed implementacją sprawdzić aktualny kod odpowiedzialny za:

- merchant horse creation i settlement livestock lifecycle,
- merchant interaction/UI oraz payment operations,
- finalny ownership-transfer i spawn-suppression contract z `fauna-020`,
- QuestManager i authored quest definitions,
- quest outcome/reward/consequence exact-once pipeline,
- aktualne wolf/den/world-threat mechanisms,
- persistence konkretnego quest/world entity state.

Najważniejsza granica odpowiedzialności:

```text
merchant / quest
→ decides WHY ownership changes

fauna
→ owns HOW ownership changes
```

Dla nowych ważnych publicznych lub architektonicznych funkcji i klas dodać JSDoc; użyć odpowiedniego `@domain` dla preflight discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
