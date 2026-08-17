# Plan: Mobile Combat — Forgiving Target Acquisition & Auto-Facing

**Created:** 2026-08-17
**Status:** `verification needed` 🔍
**Priority:** medium · **Effort:** S
**Depends on:** ~~123~~ ~~124~~

domain: `ui-input`
tags: [items-player, fauna]

## Cel

Ułatwić melee combat na urządzeniach mobilnych bez tworzenia osobnego systemu combat i bez zmiany zachowania desktopu.

Problem wynika głównie z konieczności jednoczesnego sterowania ruchem, kamerą i kierunkiem postaci na ekranie dotykowym. Istniejący combat ma już target acquisition oraz walidację trafienia, dlatego plan rozszerza istniejący mechanizm zamiast tworzyć równoległy system.

Docelowy flow mobile:

    mobile attack input
        ↓
    existing combat target acquisition
        ↓
    bardziej wyrozumiały wybór celu
        ↓
    auto-facing do wybranego celu
        ↓
    istniejący requestAttack / melee state machine

---

## Stan obecny

Istnieją już:

- `pickCombatTarget()` z istniejącym zasięgiem i cone;
- pamięć ostatnich celów;
- istniejący melee state machine (`windUp → hitWindow → recovery`);
- istniejący gap-close podczas ataku;
- istniejący hit detection oparty o dystans i facing arc;
- integracja melee z mobile touch input.

Nie należy zastępować tych mechanizmów nowym target managerem ani osobnym mobile combat.

---

# Zakres

## 1. Mobile-specific target acquisition

Istniejący `pickCombatTarget()` powinien pozostać źródłem wyboru celu.

Dla mobile zwiększyć tolerancję wyboru celu tak, aby gracz nie musiał idealnie ustawiać kamery/postaci na przeciwniku.

Dokładne wartości powinny zostać dobrane na podstawie obecnych stałych i browser verification.

Preferowana strategia:

- mobile może używać szerszego cone niż desktop;
- ewentualnie może używać niewielkiego dodatkowego zakresu target acquisition;
- desktop zachowuje obecne wartości;
- nadal wybierany jest sensowny, najbliższy cel zgodnie z istniejącym rankingiem.

Nie tworzyć drugiego algorytmu targetowania, jeżeli istniejący może przyjąć parametr/tryb mobile.

### Ważne

Tolerancja ma ułatwić wybór celu, ale nie może powodować przypadkowego atakowania zwierząt znajdujących się wyraźnie poza kierunkiem działania gracza.

---

## 2. Auto-facing

Po wybraniu celu przez mobile combat gracz powinien zostać automatycznie obrócony w stronę celu przed wykonaniem ataku.

Auto-facing powinien:

- działać tylko dla mobile;
- działać w bezpośrednim związku z rozpoczęciem ataku;
- wykorzystać istniejącą rotację/yaw `PlayerController`;
- nie tworzyć osobnego systemu orientacji;
- nie zmieniać pozycji gracza;
- nie zastępować istniejącego gap-close.

Preferowany efekt:

    player taps attack
        ↓
    target acquired
        ↓
    player faces target
        ↓
    existing requestAttack()

Nie obracać gracza stale podczas poruszania się ani podczas samego celowania. Gracz nadal ma zachować kontrolę nad ruchem.

---

# Architektura

Rozszerzyć istniejącą ścieżkę:

    TouchControls
        ↓
    existing combat input
        ↓
    mobile target acquisition
        ↓
    optional auto-facing
        ↓
    existing melee combat

Nie dodawać:

- nowego `MobileCombatManager`;
- drugiego systemu targetów;
- auto-combat;
- ciągłego lock-on;
- nowej logiki damage/hit detection;
- nowych stanów melee tylko dla mobile.

Jeżeli istniejące API wymaga zmiany, preferować małe parametry/argumenty zamiast duplikowania funkcji.

---

# Desktop regression

Desktop powinien zachować obecne zachowanie:

- ten sam target acquisition;
- ten sam cone/range;
- brak auto-facing, jeżeli obecnie go nie ma;
- ten sam melee timing;
- ten sam hit detection;
- ten sam gap-close.

Mobile-specific behaviour nie powinien przeciekać do wspólnego desktopowego flow.

---

# Pliki / obszary do sprawdzenia

Przed implementacją ponownie zweryfikować aktualne ścieżki i użyć istniejących mechanizmów:

- `src/player/playerMelee.ts` — `pickCombatTarget()`, `requestAttack()` i combat state;
- `src/input/createTouchControls.ts` — mobile input;
- `src/app/gameLoop.ts` — integracja touch input z melee;
- `src/app/interactables.ts` — `buildCombatTarget()`;
- `src/player/PlayerController.ts` — istniejąca rotacja/yaw;
- ewentualne typy/input API powiązane z `TouchControls`.

Nie wykonywać niezwiązanych refaktorów.

---

# Balans / UX

Celem nie jest ułatwienie combat do poziomu auto-combat.

Gracz nadal powinien:

- podejść do przeciwnika;
- zdecydować kiedy zaatakować;
- wybrać przeciwnika głównie przez kierunek, w którym patrzy/prowadzi postać.

Zmniejszamy tylko koszt precyzyjnego ustawienia palcem.

Auto-facing powinien być na tyle szybki, aby atak nie wyglądał jak oczekiwanie na animację obrotu.

Nie zmieniać obrażeń, staminy, cooldownów ani timingów bez osobnego uzasadnienia.

---

# Testy

## Unit / logic

Jeżeli istnieją testy target acquisition, rozszerzyć je o:

- desktop zachowuje obecne granice;
- mobile ma szerszą tolerancję;
- cel poza rozsądnym kierunkiem nadal nie jest wybierany;
- ranking wielu potencjalnych celów pozostaje deterministyczny;
- auto-facing wylicza prawidłowy kierunek do celu;
- brak celu nie powoduje zmiany kierunku gracza.

Jeżeli istniejąca architektura nie ma odpowiednich testów jednostkowych dla tych prostych operacji, nie tworzyć dużego frameworka testowego tylko dla tego planu.

---

# Browser verification

Obowiązkowo zweryfikować w browserze na mobile viewport/touch emulation:

1. Atakowanie pojedynczego zwierzęcia z różnych kątów.
2. Atakowanie celu znajdującego się lekko poza obecnym cone.
3. Kilka zwierząt obok siebie — wybrany jest sensowny cel.
4. Cel poza rozsądnym kierunkiem — nie jest przypadkowo wybierany.
5. Auto-facing przed atakiem.
6. Ruch + atak nie powoduje utraty kontroli nad graczem.
7. Istniejący gap-close nadal działa.
8. Hit detection i damage pozostają bez zmian.
9. Desktop combat nie zmienił zachowania.

Sprawdzić również brak nowych per-frame kosztów wynikających z ciągłego targetowania lub obracania gracza.

---

# Out of scope

Nie dodawać w tym planie:

- osobnego Attack button;
- hold-to-attack;
- pełnego auto-combat;
- stałego lock-on targetu;
- dodge/roll;
- zmian combat damage/balance;
- zmian stamina/cooldown/timing;
- zmian hit detection;
- zmian desktop controls;
- nowego systemu mobile combat.

---

# Rezultat

Mobile melee powinien wymagać mniej precyzyjnego sterowania, ale nadal pozostawać aktywnym combatem:

    mniej precyzyjne ustawianie palcem
        ↓
    łatwiejszy wybór sensownego celu
        ↓
    automatyczne skierowanie postaci
        ↓
    ten sam deterministyczny melee combat

Desktop pozostaje bez zmian.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
