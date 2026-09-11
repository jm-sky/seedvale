# Seedvale — Companions Vision

## Cel

Towarzysze (companions) to NPC, którzy mogą pomagać graczowi, podróżować z nim lub związać z nim swoje życie, ale nadal pozostają częścią autonomicznego świata Seedvale.

Companion nie jest specjalnym typem NPC ani osobnym AI. Jest istniejącym mieszkańcem świata, którego aktualna relacja, zobowiązania i decyzje mogą związać go z graczem.

NPC nadal korzysta z tych samych systemów:

- needs, problems, goals i pressures,
- decisions, strategies i actions,
- personality i traits,
- schedules, places i households,
- professions i skills,
- relationships i reputation,
- storage/logistics,
- combat,
- persistence.

Gracz nie posiada towarzysza. NPC może zdecydować się pomóc, podróżować z graczem, wrócić do domu albo z czasem związać z graczem swoje miejsce życia.

---

## Główne zasady

1. **Companion nie jest specjalnym typem AI.** Istniejący NPC pełni określoną rolę wobec gracza.
2. **Towarzyszenie jest zobowiązaniem/trybem zachowania, nie zmianą tożsamości.** Ten sam mechanizm powinien obsługiwać krótką wyprawę i dłuższą relację.
3. **NPC zachowuje autonomię.** Potrzeby, zagrożenia, rodzina, praca i inne zobowiązania nadal wpływają na jego decyzje.
4. **Nie tworzymy specjalnych „rekrutowalnych NPC”.** Kandydaci wynikają z normalnej populacji, wieku, sytuacji życiowej, personality, traits, relacji i reputacji gracza.
5. **Pomocnik, wynajęty uczestnik wyprawy i stały Companion to różne role/stany relacji.** Nie muszą być liniowymi poziomami progresji.
6. **Gracz nie jest centrum świata.** NPC funkcjonuje również bez gracza i kamery, a po zakończeniu zobowiązania wraca do własnego życia.
7. **Wspólne doświadczenia mają konsekwencje.** Podróż, praca, walka, pomoc, porażki i zachowanie gracza mogą wpływać na relację i przyszłe decyzje NPC.
8. **Reuse first.** Follow, combat, work, construction, farming, needs, relations i contracts powinny rozszerzać istniejące mechanizmy zamiast tworzyć Companion-specific odpowiedniki.

---

## Jak NPC zaczyna towarzyszyć graczowi

Towarzyszenie powinno mieć wiele przyczyn, ale prowadzić do jednego wspólnego mechanizmu wykonawczego: czasowego `accompany/follow commitment` obsługiwanego przez normalną symulację NPC.

### A. Płatna wyprawa / escort

Gracz może zaoferować NPC zapłatę za towarzyszenie przez określony czas lub do spełnienia warunku wyprawy.

To jest naturalne rozszerzenie światowego systemu Work Contracts, a nie osobny system rekrutacji companionów.

NPC ocenia ofertę na podstawie m.in.:

- wynagrodzenia,
- przewidywanego czasu wyprawy,
- odległości od domu,
- zagrożenia,
- własnych potrzeb,
- obowiązków zawodowych i householdowych,
- innych zobowiązań,
- personality i traits,
- relacji z graczem,
- reputacji i renown gracza.

Przykładowo NPC może zgodzić się na jednodniową wyprawę, ale odmówić tygodniowej podróży, ponieważ ma rodzinę, pracę albo uważa cel za zbyt niebezpieczny.

Po zakończeniu umówionego zobowiązania NPC wraca do normalnego życia, chyba że inne realne decyzje i relacje prowadzą do dalszego wspólnego działania.

### B. Dobrowolna wyprawa

NPC może chcieć dołączyć bez zapłaty.

Szczególnie naturalne jest to dla młodych mieszkańców stojących przed decyzjami dotyczącymi własnego życia, ale wiek nie powinien być jedynym warunkiem.

Istotne mogą być:

- młody wiek / mała liczba trwałych zobowiązań,
- `curious`,
- wysoka openness,
- extraversion / agreeableness zależnie od sytuacji,
- osobista relacja z graczem,
- renown gracza,
- reputacja gracza, szczególnie courage, competence i trust,
- zainteresowanie celem wyprawy,
- dotychczasowe wspólne doświadczenia,
- brak pilniejszych potrzeb, obowiązków i zagrożeń.

NPC nie powinien dołączać dlatego, że został oznaczony jako „recruitable”. Powinien dojść do decyzji na podstawie własnego stanu i wiedzy.

Przykładowy przebieg:

```text
young villager
    ↓
curious + high openness
    ↓
knows / hears about reputable player
    ↓
voluntarily joins a short expedition
    ↓
shared travel / work / combat
    ↓
relationship and experience change
    ↓
returns home
    ↓
may join again later
    ↓
may eventually decide to change household / place of life
```

### Jedna warstwa wykonawcza

Źródło zobowiązania i samo towarzyszenie są osobnymi pojęciami:

```text
paid Work Contract ───────┐
                          ├── accompany/follow commitment ── normal NPC decisions/actions
voluntary social decision ┘
```

Nie należy implementować osobnego `PaidCompanion`, `VolunteerCompanion` ani dwóch systemów follow.

---

## Młodzi mieszkańcy i decyzje życiowe

Świat może generować młodych mieszkańców, którzy mają większą szansę rozważać podróż, pracę poza domem lub zmianę miejsca życia. Nie powinni jednak istnieć wyłącznie jako pula rekrutów dla gracza.

Młody mieszkaniec może:

- pomagać householdowi,
- uczyć się lub wykonywać profesję,
- szukać płatnej pracy,
- wyruszyć z graczem za pieniądze,
- dołączyć z ciekawości,
- odmówić wyprawy,
- później założyć własny household,
- przenieść się gdzie indziej,
- z czasem stracić zainteresowanie podróżami.

Dzięki temu powrót do tej samej osady po dłuższym czasie może zastać potencjalnego dawnego towarzysza w zupełnie innej sytuacji życiowej.

---

## Relacja i przywiązanie

Towarzyszenie nie powinno być jednorazowym przełącznikiem `recruited = true`.

Wspólne wydarzenia mogą wpływać na istniejącą relację Player↔NPC i przyszłe decyzje. Długoterminowo model relacji może wymagać bogatszych aspektów niż pojedyncza sympatia, np. trust lub attachment, ale powinny to być ogólne właściwości relacji Player↔NPC, nie `CompanionBondSystem`.

Znaczenie mogą mieć m.in.:

- dotrzymywanie umów i płatności,
- wzajemna pomoc,
- wspólna praca,
- wspólna walka i zagrożenia,
- porzucenie rannego NPC,
- zapewnienie jedzenia, wody i schronienia,
- długość wspólnej podróży,
- zachowanie wobec householdu i osady NPC.

Silna relacja może zwiększać gotowość do kolejnych wypraw lub w przyszłości doprowadzić do decyzji o trwałej zmianie miejsca życia. Nie powinna jednak gwarantować bezwarunkowego posłuszeństwa.

---

## Role wobec gracza

### Pomocnik / dostawca

NPC pozostaje członkiem swojego householdu i prowadzi własne życie, ale może realizować dodatkowe cele związane z graczem, np. dostarczać jedzenie, wodę, drewno lub inne zasoby do player storage.

### Tymczasowy uczestnik wyprawy

NPC zachowuje dotychczasowy household i miejsce życia, ale przez określony czas lub do zakończenia celu posiada zobowiązanie `accompany/follow`. Może dołączyć odpłatnie albo dobrowolnie.

Po zakończeniu wyprawy normalnie wraca do domu i rutyny.

### Companion związany z graczem

Długoterminowo NPC może zdecydować się związać swoje życie z miejscem gracza. Może opuścić dotychczasowy household, otrzymać nowe miejsce życia przy obozie/domu i nadal posiadać potrzeby, profesję, relacje i autonomiczne działania.

Nie jest wymagane przejście Pomocnik → Tymczasowy uczestnik → Companion. Są to różne możliwości wynikające ze świata i relacji.

---

## Zachowanie podczas wyprawy

Towarzysz nie powinien ślepo kopiować pozycji gracza.

`follow` jest zachowaniem nawigacyjnym podporządkowanym szerszej decyzji o wspólnej podróży. NPC nadal może reagować na:

- krytyczny głód lub pragnienie,
- zmęczenie,
- obrażenia,
- bezpośrednie zagrożenie,
- walkę,
- potrzebę ucieczki,
- dostępne jedzenie/wodę,
- zgubienie gracza lub niemożliwą trasę.

Powinien móc utrzymywać dystans, zatrzymać się, walczyć, uciekać, odpocząć i później wznowić podróż zgodnie z normalnym decision/action pipeline.

---

## Wspólne aktywności

Towarzyszenie powinno pozwalać wykorzystywać istniejące kompetencje NPC podczas realnych działań świata:

- walka i obrona,
- budowa przez actor-neutral work contribution,
- uprawa i praca w ogrodzie/polu,
- polowanie,
- łowienie,
- zbieranie zasobów,
- transport,
- praca obozowa,
- gotowanie / produkcja,
- korzystanie ze storage,
- odpoczynek i zaspokajanie potrzeb.

Profesja, personality, traits i skills powinny wpływać na to, co konkretny NPC robi dobrze i jakie działania wybiera.

---

## Defense i combat

Towarzysz korzysta z istniejącego NPC Combat System. Relacja lub aktualne zobowiązanie może dodawać presję do ochrony gracza lub innych członków grupy, ale nie gwarantuje samobójczej walki.

NPC może walczyć, osłaniać, ścigać, wycofać się lub uciec zależnie od zagrożenia, zdrowia, personality i pozostałych pressures.

---

## Camp / household

Stały Companion może otrzymać miejsce życia przy player camp / house i korzystać ze wspólnego storage.

Nie należy tworzyć `CompanionHomeSystem`. Namiot, dom lub obóz powinien być istniejącym `place`, a NPC powinien korzystać z normalnego modelu places, householdów i schedules.

---

## Multiple companions / party

W przyszłości kilku NPC może jednocześnie podróżować lub żyć z graczem.

Każdy pozostaje osobnym autonomicznym NPC z własnymi:

- potrzebami,
- relacjami,
- personality,
- rolą/profesją,
- zobowiązaniami,
- decyzjami.

Grupa nie powinna stać się centralnym managerem sterującym NPC. Relacje pomiędzy jej członkami mogą również wpływać na zachowanie grupy.

---

## Docelowy model

```text
NPC
+
relationship with player
+
current commitments
+
place / household
+
profession / roles
+
needs + pressures
+
personality + traits
+
skills
+
autonomy
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

---

## Poza zakresem wizji

Nie zakładamy:

- klasycznego RPG party management,
- NPC istniejących tylko jako rekruci,
- inventory UI sterowanego jak w klasycznym party RPG,
- osobnego levelowania companionów,
- teleportowania companionów do gracza,
- magicznego natychmiastowego podążania,
- bezwarunkowego posłuszeństwa,
- zastępowania NPC simulation przez companion scripts,
- LLM sterującego zachowaniem companionów.

---

## Zasada projektowa

**Towarzysz nie jest NPC-em, którego gracz posiada.**

Jest NPC-em, który ma własne życie i może zdecydować się na wspólną pracę, wyprawę albo trwałą zmianę tego życia w wyniku relacji z graczem i rzeczywistych wydarzeń świata.
