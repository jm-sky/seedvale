# Plan: Road travel autopilot for player and mounts

**Created:** 2026-09-19
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** L
**Depends on:** ~~fauna-003~~, ~~npc-006~~
**Domain:** `ui-input`
**Subdomains:** `input` `interaction` `feedback`
**Tags:** `autopilot` `travel` `roads` `riding` `notifications`
**Roadmap:** -
**Model:** `Sonnet`, `Composer`

## Goal

Dodać opcjonalny autopilot podróży gracza między znanymi miejscami świata, poruszający realną postacią pieszo albo realnym mountem wyłącznie po istniejących drogach i ścieżkach.

Autopilot nie jest fast-travelem, teleportem ani osobną symulacją podróży. Zastępuje tylko bieżący movement input gracza, a świat nadal działa z normalną szczegółowością wynikającą z istniejącego runtime.

Podróż:

```text
known destination
→ regional road/path itinerary
→ waypoint execution
→ normal player / mounted movement
→ normal collision, terrain, stamina, threats and combat
→ arrival / interruption
```

Mechanizm ma od początku wykorzystywać wspólne kontrakty nawigacji i dróg tak, aby regionalne itinerary mogło później służyć także NPC, merchantom, courierom i innym world travellers bez tworzenia player-only grafu tras.

## Why this fits current architecture

Aktualny `main` już posiada większość potrzebnych mechanizmów:

- `src/settlement/roadNetwork.ts` jest canonical ownerem regionalnych dróg i ścieżek:
  - `RoadRoute`,
  - `RoutePoint`,
  - `RoadSegment`,
  - `findRoute()`,
  - `neighborsFor()`,
  - settlement ↔ settlement road routes,
  - settlement ↔ minor-location paths,
  - route cache,
  - river/ford/bridge semantics;
- `npc-006` dostarcza bounded local navigation dla detailed locomotion. Regionalne road routes nie powinny zastępować ogólnego local pathfindingu;
- `src/player/PlayerController.ts` pozostaje ownerem pieszego movementu gracza;
- `src/app/actions/mountActions.ts` + `AnimalAgent.driveMounted()` już realizują mounted movement, slope/collision, stamina, riding skill i riding stability;
- `src/player/playerDamage.ts::applyPlayerDamage()` jest canonical seamem realnego HP loss gracza;
- `src/ui/createToast.ts` dostarcza istniejący in-game feedback;
- world-location/knowledge system dostarcza stable known destinations;
- `npc-046` utrwala ważny kontrakt: **destination/route commitment != locomotion urgency**.

Nie tworzyć:

- `AutopilotPathfinder`,
- osobnego collision systemu,
- osobnego horse movement,
- osobnego threat registry,
- player-only kopii road graph,
- drugiego world-location catalogu.

## Core design

### 1. Autopilot is input orchestration

Autopilot posiada wyłącznie runtime commitment podróży i aktualny waypoint.

Preferowany model:

```ts
type TravelAutopilotMode = 'normal' | 'escape'

type TravelAutopilotState = {
  destination: TravelDestinationRef
  itinerary: RegionalTravelItinerary
  waypointIndex: number
  mode: TravelAutopilotMode
}
```

Dokładne typy mają zostać dopasowane do istniejących world-location i road contracts podczas implementation notes; nie tworzyć równoległych identity types, jeśli istniejące stable IDs wystarczą.

Autopilot nie staje się ownerem:

- pozycji gracza,
- pozycji mounta,
- stamina,
- HP,
- threat state,
- road geometry,
- destination knowledge.

### 2. Known destinations only

V1 pozwala uruchomić autopilot tylko do miejsca, które gracz faktycznie zna przez istniejący location/knowledge system.

Pierwszy zakres destination:

- settlement,
- known landmark/world location,
- cave entrance,
- minor location, jeżeli istnieje w canonical location catalog / ma stabilne world-space semantics.

V1 nie obsługuje:

- kliknięcia w dowolny punkt mapy,
- ukrytych/nieodkrytych lokacji,
- ślepego „idź do współrzędnych”.

### 3. Roads and paths only

Długodystansowa część trasy musi prowadzić po canonical `road` / `path` geometry.

Autopilot może wykonać tylko krótki connector:

- bieżąca pozycja → wejście na odpowiednią drogę/ścieżkę,
- koniec drogi/ścieżki → fizyczny punkt destination,

jeżeli connector jest lokalnie osiągalny przez istniejącą detailed navigation.

Nie wolno skracać podróży „na przełaj” tylko dlatego, że straight-line jest krótszy.

Jeżeli destination nie ma sensownego połączenia z road/path network, autopilot powinien odmówić startu lub zatrzymać się z czytelnym feedbackiem zamiast samodzielnie projektować trasę przez wilderness.

## Regional road itinerary

### Missing seam confirmed by recon

`roadNetwork.ts` potrafi rozwiązać geometrię pojedynczych połączeń, ale obecnie nie ma publicznego kontraktu w rodzaju:

```text
routeBetweenKnownLocations(from, to)
→ ordered road/path legs across multiple settlement edges
```

To jest główny nowy reusable element tego planu.

### Required responsibility

Dodać mały, data-only resolver regionalnego itinerary bazujący na istniejącym road graph i istniejących cached `RoadRoute`.

Przykład:

```text
player connector
→ road A→B
→ road B→C
→ path C→destination
→ destination connector
```

Resolver:

- nie tworzy nowego road graph;
- używa istniejących settlement identities / `neighborsFor()` / canonical route resolution;
- nie przelicza world terrain na własną rękę;
- nie kopiuje crossing semantics;
- nie mutuje road cache;
- zwraca ordered route legs/waypoints jako plain data;
- ma deterministic wynik dla tego samego świata i endpoints;
- jest entity-neutral, mimo że pierwszym consumerem jest player autopilot.

Preferować najmniejszy wspólny moduł przy `roadNetwork.ts` / world-terrain ownership zamiast implementowania graph walk w `ui-input`.

### Graph-level search

Jeżeli destination wymaga wielu road edges, użyć bounded graph search po istniejących realnych road connections.

Cost V1:

- suma długości canonical `RoadRoute` / edge distance;
- failed/nonexistent route = edge niedostępny.

Nie dodawać jeszcze:

- danger weighting,
- weather weighting,
- road-quality weighting,
- economy/trade cost,
- dynamic safe-route scoring.

Te czynniki mogą później rozszerzyć ten sam resolver.

## Walking execution

### PlayerController seam

Nie emulować klawiatury i nie ustawiać flag `keyboard.state.forward`.

Dodać mały jawny movement-intent seam, dzięki któremu istniejący `PlayerController` może dostać wektor ruchu pochodzący z:

- normalnego player input, albo
- aktywnego autopilota.

Normalny movement pipeline pozostaje authoritative dla:

- speed,
- sprint,
- slope constraints,
- collision,
- animation,
- stamina,
- swimming/ground rules.

Autopilot tylko oblicza kierunek do kolejnego waypointu oraz żądaną locomotion urgency.

## Mounted execution

Mounted autopilot musi używać istniejącego:

```text
MountActions
→ AnimalAgent.driveMounted(...)
```

Nie dodawać drugiej metody ruchu dla konia.

Autopilot dostarcza odpowiednik:

- `wishX`,
- `wishZ`,
- `sprintRequested`.

Cała istniejąca logika pozostaje aktywna:

- mount stamina,
- riding stamina gracza,
- slope/collision,
- Riding skill,
- riding stability,
- fall,
- mount death/unavailability,
- seat transform.

Autopilot ma działać dla capability `mountable`, nie tylko hard-coded horse.

## Locomotion modes

Podróż ma dwa execution modes:

```text
normal
escape
```

### Normal

- pieszo: zwykłe tempo podróży zgodne z player movement policy;
- mounted: zwykłe tempo jazdy.

Nie wymuszać ciągłego sprintu jako standardu V1.

### Escape

Threat może podnieść urgency bez zmiany destination:

```text
same route commitment
+ immediate relevant threat
→ mode = escape
→ sprint / fast mounted gait
```

Invariant:

```text
destination/route commitment != locomotion urgency
```

Escape nie jest osobną trasą ucieczki. Gracz/mount kontynuuje w stronę następnego waypointu podróży.

Po ustąpieniu zagrożenia autopilot wraca do `normal`.

## Threat integration

Nie tworzyć osobnego skanera fauny dla autopilota.

Implementation notes mają wskazać istniejący bounded/current player-threat seam i wykorzystać go do klasyfikacji:

```text
relevant threat nearby
→ RUN / ESCAPE

real hostile engagement / actual damage
→ STOP
```

Threat policy powinna być wystarczająco konserwatywna, aby wilk przechodzący daleko od drogi nie anulował podróży.

V1 nie dodaje route danger prediction ani pre-computed safe routes.

## Stop conditions

Autopilot natychmiast kończy commitment przy:

- świadomym manualnym movement input gracza,
- realnym player damage (`applyPlayerDamage()` zwraca `finalDamage > 0`),
- player downed,
- fall from mount,
- mount death,
- mount unavailable,
- manual dismount,
- destination becoming invalid,
- route/waypoint execution becoming deterministically unreachable po wykorzystaniu istniejącego local navigation/repath lifecycle,
- explicit user cancel.

Camera/look input sam w sobie **nie** anuluje autopilota. Gracz musi móc rozglądać się podczas podróży.

Nie zatrzymywać autopilota wyłącznie dlatego, że threat został zauważony — to jest przypadek `escape`.

## Manual input ownership

Normalny input zawsze wygrywa z autopilotem.

Desktop/mobile powinny używać tej samej semantyki:

```text
meaningful manual movement intent
→ cancel autopilot
→ current frame or next safe movement tick belongs to player
```

Unikać sytuacji, w której autopilot i user input sumują wektory.

## Arrival

Arrival jest fizyczny, nie logiczny timer.

Autopilot kończy się dopiero po wejściu w odpowiedni existing destination-arrival radius / location semantics.

Reuse:

- settlement boundary/proximity semantics,
- cave entrance discovery/proximity semantics,
- canonical world-location coordinates/radii,
- istniejące interaction/location contracts, gdzie są lepszym ownerem niż nowy generic radius.

Po arrival:

- movement intent wraca do manualnego,
- state autopilota jest czyszczony,
- toast/HUD informuje o dotarciu,
- nie zmieniać quest/world state tylko dlatego, że działał autopilot.

## UI

V1 potrzebuje minimalnego UX:

- akcja „Podróżuj” dla wspieranego known destination,
- czytelny aktywny destination,
- cancel,
- stan `normal` / `escape`,
- komunikat arrival,
- komunikat interruption + reason.

Preferować istniejące map/location UI i `Toast` zamiast osobnego pełnoekranowego travel UI.

Nie projektować osobnej destination database w warstwie Vue.

## In-game alerts

Reuse `src/ui/createToast.ts`.

Przykładowe semantics:

```text
threat causes escape
→ "Zagrożenie na trasie — przyspieszasz."

actual damage / fall / route failure
→ "Autopilot zatrzymany — zaatakowano cię."
→ "Autopilot zatrzymany — spadłeś z wierzchowca."
→ "Autopilot zatrzymany — dalsza trasa jest niedostępna."
```

Nie spamować toastami przy każdym frame/ponownym sense tego samego threat episode.

## Notifications

V1 obejmuje dwa kanały:

1. **in-game notifications** przez istniejący Toast/HUD;
2. **browser/system notifications** przez `Notification API`, ale wyłącznie gdy aplikacja nadal działa w otwartej karcie/sesji.

Nie implementować w tym planie:

- Web Push,
- service-worker push delivery,
- backend subscription storage,
- VAPID/provider infrastructure,
- background/off-screen player travel.

### Notification permission

Permission request musi być user-driven i wykonywany w sensownym UX momencie, nie automatycznie przy starcie aplikacji.

Autopilot nie może zakładać, że permission jest dostępne.

Jeżeli:

```text
Notification.permission !== 'granted'
```

system nadal używa in-game toast/HUD i nie traktuje braku permission jako błędu podróży.

### When to emit a system notification

System notification ma sens tylko dla zdarzeń wymagających uwagi i tylko gdy karta nie jest aktywnie obserwowana, np.:

- autopilot zatrzymany przez realny atak/damage,
- player downed,
- fall from mount,
- mount death/unavailable,
- route failure.

Nie wysyłać system notification dla zwykłego `escape` przy pierwszym wykryciu zagrożenia, jeśli podróż nadal postępuje.

Arrival może używać system notification opcjonalnie, jeżeli karta jest ukryta/backgrounded.

Preferowany gate:

```text
document.visibilityState !== 'visible'
&& Notification.permission === 'granted'
→ emit system notification
```

Nie tworzyć background simulation tylko po to, aby generować notification events.

## Runtime and persistence

V1 autopilot jest transient player-control state.

Nie persistować:

- active itinerary,
- waypoint index,
- escape mode.

Save/load, New Game i WorldBundle rebuild powinny bezpiecznie anulować aktywny autopilot.

Powód: route commitment gracza nie jest world-state commitmentem analogicznym do `NpcTravelContinuity`. Persistowanie można dodać później, jeśli UX rzeczywiście tego wymaga.

Regional itinerary resolver sam pozostaje deterministic i może korzystać z istniejących derived road caches.

## WorldBundle / lifecycle

Autopilot nie może przechowywać stale references do:

- `ChunkManager`,
- settlement runtime objects,
- live mount objects poza istniejącym mount ownership,
- world-location runtime closures.

Po rebuild:

- aktywny autopilot zostaje anulowany;
- następna podróż resolve'uje aktualne world services;
- żadna trasa nie może wykonywać movementu na disposed bundle.

## Performance

Autopilot nie może powodować globalnego pathfindingu co frame.

Wymagane:

- regional itinerary resolve przy starcie/replanie, nie co tick;
- route geometry z istniejących road caches;
- current waypoint advancement O(1);
- local navigation tylko przez istniejący bounded/request-based mechanism;
- threat sensing przez istniejące bounded inputs;
- brak skanowania całego world-location catalogu albo wszystkich settlements co frame.

Replan regionalny tylko gdy realnie wymagany przez invalidation, nie przy każdym local stuck.

## Relationship to NPC/world travel

Nie podpinać player autopilota do `NpcTravelContinuity`.

Jednocześnie regionalny itinerary resolver ma być entity-neutral, aby później można było użyć:

```text
same regional road itinerary
├── player autopilot
├── detailed travelling NPC
├── merchant
├── courier
└── caravan
```

NPC nadal zachowują własny generic travel/off-screen ownership i adaptive simulation.

## Implementation boundaries

Prawdopodobne integration points potwierdzone na aktualnym `main`:

- `src/settlement/roadNetwork.ts` — canonical road graph/routes;
- nowy mały regional-itinerary module obok road ownership, jeśli wydzielenie poprawia granice odpowiedzialności;
- `src/player/PlayerController.ts` — explicit external movement intent seam;
- `src/app/actions/mountActions.ts` — mounted drive integration;
- `src/fauna/AnimalAgent.ts` — tylko przez istniejące `driveMounted()`, bez autopilot-specific ownership;
- `src/player/playerDamage.ts` — STOP po realnym damage;
- `src/ui/createToast.ts` — feedback;
- istniejące world-location / location-knowledge / map UI modules — destination eligibility i selection;
- app/game-loop wiring — lifecycle/tick orchestration bez przenoszenia całego feature state do God Object.

Implementation notes mają zweryfikować dokładne current call-sites po zamknięciu decyzji o push.

## Suggested stages

### Stage 1 — Regional itinerary contract

- entity-neutral multi-edge itinerary po istniejących road/path routes;
- known destination endpoint resolution;
- pure tests.

### Stage 2 — Walking autopilot

- transient autopilot state;
- PlayerController movement-intent seam;
- waypoint following;
- manual cancel;
- arrival;
- in-game feedback.

### Stage 3 — Mounted autopilot

- reuse tego samego itinerary/state;
- `MountActions → driveMounted()`;
- mount lifecycle/fall/dismount cancellation.

### Stage 4 — Threat urgency and interruption

- threat → `escape`;
- damage/combat/fall/unreachable → STOP;
- deduplicated alerts.

### Stage 5 — System notifications

- user-driven Notification permission flow;
- Notification API dla działającej sesji;
- emit tylko dla ważnych interruption/arrival events, gdy karta nie jest aktywnie obserwowana;
- brak Web Push i brak background-simulation hacków.

## Non-goals

- fast travel / teleport,
- arbitrary map-click destination,
- global navmesh,
- duplicate road graph,
- new local pathfinder,
- player-only road geometry,
- road danger scoring,
- weather-aware route choice,
- safe/fast route alternatives,
- dynamic road closures,
- off-screen player simulation,
- auto combat,
- auto interaction/loot,
- automatic rest/eat/drink itinerary,
- persistence of active autopilot in V1,
- caravan/merchant/NPC adoption in this implementation.

## Verification

### Automated

- multi-edge regional itinerary uses only canonical road/path legs;
- deterministic itinerary for same endpoints/world;
- failed road edge is not treated as traversable;
- destination unknown to player cannot start autopilot;
- waypoint advancement preserves order;
- manual movement cancels autopilot;
- look/camera input does not cancel;
- walking autopilot feeds the same movement pipeline as normal player locomotion;
- mounted autopilot feeds existing `driveMounted()`;
- threat changes `normal → escape` without changing destination/itinerary;
- clearing threat changes `escape → normal`;
- `finalDamage > 0` cancels;
- fall/death/unavailable/manual dismount cancels;
- arrival clears state exactly once;
- WorldBundle rebuild / dispose cannot leave a stale active executor.

### Browser/manual — User

- travel between two settlements follows visible road;
- multi-settlement journey takes correct successive road branches;
- destination reachable only through a path does not cut cross-country;
- walking collision/slope behaviour remains normal;
- horse follows same route and retains stamina/fall behaviour;
- nearby wolf causes run/gallop toward current route target;
- actual attack stops autopilot and returns control;
- camera can rotate freely during autopilot;
- WASD/mobile movement immediately returns control;
- arrival and interruption UI are clear and not spammy.

Browser verification is performed by the User, not the AI agent.

## Scope decision

Notification scope for V1 is resolved:

- in-game Toast/HUD;
- browser/system `Notification API` for an already running session when the tab is not actively observed;
- no Web Push;
- no service-worker push delivery;
- no background/off-screen player travel.

No further architectural decision is required for the core road-autopilot flow unless implementation notes discover current code contradicting this recon.

During implementation add JSDoc to important new architectural/public contracts needed for preflight discovery; use the appropriate `@domain` tag.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
