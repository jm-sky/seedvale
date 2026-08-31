# Plan: Player World Placement Foundation

**Created:** 2026-09-01
**Status:** `planned` 📋
**Priority:** medium · **Effort:** M
**Depends on:** none
**Domain:** `world`

## Cel

Przygotować minimalną, współdzieloną infrastrukturę dla trwałych obiektów tworzonych przez gracza.

Fundament ma obsłużyć przyszłe: pochodnie, palisady, ogrody i pola, domki oraz inne player-created world objects.

Nie jest to jeszcze system budowania budynków.

Kluczowy lifecycle:

    placement → validation → creation → world registration → runtime object → persistence → restoration → disposal

## Stan obecny

Codebase posiada kilka niezależnych mechanizmów player-created objects oraz wspólny placement UX.

W szczególności istnieją: evaluateGroundPlacement(), placementActions.ts, placementPreviewActions.ts, world/placementPreview.ts, placement skrzyni/namiotu/ogniska, PlayerGarden, PlayerWell, PlacedContainer, PlacedTent, PlacedTrap, TerrainPreparation oraz SaveData i WorldBundle.

Plan nie powinien zastępować tych mechanizmów bez potrzeby.

ui-input-004-construction-placement-and-terrain-preparation-ux.md ustanowił wspólny placement preview dla skrzyni, namiotu i ogniska. Należy wykorzystać ten mechanizm zamiast tworzyć drugi preview/placement system.

## Zakres

### 1. Recon istniejących mechanizmów

Prześledzić placement actions, placement validation, placement preview, player-created world objects, WorldBundle ownership/lifecycle, SaveData, restore/load flow, interaction registration oraz cleanup/disposal.

Określić, które elementy lifecycle są faktycznie wspólne. Nie tworzyć abstrakcji wyłącznie na podstawie podobieństwa nazw lub powierzchownego podobieństwa kodu.

### 2. Minimalny placement contract

Zdefiniować minimalny wspólny kontrakt opisujący wymagania umieszczenia obiektu.

Powinien umożliwiać określenie m.in. pozycji, orientacji gdy jest potrzebna, footprint/clearance, wymagań podłoża, walidacji kolizji, placement prerequisites oraz wynikowego typu world object.

Kontrakt powinien być wystarczająco mały, aby obsłużyć zarówno prosty placed object, jak i przyszły construction project.

Nie tworzyć jeszcze generycznego systemu modularnych budynków.

### 3. Wspólna walidacja placement

Wykorzystać istniejące evaluateGroundPlacement() i istniejące reguły suitability.

Jeżeli istnieje kilka wariantów walidacji, ujednolicić wspólny przepływ, pozostawiając specyficzne ograniczenia po stronie obiektu/definicji.

Walidacja nie powinna wykonywać gameplayowych operacji takich jak zużycie itemów, rozpoczęcie pracy, utworzenie NPC task ani rozpoczęcie budowy.

### 4. World object registration

Ustalić jasną granicę pomiędzy placement request a persistent world object.

Po zatwierdzeniu placementu obiekt powinien zostać zarejestrowany w odpowiednim właścicielu świata i być dostępny dla innych systemów.

Nie tworzyć globalnego PlayerConstructionManager. WorldBundle powinien pozostać lifecycle boundary dla runtime world systems.

### 5. Persistence boundary

Określić wspólny sposób integrowania player-created objects z istniejącym SaveData.

Minimalne wymagania: obiekt po utworzeniu jest zapisywalny, stan jest odtwarzany po reloadzie, restore odtwarza wymagane runtime representation, a cleanup poprawnie usuwa runtime state.

Nie migrować automatycznie wszystkich obiektów do nowego formatu.

### 6. Audyt i selektywna migracja istniejących obiektów

Po zidentyfikowaniu wspólnego lifecycle ocenić PlayerGarden, PlayerWell, PlacedContainer, PlacedTent, PlacedTrap i inne istniejące player-created objects.

Jeżeli kilka systemów rzeczywiście posiada wspólny lifecycle, wyciągnąć wspólną infrastrukturę i migrować pasujące implementacje.

Migracja nie może wymuszać wspólnego modelu gameplayowego. Specyficzne zachowania pozostają własnością konkretnych systemów.

Nie migrować obiektu tylko po to, aby zwiększyć pozorną jednolitość kodu.

### 7. Interaction/lifecycle boundary

Oddzielić placement od późniejszych interakcji i zmian stanu.

Przyszła pochodnia powinna móc działać jako: placed → unlit → interacted with → lit.

Logika ignite nie należy do tego planu. Plan ma jedynie zapewnić, że utworzony obiekt może być poprawnie zarejestrowany i odnaleziony przez istniejące interaction/action mechanisms.

### 8. Ground placement

Wspólny fundament nie może zakładać, że obiekt musi być przy ścianie, przy płocie, przypięty do budynku ani częścią modularnego snapowania.

Przyszła pochodnia musi móc być ustawiona bezpośrednio na odpowiednim podłożu.

Reguły szczegółowe pozostają po stronie konkretnego obiektu.

## Proof / kryterium architektoniczne

Zweryfikować fundament na co najmniej dwóch przypadkach: (1) istniejący prosty placed object, (2) istniejący object posiadający własny interaction/state lifecycle.

Celem jest sprawdzenie, że wspólna infrastruktura faktycznie usuwa duplikację bez przenoszenia specyficznego gameplayu do generycznej warstwy.

Fundament powinien być możliwy do wykorzystania przez przyszłą pochodnię bez tworzenia równoległego placement systemu.

## Non-goals

Plan nie obejmuje: torches, ignition, torch light sources, construction progress, material delivery, NPC construction work, palisades, gates, houses, modular snapping, building editor, fields, nowego resource economy ani nowego player worker/AI system.

## Decyzje architektoniczne

### Placement nie jest construction

Nie każdy obiekt musi przechodzić przez planning → material delivery → work → completion. Pochodnia może być zwykłym placed object. Palisada lub domek będą mogły później używać construction lifecycle.

### Object behaviour nie jest placement

Placement odpowiada za utworzenie i umieszczenie obiektu. Obiekt odpowiada za swoje późniejsze zachowanie i stan.

### Brak monolitycznego managera

Nie tworzyć PlayerConstructionManager, który zna wszystkie typy obiektów. Wspólna infrastruktura ma być mała i composable.

### Existing systems first

Jeżeli obecny mechanizm już poprawnie obsługuje odpowiedzialność, należy go wykorzystać lub lekko rozszerzyć zamiast przepisywać do nowej abstrakcji.

## Kryteria ukończenia

- istnieje jasno określony wspólny placement contract;
- walidacja korzysta z istniejących reguł zamiast posiadać drugi zestaw zasad;
- placement może utworzyć persistent world object;
- world registration ma jednoznacznego właściciela;
- persistence boundary jest jasno określona;
- restore i cleanup są uwzględnione;
- istniejący placement preview pozostaje używany;
- wspólny lifecycle jest wykorzystany przez pasujące istniejące obiekty;
- specyficzne zachowania pozostają poza wspólną warstwą;
- nie powstał monolityczny construction manager;
- fundament jest możliwy do wykorzystania przez przyszłą pochodnię bez tworzenia równoległego placement systemu.

## Weryfikacja

Automatycznie: pnpm exec tsc --noEmit, pnpm run lint, pnpm run test, pnpm run build. W razie istnienia aktualnych komend preflight/CI użyć ich zgodnie z CLAUDE.md.

Manualnie w browserze zweryfikować co najmniej dwa istniejące przypadki: prosty placed object oraz obiekt z własnym interaction/state lifecycle.

Sprawdzić placement, preview, validation, confirm, cancel, utworzenie obiektu, interakcję, save/load, restore i cleanup.

### JSDoc

Podczas implementacji dodać JSDoc dla ważnych publicznych/architektonicznych funkcji i klas wprowadzonych lub istotnie zmienionych przez ten plan, gdy jest potrzebny do preflight/discovery. Warto użyć @domain world.

## Dokumentacja

Jeżeli implementacja zmieni rzeczywisty stan opisany w docs/STATE.md, zaktualizować odpowiednią sekcję.

Nie zmieniać roadmapy mechanicznie — aktualizować ją tylko wtedy, gdy zmieni się kierunek lub zakres.

> **Zrób git commit i push do main, rebase jeżeli trzeba**