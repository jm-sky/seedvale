# Plan: Jazda konna

**Created:** 2026-08-28  
**Status:** `verification needed` 🔍  
**Priority:** medium · **Effort:** M  
**Depends on:** -  
**Domain:** `fauna`  
**Roadmap:** `horse-and-riding.md`

## 1. Cel

Dodać do Seedvale możliwość wykorzystywania zwierzęcia jezdnego jako środka transportu gracza.

Pierwszym obsługiwanym typem będzie **koń**.

Mechanizm powinien jednak od początku być zaprojektowany dla wspólnej kategorii **mountable animal**, aby późniejsze dodanie np. osła nie wymagało tworzenia osobnego systemu jazdy.

Gracz będzie mógł:
- podejść do konia i na niego wsiąść,
- być prawidłowo osadzony na modelu zwierzęcia w 3D,
- sterować zwierzęciem,
- korzystać z co najmniej dwóch poziomów prędkości,
- zejść ze zwierzęcia za pomocą dedykowanego przycisku UI na desktopie i mobile,
- obserwować wpływ jazdy na stamina/vigor zwierzęcia,
- spaść przy skrajnie niekorzystnych warunkach,
- ponieść obrażenia przy upadku zależne m.in. od prędkości, terenu i Riding skill.

Koń pozostaje normalnym zwierzęciem Seedvale. Jazda nie może zamieniać go w specjalny, player-only obiekt.

## 2. Zakres i zasady

### Mountable animal

Jazda powinna być capability/mechanizmem dostępnym dla zwierząt, które mogą pełnić funkcję mounta.

Pierwszym takim zwierzęciem będzie koń.

Przyszłe zwierzęta, np. osioł, powinny korzystać z tego samego mechanizmu:

```
AnimalAgent
  ↓
mountable capability
  ↓
mounted state
  ↓
shared riding system
```

Różnice pomiędzy gatunkami powinny wynikać przede wszystkim z danych/configuration:
- movement speed,
- stamina,
- vigor,
- acceleration,
- temperament,
- mount point,
- ewentualne ograniczenia gaitów,
- przyszły udźwig/cargo.

Nie tworzyć osobnych systemów `HorseRiding` i `DonkeyRiding`.

### Zwierzę pozostaje zwierzęciem

Wykorzystać istniejące mechanizmy:
- animal lifecycle,
- needs,
- food/water,
- stamina/vigor,
- movement,
- follow,
- threat/flee/combat,
- entity identity/lifecycle.

Nie tworzyć równoległego systemu potrzeb ani specjalnego AI tylko dla koni.

### Gracz pozostaje niezależną encją

Stan jazdy powinien być częścią stanu gracza lub istniejącego mechanizmu relacji gracz ↔ encja.

Rendering może wiązać wizualną postać gracza ze zwierzęciem, ale logicznie gracz i zwierzę pozostają osobnymi encjami.

### Jazda rozszerza istniejące systemy

```
Player
  ↓
mount interaction
  ↓
mounted state
  ↓
Mountable Animal movement
  ↓
Animal stamina/vigor
  ↓
riding stability
  ↓
possible fall
```

## 3. Stan i potrzeby zwierzęcia

Mount wykorzystuje istniejące parametry kondycji zwierząt.

### Stamina

Bieżąca wytrzymałość:
- wolny chód ma bardzo mały koszt,
- szybszy ruch ma większy koszt,
- odpoczynek regeneruje stamina,
- brak stamina ogranicza szybką jazdę.

Koszt powinien być konfigurowalny per animal type.

### Vigor

Długoterminowa kondycja:
- jedzenie, picie i odpoczynek wpływają na kondycję,
- przemęczenie może obniżać vigor,
- vigor wpływa na maksymalną stamina i regenerację.

### Food / water

Mount musi normalnie jeść i pić.

Głodny lub spragniony mount powinien sam szukać odpowiedniego źródła jedzenia/wody, wykorzystując istniejące potrzeby i zachowania zwierząt.

Nie tworzyć osobnego systemu potrzeb dla mountów.

## 4. Zachowanie i zagrożenia

Mount zachowuje się jak normalne zwierzę także poza jazdą.

### Podążanie za graczem

Zwierzę może podążać za graczem, gdy nie jest dosiadane, korzystając z istniejącego follow/movement AI.

Nie powinno teleportować się do gracza ani ignorować przeszkód.

Może przerwać lub zmienić zachowanie z powodu:
- głodu,
- pragnienia,
- zmęczenia,
- zagrożenia,
- problemów z pathfindingiem.

### Wilki

Koń powinien rozpoznawać wilki jako zagrożenie i reagować zgodnie z istniejącym threat/flee systemem.

Preferowaną reakcją jest ucieczka.

Mechanizm powinien pozostać ogólny dla mountable animals, jeżeli przyszły gatunek również posiada odpowiednią reakcję na zagrożenia.

### Obrona

Mount może walczyć, gdy zostanie bezpośrednio zmuszony do obrony, jeśli istniejący system animal attack pozwala na takie zachowanie.

Nie tworzyć specjalnego mounted-animal combat systemu w ramach tego planu.

## 5. Mount

Gracz może wejść na mount, gdy spełnione są wymagania interakcji:
- zwierzę jest wystarczająco blisko,
- zwierzę jest żywe,
- zwierzę posiada capability `mountable`,
- gracz nie jest już zamontowany,
- brak konfliktu z inną aktywnością.

Po mount gracz otrzymuje mounted state i ruch zostaje podporządkowany mountowi.

Na tym etapie **każde zwierzę posiadające `mountable` może zostać dosiadane**.

Pierwszym i jedynym gatunkiem dostarczonym w ramach tego planu jest koń.

Oswajanie, własność i zakup zwierzęcia są poza zakresem.

## 6. Osadzenie gracza w 3D

Każdy mountable animal powinien posiadać konfigurowalny mount point określający:
- pozycję siedzenia,
- wysokość,
- orientację,
- ewentualny offset zależny od modelu zwierzęcia.

Docelowy model relacji wizualnej:

```
Mountable Animal
└── MountPoint
      └── Player visual
```

Nie przenosić bez potrzeby całej logicznej encji gracza pod model zwierzęcia.

Mount point powinien być właściwością/configuration konkretnego typu lub modelu zwierzęcia, aby np. koń i osioł mogły mieć różne ustawienia.

## 7. Animacje

Pierwsza wersja powinna być możliwie prosta.

Dla konia potrzebne są co najmniej:
- mounted idle,
- mounted movement.

Jeżeli obecny asset/player animation system nie posiada odpowiednich animacji jeździeckich, dopuszczalny jest fallback:
- statyczna poza siedząca,
- poprawne osadzenie modelu,
- synchronizacja z ruchem konia.

Nie tworzyć osobnego, rozbudowanego systemu animacji jeździeckich.

Animacje wsiadania, zsiadania, reakcji i upadku mogą zostać dodane później.

Mechanizm nie powinien zakładać, że wszystkie przyszłe mountable animals będą posiadały identyczny zestaw animacji.

## 8. Sterowanie i prędkość

Podczas jazdy input gracza steruje mountem.

Cel funkcjonalny:
- co najmniej dwa wyraźne poziomy prędkości,
- szybszy ruch kosztuje więcej stamina.

Preferowany wariant:

```
walk → trot → gallop
```

Jeżeli istniejący movement system sprawia, że trzy poziomy wymagają niepotrzebnej przebudowy, wystarczy:

```
walk → run
```

Nie uzależniać planu od konkretnej liczby gaitów.

Parametry ruchu powinny być konfigurowalne per mountable animal.

Dzięki temu osioł może później mieć np. niższą prędkość maksymalną bez zmiany systemu jazdy.

## 9. Stamina gracza

Podczas jazdy stamina gracza powinna powoli spadać.

Tempo zużycia musi być:
- wyraźnie mniejsze niż podczas chodzenia,
- znacznie mniejsze niż podczas biegu,
- oparte na istniejącym systemie stamina/energy.

Jazda nie powinna być całkowicie darmowa dla gracza, ale powinna być efektywnym sposobem przemieszczania się.

## 10. Dismount

Zejście z mounta jest osobną akcją.

### UI

Podczas jazdy pojawia się dedykowany przycisk **Dismount**:
- widoczny tylko podczas jazdy,
- dostępny na desktopie,
- dostępny na mobile,
- odpowiednio duży i wygodny do obsługi dotykiem,
- nie może kolidować z istniejącym sterowaniem kamerą/joystickiem.

Po zejściu gracz otrzymuje poprawną pozycję na ziemi obok mounta i wraca do normalnego movementu.

## 11. Riding stability

Upadek nie powinien zależeć wyłącznie od jednego progu stamina.

Ryzyko powinno uwzględniać:
- stamina mounta,
- aktualną prędkość,
- teren,
- kondycję mounta,
- Riding skill gracza.

Docelowo:

```
mount stamina
+ speed
+ terrain
+ mount condition
+ riding skill
→ riding stability
```

Przy spokojnym ruchu i wysokiej stamina ryzyko powinno być praktycznie zerowe.

Przy szybkiej jeździe i skrajnie niskiej stamina ryzyko rośnie.

Mechanizm powinien działać niezależnie od konkretnego gatunku mounta.

## 12. Riding skill

Jeżeli istnieje odpowiednia infrastruktura skilli, wykorzystać istniejący system.

Riding skill może wpływać na:
- prawdopodobieństwo upadku,
- kontrolę zmęczonego mounta,
- stabilność podczas szybkiej jazdy,
- obrażenia przy upadku.

Nie tworzyć osobnego systemu progression tylko na potrzeby tego planu.

## 13. Upadek

Upadek jest zdarzeniem wynikającym z riding stability.

Podczas upadku:
- gracz zostaje odłączony od mounta,
- mounted state zostaje wyczyszczony,
- gracz wraca na ziemię,
- może otrzymać obrażenia,
- normalny player movement zostaje przywrócony.

Mount pozostaje normalną encją zwierzęcia i kontynuuje odpowiednie zachowanie.

## 14. Obrażenia

Nie stosować stałego damage.

Obrażenia powinny zależeć od:
- prędkości,
- severity upadku,
- terenu,
- Riding skill.

Przykładowa zależność:

```
fall severity
+ movement speed
+ terrain
- riding skill
→ damage
```

Wykorzystać istniejący system HP/damage.

## 15. Kamera

Mounted state musi poprawnie współpracować z istniejącym camera controllerem.

Zweryfikować:
- śledzenie gracza podczas jazdy,
- poprawną wysokość,
- brak jittera,
- poprawne przejście mount/dismount,
- poprawne działanie na mobile.

## 16. Mobile

Mobile jest częścią pierwszej implementacji.

Uwzględnić:
- dedykowany Dismount button,
- obecny virtual joystick/input,
- rozmieszczenie przycisków,
- obsługę kamery,
- sterowanie prędkością.

## 17. Przyszłe systemy poza zakresem

### Oswajanie i zakup mounta

Osobny plan.

Nie implementować:
- taming,
- ownership,
- zakupu/sprzedaży mountów,
- relacji właściciel ↔ mount jako wymagania mount.

Pierwsza wersja pozwala dosiąść dowolnego zwierzęcia posiadającego `mountable`.

### Mounted combat

Osobny plan.

Nie implementować:
- ataku z mounta,
- łuku z mounta,
- walki mieczem,
- mounted combat animations,
- specjalnych ataków.

Obecny plan powinien jednak zapewnić stabilny mounted state, który przyszły combat będzie mógł wykorzystać.

### Juki / transport przedmiotów

Osobny plan.

Nie implementować:
- inventory mounta,
- juk,
- cargo,
- udźwigu,
- wpływu ładunku na movement/stamina.

Architektura nie powinna jednak blokować późniejszego rozszerzenia mounta o transport rzeczy.

## 18. Przykładowe przyszłe mountable animals

Poza zakresem pierwszej implementacji, ale mechanizm powinien umożliwiać dodanie np.:

```
Horse
  speed: high
  stamina: high

Donkey
  speed: lower
  stamina: high
  future cargo capacity: high
```

Dodanie kolejnego gatunku powinno wymagać przede wszystkim:
- animal definition,
- modelu,
- parametrów movement/stamina,
- mount point,
- odpowiednich animacji lub fallbacku.

Nie powinno wymagać kopiowania systemu mount/riding.

## 19. Istotne systemy do sprawdzenia przed implementacją

Przed kodowaniem należy zweryfikować aktualną implementację:
- player movement/input,
- player stamina/energy,
- player HP/damage,
- animal state/lifecycle,
- animal needs,
- animal stamina/vigor,
- animal movement,
- follow behaviour,
- threat/flee,
- animal attack,
- interaction/action system,
- UI/HUD,
- mobile controls,
- player animation,
- Three.js entity/model attachment,
- camera controller.

Plan należy dostosować do aktualnego kodu, jeśli dokumentacja lub założenia okażą się niezgodne ze stanem repozytorium.

## 20. Kryteria ukończenia

- [ ] gracz może dosiąść konia,
- [ ] mounted state jest reprezentowany w stanie gracza,
- [ ] mountable capability jest niezależna od konkretnego gatunku,
- [ ] gracz jest poprawnie osadzony na modelu 3D,
- [ ] mount point jest konfigurowalny per animal/model,
- [ ] działa mounted idle/movement lub poprawny fallback,
- [ ] koń porusza się pod kontrolą gracza,
- [ ] dostępne są co najmniej dwa poziomy prędkości,
- [ ] szybszy ruch zużywa więcej stamina konia,
- [ ] parametry ruchu i stamina nie są hard-coded wyłącznie dla konia,
- [ ] koń ma wysoką stamina/vigor odpowiednią dla gatunku,
- [ ] food/water wpływają na kondycję konia,
- [ ] głodny/spragniony koń szuka jedzenia/wody,
- [ ] koń reaguje na wilki jako zagrożenie,
- [ ] koń może się bronić, gdy wymaga tego istniejący system,
- [ ] stamina gracza podczas jazdy powoli spada,
- [ ] stamina gracza spada dużo wolniej niż podczas normalnego ruchu,
- [ ] gracz może zejść z konia,
- [ ] istnieje dedykowany Dismount button,
- [ ] Dismount działa na desktopie i mobile,
- [ ] koń może podążać za graczem,
- [ ] bardzo niska stamina może doprowadzić do upadku,
- [ ] Riding skill wpływa na stabilność, jeśli istnieje system skilli,
- [ ] upadek może powodować obrażenia,
- [ ] obrażenia zależą od warunków upadku,
- [ ] kamera poprawnie działa podczas jazdy,
- [ ] brak regresji w normalnym ruchu gracza i konia,
- [ ] drugi mountable animal może zostać dodany bez tworzenia osobnego riding systemu,
- [ ] oswajanie/zakup pozostają poza zakresem,
- [ ] mounted combat pozostaje poza zakresem,
- [ ] juki i transport przedmiotów pozostają poza zakresem.

## 21. Verification

Po implementacji:
1. uruchomić istniejące testy/lint/typecheck/build zgodnie z repozytorium,
2. wykonać browser/manual verification mount/dismount,
3. zweryfikować 3D seating, animację/fallback i kamerę,
4. zweryfikować desktop i mobile input,
5. zweryfikować stamina/vigor, needs i reakcje na wilki,
6. zweryfikować upadek i damage,
7. sprawdzić brak regresji w normalnym player/animal movement,
8. sprawdzić, że mechanizm nie zawiera horse-only assumptions uniemożliwiających dodanie kolejnego mountable animal.

Nie uznawać poprawności wizualnego osadzenia gracza na mountcie za zweryfikowaną bez testu w przeglądarce.

**Zrób git commit i push do main, rebase jeżeli trzeba**
