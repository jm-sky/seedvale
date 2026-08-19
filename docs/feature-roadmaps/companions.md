# Seedvale — Companions Roadmap

## Cel

Towarzysze (companions) to NPC, którzy mogą pomagać graczowi, ale nadal pozostają częścią autonomicznego świata Seedvale.

Nie tworzymy osobnego „Companion AI”. Towarzysze powinni wykorzystywać istniejące systemy NPC:

- needs,
- problems,
- goals,
- pressures,
- decisions,
- strategies,
- actions,
- schedules,
- places,
- households,
- professions,
- relationships,
- storage/logistics,
- combat,
- skills.

NPC nadal powinien być autonomicznym mieszkańcem świata. Relacja z graczem oraz jego aktualna rola zmieniają jego priorytety i dostępne działania.

---

## Główne zasady

1. **Companion nie jest specjalnym typem AI.**
   Jest istniejącym NPC-em pełniącym określoną rolę wobec gracza.

2. **Pomocnik i Companion to różne role.**
   Nie są kolejnymi poziomami jednej ścieżki i mogą istnieć niezależnie przez całą grę.

3. **NPC zachowuje autonomię.**
   Nadal ma własne potrzeby, profesję, harmonogram, relacje i zachowania.

4. **Nie tworzymy równoległych systemów.**
   Companion korzysta z istniejących mechanizmów NPC, storage, logistics, combat i skills.

5. **Gracz nie musi być centrum zachowania NPC.**
   Companion powinien móc funkcjonować również wtedy, gdy gracz jest daleko lub go nie obserwuje.

6. **Funkcje companionów powinny być niezależnymi możliwościami.**
   Obrona, follow, role, specjalizacje i skills nie muszą być liniowymi etapami rozwoju jednego systemu.

---

# Role

## 1. Pomocnik / dostawca

Istniejący NPC pozostaje członkiem swojego householdu i nadal prowadzi własne życie.

Może jednocześnie mieć dodatkowy cel związany z graczem, np.:

> Zbierz jedzenie do skrzyni gracza.

NPC:

- nadal mieszka w swojej wiosce,
- nadal wykonuje swoją profesję,
- nadal realizuje własne potrzeby,
- nadal ma swój schedule,
- może przeznaczać część zasobów lub nadwyżek dla gracza,
- dostarcza je do wskazanego player storage.

Ta rola może pozostać niezależna od systemu Companion przez całą grę.

### Przykłady przyszłych zadań

- dostarczanie jedzenia,
- dostarczanie wody,
- dostarczanie drewna,
- dostarczanie innych zasobów,
- transport określonych przedmiotów.

---

## 2. Companion

NPC zostaje dedykowany do życia razem z graczem.

Może:

- opuścić swój dotychczasowy household,
- przestać być jego członkiem,
- otrzymać nowe miejsce życia przy graczu,
- mieszkać przy namiocie, domu lub obozie gracza,
- nadal posiadać potrzeby,
- nadal posiadać profesję,
- nadal wykonywać własne czynności,
- posiadać własne relacje i zachowania.

Companion nie jest więc „NPC-em bez własnego życia”.

Jego życie po prostu zostaje związane z miejscem i sytuacją gracza.

**Nie jest wymagane przejście Pomocnik → Companion.**

NPC może pozostać Pomocnikiem, a inny NPC może zostać Companionem.

---

# Roadmap

## Etap 0 — Player Storage

To plan `docs/plans/2026-08-19--164--player-storage-and-container-system.md`

### Cel

Zapewnić miejsce, do którego NPC może dostarczać zasoby dla gracza.

### Wymagania

- player storage / skrzynia,
- istniejący system storage,
- możliwość wskazania storage jako celu transportu,
- wykorzystanie istniejącego logistics zamiast tworzenia specjalnego Companion Storage.

### Zasada

Skrzynia gracza powinna być normalnym elementem systemu storage, który może być używany również przez inne systemy świata.

---

# Etap 1 — Pomocnik / dostawca

### Cel

Pozwolić istniejącemu NPC pomagać graczowi bez zmiany jego życia.

### Zakres

NPC otrzymuje dodatkowy cel lub presję:

> Zbierz jedzenie do skrzyni gracza.

Przykładowy przepływ:

```text
NPC state
  ↓
needs + household duties + profession
  ↓
additional pressure from player relationship
  ↓
decision
  ↓
gather food / water
  ↓
transport
  ↓
player storage
```

NPC nadal:

- mieszka w swoim householdzie,
- pracuje,
- realizuje własne potrzeby,
- wykonuje swój schedule,
- może pomagać graczowi tylko wtedy, gdy pozwala na to jego sytuacja.

### Priorytet

Pomoc graczowi nie powinna automatycznie oznaczać ignorowania własnych potrzeb NPC.

Przykładowo:

```text
własne potrzeby
    >
household duties
    >
profession
    >
pomoc graczowi
```

Dokładne priorytety powinny wynikać z istniejącego systemu pressures/decision making, a nie z hardcoded Companion AI.

### Możliwe rozszerzenia

- jedzenie,
- woda,
- drewno,
- inne zasoby,
- określone przedmioty,
- okresowe dostawy.

---

# Etap 2 — Companion Household / Camp

### Cel

Umożliwić NPC życie przy graczu.

### Zakres

Companion:

- opuszcza dotychczasowy household,
- otrzymuje nowe miejsce życia,
- otrzymuje miejsce przy player camp / house,
- może korzystać ze wspólnego storage,
- nadal posiada własne potrzeby,
- nadal posiada profesję,
- nadal wykonuje normalne akcje NPC.

### Ważne

Nie należy tworzyć specjalnego „Companion Home System”.

Namiot/dom/obóz powinien być istniejącym `place`, a companion powinien korzystać z istniejącego modelu NPC places i schedule.

---

# Etap 3 — Companion Activities

### Cel

Rozszerzyć codzienne życie companionów.

Możliwe aktywności:

- zbieranie zasobów,
- polowanie,
- łowienie,
- praca,
- gotowanie / produkcja,
- transport,
- pomoc przy obozie,
- korzystanie ze storage,
- odpoczynek,
- zaspokajanie własnych potrzeb.

Companion powinien podejmować decyzje na podstawie:

- potrzeb,
- presji,
- profesji,
- umiejętności,
- miejsca,
- relacji,
- dostępnych zasobów,
- aktualnej sytuacji świata.

---

# Etap 4 — Companion Defense

## Wymaganie

**NPC Combat System**

### Cel

Companion może chronić gracza lub jego miejsce życia.

### Możliwości

- obrona obozu,
- obrona domu,
- reagowanie na zagrożenia,
- walka z agresywnymi NPC/zwierzętami,
- ochrona gracza,
- patrolowanie określonego obszaru.

### Zasada

Companion powinien wykorzystywać istniejące:

- threat,
- health,
- combat,
- damage,
- flee/chase,
- NPC decision making.

Nie tworzyć osobnego systemu walki tylko dla companionów.

---

# Etap 5 — Follow

### Cel

Companion może czasowo towarzyszyć graczowi poza obozem.

### Zakres

- tryb follow,
- utrzymywanie dystansu,
- ruch za graczem,
- reagowanie na przeszkody,
- zatrzymywanie się w odpowiednich sytuacjach,
- możliwość pozostania w miejscu,
- powrót do obozu,
- przełączanie między normalnym życiem i follow.

### Ważne

`follow` jest **trybem zachowania**, a nie zmianą tożsamości NPC.

Po zakończeniu follow NPC wraca do swojej normalnej rutyny.

---

# Etap 6 — Roles & Specializations

## Niezależny kierunek

Role i specjalizacje nie muszą czekać na poprzednie etapy.

Mogą być rozwijane również dla zwykłych NPC.

### Przykładowe role

- myśliwy,
- zbieracz,
- drwal,
- rybak,
- obrońca,
- medyk,
- zwiadowca,
- farmer,
- rzemieślnik.

### Specjalizacja

Specjalizacja powinna wpływać na:

- wybór działań,
- priorytety,
- dostępne działania,
- efektywność,
- zachowanie NPC.

Nie powinna tworzyć osobnego AI dla każdej specjalizacji.

---

# Etap 7 — Skills

## Niezależny kierunek

Skills również mogą być rozwijane niezależnie od Companion System.

### Przykłady

- gathering,
- hunting,
- fishing,
- combat,
- first aid,
- medicine,
- crafting,
- survival,
- navigation.

Skills powinny modyfikować istniejące działania.

Przykład:

```text
NPC
  ↓
first aid action
  ↓
First Aid skill
  ↓
skuteczność / czas / rezultat
```

Nie:

```text
CompanionFirstAidSystem
```

---

# Etap 8 — Multiple Companions / Party

### Cel

Umożliwić więcej niż jednego companion NPC.

### Możliwe funkcje

- kilku companionów,
- różne role,
- różne specjalizacje,
- wspólne storage,
- współpraca,
- konflikty priorytetów,
- relacje między companionami,
- różne zachowania podczas podróży,
- autonomiczne działanie grupy.

### Zasada

Drużyna nie powinna stać się centralnym managerem sterującym NPC.

Każdy NPC nadal podejmuje własne decyzje.

---

# Zależności

```text
                    ┌── Pomocnik / dostawca
                    │
Player Storage ─────┤
                    │
                    └── Companion
                              │
                              ├── Camp / Household
                              │
                              ├── Activities
                              │
                              ├── Defense ── requires NPC Combat
                              │
                              └── Follow
```

Role i skills:

```text
NPC
 ├── Roles / Specializations
 └── Skills

         ↓

Pomocnik / Companion / zwykły NPC
```

Nie powinny być uzależnione od całej roadmapy Companion.

---

# Docelowy model

Companion powinien być przede wszystkim:

```text
NPC
+
relacja z graczem
+
miejsce życia
+
role / profession
+
needs
+
skills
+
autonomia
```

a nie:

```text
Player
  ↓
CompanionManager
  ↓
CompanionAI
  ↓
CompanionCommands
```

Celem jest rozszerzenie istniejącej symulacji NPC, a nie stworzenie równoległego systemu sterowania drużyną.

---

# Poza zakresem

Na tym etapie roadmapa nie zakłada:

- klasycznego RPG party management,
- inventory UI sterowanego jak w RPG,
- levelowania companionów jako osobnego systemu,
- teleportowania companionów do gracza,
- magicznego natychmiastowego podążania,
- zastępowania NPC simulation przez skrypty companionów,
- LLM sterującego zachowaniem companionów,
- multiplayer-specific companion architecture.

Jeżeli przyszły multiplayer będzie wymagał zmian, istniejące NPC/relationship/role systems powinny być możliwie łatwe do współdzielenia.

---

# Zasada projektowa

**Towarzysz nie jest NPC-em, którego gracz posiada.**

Jest NPC-em, który **ma relację z graczem i może zdecydować się pomagać mu lub żyć z nim**, pozostając częścią tego samego świata i tej samej symulacji.
