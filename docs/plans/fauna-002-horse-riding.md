# Plan: Jazda konna

**Created:** 2026-08-27
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** none
**Domain:** `fauna`

## 1. Cel

Dodać do Seedvale możliwość wykorzystywania konia jako środka transportu gracza.

Gracz będzie mógł:
- podejść do konia i na niego wsiąść,
- być prawidłowo osadzony na modelu konia w 3D,
- sterować koniem,
- korzystać z co najmniej dwóch poziomów prędkości,
- zejść z konia za pomocą dedykowanego przycisku UI na desktopie i mobile,
- obserwować wpływ jazdy na stamina/vigor konia,
- spaść z konia przy skrajnie niekorzystnych warunkach,
- ponieść obrażenia przy upadku zależne m.in. od prędkości, terenu i Riding skill.

Koń pozostaje normalnym zwierzęciem Seedvale. Jazda nie może zamieniać go w specjalny, player-only obiekt.

## 2. Zakres i zasady

### Koń pozostaje zwierzęciem

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

Rendering może wiązać wizualną postać gracza z koniem, ale logicznie gracz i koń pozostają osobnymi encjami.

### Jazda rozszerza istniejące systemy

```
Player
  ↓
mount interaction
  ↓
mounted state
  ↓
Horse movement
  ↓
Horse stamina/vigor
  ↓
riding stability
  ↓
possible fall
```

## 3. Stan i potrzeby konia

Koń wykorzystuje istniejące parametry kondycji zwierząt.

### Stamina

Bieżąca wytrzymałość:
- wolny chód ma bardzo mały koszt,
- szybszy ruch ma większy koszt,
- odpoczynek regeneruje stamina,
- brak stamina ogranicza szybką jazdę.

### Vigor

Długoterminowa kondycja:
- jedzenie, picie i odpoczynek wpływają na kondycję,
- przemęczenie może obniżać vigor,
- vigor wpływa na maksymalną stamina i regenerację.

### Food / water

Koń musi normalnie jeść i pić.

Głodny lub spragniony koń powinien sam szukać odpowiedniego źródła jedzenia/wody, wykorzystując istniejące potrzeby i zachowania zwierząt.

## 4. Zachowanie i zagrożenia

Koń zachowuje się jak normalne zwierzę także poza jazdą.

### Podążanie za graczem

Koń może podążać za graczem, gdy nie jest dosiadany, korzystając z istniejącego follow/movement AI.

Nie powinien teleportować się do gracza ani ignorować przeszkód.

Może przerwać lub zmienić zachowanie z powodu:
- głodu,
- pragnienia,
- zmęczenia,
- zagrożenia,
- problemów z pathfindingiem.

### Wilki

Koń powinien rozpoznawać wilki jako zagrożenie i reagować zgodnie z istniejącym threat/flee systemem.

Preferowaną reakcją jest ucieczka.

### Obrona

Koń może walczyć, gdy zostanie bezpośrednio zmuszony do obrony, jeśli istniejący system animal attack pozwala na takie zachowanie.

Nie tworzyć specjalnego horse-combat systemu w ramach tego planu.

## 5. Mount

Gracz może wejść na konia, gdy spełnione są wymagania interakcji:
- koń jest wystarczająco blisko,
- koń jest żywy,
- koń może zostać dosiadany,
- gracz nie jest już zamontowany,
- brak konfliktu z inną aktywnością.

Po mount gracz otrzymuje mounted state i ruch zostaje podporządkowany koniowi.

Na tym etapie **każdy koń może zostać dosiadany**.

Oswajanie, własność i zakup konia są poza zakresem i zostaną dodane w osobnym planie.

## 6. Osadzenie gracza w 3D

Koń powinien posiadać konfigurowalny mount point określający:
- pozycję siedzenia,
- wysokość,
- orientację,
- ewentualny offset zależny od modelu konia.

Docelowy model relacji wizualnej:

```
Horse
└── MountPoint
      └── Player visual
```

Nie przenosić bez potrzeby całej logicznej encji gracza pod model konia.

## 7. Animacje

Pierwsza wersja powinna być możliwie prosta.

Potrzebne są co najmniej:
- mounted idle,
- mounted movement.

Jeżeli obecny asset/player animation system nie posiada odpowiednich animacji jeździeckich, dopuszczalny jest fallback:
- statyczna poza siedząca,
- poprawne osadzenie modelu,
- synchronizacja z ruchem konia.

Nie tworzyć osobnego, rozbudowanego systemu animacji jeździeckich.

Animacje wsiadania, zsiadania, reakcji i upadku mogą zostać dodane później.

## 8. Sterowanie i prędkość

Podczas jazdy input gracza steruje koniem.

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

## 9. Stamina gracza

Podczas jazdy stamina gracza powinna powoli spadać.

Tempo zużycia musi być:
- wyraźnie mniejsze niż podczas chodzenia,
- znacznie mniejsze niż podczas biegu,
- oparte na istniejącym systemie stamina/energy.

Jazda nie powinna być więc całkowicie darmowa dla gracza, ale powinna być efektywnym sposobem przemieszczania się.

## 10. Dismount

Zejście z konia jest osobną akcją.

### UI

Podczas jazdy pojawia się dedykowany przycisk **Dismount**:
- widoczny tylko podczas jazdy,
- dostępny na desktopie,
- dostępny na mobile,
- odpowiednio duży i wygodny do obsługi dotykiem,
- nie może kolidować z istniejącym sterowaniem kamerą/joystickiem.

Po zejściu gracz otrzymuje poprawną pozycję na ziemi obok konia i wraca do normalnego movementu.

## 11. Riding stability

Upadek nie powinien zależeć wyłącznie od jednego progu stamina.

Ryzyko powinno uwzględniać:
- stamina konia,
- aktualną prędkość,
- teren,
- kondycję konia,
- Riding skill gracza.

Docelowo:
```
horse stamina
+ speed
+ terrain
+ horse condition
+ riding skill
→ riding stability
```

Przy spokojnym ruchu i wysokiej stamina ryzyko powinno być praktycznie zerowe.

Przy szybkiej jeździe i skrajnie niskiej stamina ryzyko rośnie.

## 12. Riding skill

Jeżeli istnieje odpowiednia infrastruktura skilli, wykorzystać istniejący system.

Riding skill może wpływać na:
- prawdopodobieństwo upadku,
- kontrolę zmęczonego konia,
- stabilność podczas szybkiej jazdy,
- obrażenia przy upadku.

Nie tworzyć osobnego systemu progression tylko na potrzeby tego planu.

## 13. Upadek

Upadek jest zdarzeniem wynikającym z riding stability.

Podczas upadku:
- gracz zostaje odłączony od konia,
- mounted state zostaje wyczyszczony,
- gracz wraca na ziemię,
- może otrzymać obrażenia,
- normalny player movement zostaje przywrócony.

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

### Oswajanie i zakup konia

Osobny plan.

Nie implementować:
- taming,
- ownership,
- zakupu/sprzedaży koni,
- relacji właściciel ↔ koń jako wymagania mount.

Pierwsza wersja pozwala dosiąść dowolnego konia.

### Mounted combat

Osobny plan.

Nie implementować:
- ataku z konia,
- łuku z konia,
- walki mieczem,
- mounted combat animations,
- specjalnych ataków.

Obecny plan powinien jednak zapewnić stabilny mounted state, który przyszły combat będzie mógł wykorzystać.

### Juki / transport przedmiotów

Osobny plan.

Nie implementować:
- inventory konia,
- juk,
- cargo,
- udźwigu,
- wpływu ładunku na movement/stamina.

Architektura nie powinna jednak blokować późniejszego rozszerzenia konia o transport rzeczy.

## 18. Istotne systemy do sprawdzenia przed implementacją

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

## 19. Kryteria ukończenia

- [ ] gracz może dosiąść konia,
- [ ] mounted state jest reprezentowany w stanie gracza,
- [ ] gracz jest poprawnie osadzony na modelu 3D,
- [ ] działa mounted idle/movement lub poprawny fallback,
- [ ] koń porusza się pod kontrolą gracza,
- [ ] dostępne są co najmniej dwa poziomy prędkości,
- [ ] szybszy ruch zużywa więcej stamina konia,
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
- [ ] oswajanie/zakup pozostają poza zakresem,
- [ ] mounted combat pozostaje poza zakresem,
- [ ] juki i transport przedmiotów pozostają poza zakresem.

## 20. Verification

Po implementacji:
1. uruchomić istniejące testy/lint/typecheck/build zgodnie z repozytorium,
2. wykonać browser/manual verification mount/dismount,
3. zweryfikować 3D seating, animację/fallback i kamerę,
4. zweryfikować desktop i mobile input,
5. zweryfikować stamina/vigor, needs i reakcje na wilki,
6. zweryfikować upadek i damage,
7. sprawdzić brak regresji w normalnym player/animal movement.

Nie uznawać poprawności wizualnego osadzenia gracza na koniu za zweryfikowaną bez testu w przeglądarce.

**Zrób git commit i push do main, rebase jeżeli trzeba**
