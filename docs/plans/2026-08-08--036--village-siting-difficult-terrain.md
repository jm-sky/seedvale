# Plan: Lepsze osadzanie wiosek w trudnym terenie (górzyste/nierówne działki)

**Status:** `todo`
**Created:** 2026-08-08
**Scope:** rozszerza [village-generation](./2026-08-08--031--village-generation.md) (`findSettlementSite.ts`, `villageClearing.ts`, `props.ts`); potencjalna synergia z [world-elements-interactions](./2026-08-07--030--world-elements-interactions.md) (dekoracje naturalne — możliwe maskowanie różnic wysokości głazami/podporami)

## Kontekst

Zgłoszenie użytkownika po teście wioski (031): osada wylądowała na szczycie góry — studnia i skład drewna na szczycie, ognisko na pochyłym zboczu, domki poniżej góry. Wioska na górze ma sens **strategiczny** (obronność/widoczność — pasuje do świata gry), ale samo rozmieszczenie wygląda przypadkowe, nie jak zaplanowana górska osada.

## Analiza przyczyny

Dzisiejszy pipeline sprawdza płaskość/suchość tylko **lokalnie**, nie na skalę całej wioski:

- `findSettlementSite()` (80 losowych prób w promieniu `HOME_RADIUS`=56) akceptuje kandydata, jeśli teren jest płaski w promieniu **±2.5 jednostki** od jego centrum. Nie mówi nic o terenie 15-40 jednostek dalej — czyli dokładnie tam, gdzie w `villageClearing.ts::layoutClearings` stają domy (pierścień `ringMin..ringMax`).
- `layoutClearings()` (patrz 031) chroni już przed **wodą** wzdłuż linii plac↔dom (`pathIsDry`) i dodaje **delikatne regionalne wyrównanie wysokości** (`regionalHeightStrengthMountain = 0.15` — świadomie słabe, żeby górska wioska nadal „czuła" zbocze) — ale **nic nie sprawdza nachylenia** przy wyborze samej pozycji domu. Na stromym zboczu 15%-owe wyrównanie nie skompensuje dużej różnicy wysokości na promieniu ~40 jednostek.
- Dodatkowe obiekty core (ognisko, drugi skład dla MD/LG — `props.ts`) stoją dziś na **sztywnych offsetach** od centrum placu (`[-4.5,-2]` itd., jak studnia/skład) — bez żadnego sprawdzenia nachylenia w tym konkretnym miejscu. To dokładnie objaw, który zgłosił użytkownik ("ognisko na pochyłym zboczu").

Efekt: site-search trafia na mały, technicznie płaski „przystanek" (np. półka skalna), ale reszta pierścienia domów i sztywno pozycjonowane dodatkowe obiekty rozjeżdżają się po zboczu wokół niego.

## Kierunki (do wyboru/połączenia przy implementacji)

1. **Sprawdzenie nachylenia przy pozycjonowaniu core-obiektów (ognisko, drugi skład).** Najmniejsza łatka: te obiekty dostają taki sam rodzaj wyszukiwania jak `layoutClearings`'s house search — kilka prób wokół preferowanego offsetu, wybór najpłaszszego/najsuchszego zamiast sztywnej pozycji. Bezpośrednio adresuje zgłoszony objaw.
2. **Szersza ocena płaskości przy wyborze site.** `findSettlementSite` dorzuca do scoringu nachylenie w promieniu zbliżonym do spodziewanego footprintu wioski (nie tylko ±2.5 jedn.), ważone np. przez `mountainRidge`. Wymaga rozstrzygnięcia kolejności: dziś rozmiar wioski (`rollVillageSize`) losowany jest PO wyborze site — albo osobny, szerszy scoring pass tylko jako dodatkowe kryterium odrzucenia (bez zmiany kolejności generacji), albo głębsza zmiana (rozmiar przybliżony z terenu PRZED site-search).
3. **Tarasowanie zamiast jednego wyrównania.** Na stromym terenie świadomie budować 2-3 „tarasy" (grupy clearingów na wspólnej wysokości w obrębie tarasu, połączone krótszymi/stromszymi ścieżkami-schodkami między tarasami) — bardziej realistyczny wygląd górskiej wioski niż próba uśrednienia wszystkiego jedną słabą siłą. Większa zmiana architektoniczna niż punkty 1-2, prawdopodobnie osobny plan po ocenie czy w ogóle potrzebna.
4. **Synergia z zasobami naturalnymi ([world-elements-interactions](./2026-08-07--030--world-elements-interactions.md)).** Głazy/kamienne klastry/podpory jako celowa dekoracja skarpy pod domem stojącym wyżej niż plac — maskuje różnicę wysokości jako "budowniczowie oparli dom o skałę", zamiast żeby czytała się jako błąd generatora. Tani wizualnie, nie wymaga zmian w site-selection ani w `villageClearing.ts`.

## Rekomendacja na start

Punkt 1 (core-object placement retry) jest najmniejszy i bezpośrednio adresuje zgłoszony objaw — zrobić jako pierwszy krok, niezależnie od reszty. Punkty 2-4 to głębsza zmiana jakości siedlisk; ocenić po zobaczeniu efektu punktu 1 w praktyce na kilku górskich seedach, czy w ogóle są potrzebne.

## Poza zakresem teraz

- Pełne tarasowanie (punkt 3) — większy koszt, nierozstrzygnięte czy potrzebne po prostszych łatkach.
- Zmiana kolejności „rozmiar przed site" (punkt 2) — dotyka rdzenia `generateSettlementDef`, robić ostrożnie i osobno, nie przy okazji tej łatki.

## Weryfikacja (po implementacji punktu 1)

- Kilka seedów ze znaną górską osadą (te same co pokazały problem) — ognisko/drugi skład nie stoją już widocznie krzywo na zboczu.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test`.
- Wizualnie w przeglądarce (użytkownik testuje) — górska wioska nadal czuje zbocze (nie jest sztucznie płaskim talerzem), ale obiekty nie wyglądają już losowo rozrzucone.

## Powiązane

- [village-generation](./2026-08-08--031--village-generation.md) — `findSettlementSite.ts`, `villageClearing.ts::layoutClearings`, `props.ts::buildSettlementProps`
- [world-elements-interactions](./2026-08-07--030--world-elements-interactions.md) — potencjalne dekoracyjne maskowanie różnic wysokości (kierunek 4)
