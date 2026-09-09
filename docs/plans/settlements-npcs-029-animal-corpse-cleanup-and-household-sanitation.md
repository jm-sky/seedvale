# Plan: Animal Corpse Cleanup & Household Sanitation

**Created:** 2026-09-09
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** none
**Domain:** `settlements-npcs`
**Subdomains:** `household` `logistics`
**Tags:** `corpse` `cleanup` `sanitation`

## Cel

Sprawić, aby mieszkańcy osady reagowali na martwe zwierzęta pozostające w pobliżu zabudowy.

Zwłoki szczurów po pladze, wilków po ataku oraz innych zwierząt nie powinny być ignorowane aż do naturalnego rozkładu. Obecność zwłok w lokalnym kontekście osady ma stać się problemem sanitation, za który odpowiedzialność przejmuje najbliższy odpowiedni household, a faktycznego wykonawcę wybiera istniejący NPC decision/work/action pipeline.

Docelowy flow:

```text
animal dies inside / near settlement
  ↓
existing fauna corpse lifecycle
  ↓
fresh / rotting / bones
  ↓
settlement sanitation problem
  ↓
nearest responsible household
  ↓
eligible household member
  ↓
pressure / decision arbitration
  ↓
claim corpse
  ↓
approach + timed cleanup
  ↓
existing fauna burial / terminal transition
```

Mechanizm ma być generyczny. Nie implementować osobnych ścieżek dla plagi szczurów, watahy wilków, konkretnego questa ani konkretnego gatunku.

## Istniejące mechanizmy do wykorzystania

### Animal corpse lifecycle

Fauna posiada authoritative lifecycle zwłok w `src/fauna/animalCorpse.ts`. `AnimalCorpseState` przechowuje fazę decay oraz stan burial/processing. Fauna pozostaje właścicielem corpse state.

Nie tworzyć:

- settlement corpse registry,
- household corpse state,
- kopii corpse lifecycle po stronie NPC.

`src/shared/corpseLifecycle.ts` pozostaje małym wspólnym kontraktem faz rozkładu, nie globalnym corpse managerem.

### NPC work / decisions

Cleanup nie jest `NeedId`.

Powinien wejść jako lokalny world/household problem lub pressure candidate do istniejącego NPC arbitration → plan → action lifecycle. Nie tworzyć `CorpseCleanupManager`, osobnego schedulera sprzątania ani cleanup-only AI loop.

## 1. Corpse eligibility

Animal corpse staje się kandydatem do settlement cleanup, jeżeli:

- zwierzę jest martwe,
- corpse nadal istnieje w fauna lifecycle,
- corpse nie jest już buried/removed/terminal,
- znajduje się wewnątrz settlement albo w rozsądnym lokalnym influence area zabudowy,
- nie jest skutecznie obsługiwane przez innego NPC,
- wykonanie pracy jest możliwe na aktualnym poziomie symulacji.

Mechanizm powinien działać dla wszystkich kwalifikujących się gatunków, w tym wildlife, pest animals i padłego livestock.

Cleanup musi obejmować nie tylko świeże zwłoki, ale również istniejące `rotting` i `bones`/remains, jeżeli aktualny fauna corpse contract nadal pozwala je usunąć lub zakopać.

## 2. Settlement sanitation problem

Obecność kwalifikującego się corpse ma generować lokalny problem:

```text
animal corpse/remains in settlement influence area
→ sanitation / corpse cleanup problem
```

Nie tworzyć persisted problem state, jeśli może być deterministycznie odtworzony z istniejącego animal corpse state, pozycji corpse, settlement spatial context i household state.

Preferować re-derivation po stream/reload. Dzięki temu nadal istniejące zwłoki mogą ponownie wygenerować problem bez dodatkowego save state.

## 3. Wybór odpowiedzialnego household

Domyślnie odpowiedzialność przypisać household znajdującemu się najbliżej corpse.

Preferowany model v1:

```text
eligible corpse
→ nearest eligible household home / anchor
→ responsible household
```

Household jest źródłem odpowiedzialności, nie bezpośrednim wykonawcą pracy.

Jeżeli brak kwalifikującego się household, corpse pozostaje w normalnym fauna lifecycle.

Wynik wyboru przy równych odległościach musi być deterministyczny.

## 4. Wybór wykonawcy i pressure

Spośród członków odpowiedzialnego household wybierany jest NPC, który:

- jest żywy,
- może wykonywać pracę,
- jest dostępny zgodnie z istniejącymi regułami NPC work/decision,
- może dotrzeć do corpse,
- nie wykonuje ważniejszej aktywności.

Nie kodować reguły `nearest NPC always cleans`.

Cleanup powinien konkurować z innymi aktywnościami przez istniejącą arbitraż.

Pressure powinno uwzględniać co najmniej stan corpse:

- `rotting` — wysoki priorytet sanitation,
- `fresh` — normalny priorytet,
- `bones`/remains — niższy priorytet, ale nadal wymagający uprzątnięcia w osadzie.

Wiele corpse w tym samym lokalnym obszarze może zwiększać lokalną presję sanitation, ale nie dodawać w tym planie pełnego hygiene/health systemu.

## 5. Claim / coordination

Jedno corpse może mieć najwyżej jednego aktywnego cleanup executora.

Wymaganie:

```text
one corpse
→ at most one active cleanup claim
→ at most one successful disposal transition
```

Najpierw sprawdzić istniejące fauna corpse claim semantics i inne action reservation patterns. Rozszerzyć istniejący mechanizm, jeśli semantyka na to pozwala, zamiast tworzyć settlementowy lock manager.

Claim może pozostać transient, jeżeli po reconstruction problem można bezpiecznie ponownie wyprowadzić i ponownie rozstrzygnąć bez duplikacji konsekwencji.

Przed finalizacją zawsze rewalidować authoritative corpse state.

## 6. NPC action chain

Cleanup ma używać istniejącego navigation/action lifecycle:

```text
select corpse
→ claim
→ resolve approach destination
→ goTo
→ timed cleanup interaction
→ authoritative burial/disposal transition
→ complete / release
```

Nie tworzyć corpse-specific pathfinding ani osobnego FSM.

Jeżeli corpse zniknie, zostanie zjedzone, zakopane przez gracza, naturalnie usunięte albo stanie się niedostępne, action ma użyć istniejącego cancellation/failure/replanning lifecycle i nie pozostawić NPC w stuck state.

## 7. Burial / disposal result

W v1 wystarczy zakopanie zwłok na miejscu. NPC nie musi przenosić corpse, szukać cmentarza ani tworzyć grobu.

Finalizacja ma używać istniejącego authoritative fauna corpse burial/terminal contract zamiast ręcznie usuwać mesh lub tworzyć osobny cleanup state.

Jeżeli istniejąca player burial action posiada reusable domain-level operation, wykorzystać ją lub wyciągnąć minimalny wspólny operation tak, aby player i NPC kończyli się tym samym transition w fauna corpse state.

Nie wiązać animal sanitation z `npc-011`: pochówek zmarłego NPC jest reakcją społeczną i może tworzyć persistent grave, natomiast martwe zwierzę w osadzie jest problemem porządkowym.

## 8. Tools

W v1 nie wymagać fizycznego posiadania łopaty przez household, jeżeli obecny NPC work system nie posiada już stabilnego generic tool acquisition flow pozwalającego zrobić to bez nowej logistyki.

Timed burial action może być abstrakcją pracy.

Jeżeli aktualny NPC item/tool capability pozwala bez dodatkowego subsystemu wymagać shovel, wykorzystać istniejący mechanizm.

Nie dodawać w tym planie household tool procurement, borrowing, tool reservations ani nowych inventory transfer flows.

## 9. Multiple corpses

Mechanizm musi poprawnie obsługiwać sytuacje typu:

```text
rat infestation
→ many rat corpses

wolf attack
→ several wolf corpses
```

Nie tworzyć jednego długiego planu zawierającego listę wszystkich corpse.

Preferować:

```text
clean one corpse
→ reevaluate sanitation problem
→ select next corpse if still appropriate
```

Zapobiega to stale plans i upraszcza współdziałanie z natural decay, player interaction i corpse feeding.

Przy wyborze kolejnego celu można preferować bardziej zaawansowany decay i bliskość zabudowy, a następnie koszt dotarcia wykonawcy, o ile można to wpiąć w istniejący scoring bez osobnego subsystemu.

## 10. Relacja z NPC burial

`npc-010` / `npc-011` dotyczą NPC death/corpse lifecycle oraz społecznej reakcji na śmierć NPC, burial i graves.

Ten plan wykorzystuje podobny istniejący wzorzec world problem → pressure → decision → action, ale zachowuje rozdzielone znaczenie:

```text
dead NPC
→ social burial / grave       ← npc-011

dead animal in settlement
→ sanitation cleanup/burial   ← settlements-npcs-029
```

Nie tworzyć jednego generycznego `bury anything` managera.

## 11. World independence

Mechanizm nie może zależeć od player proximity, camera visibility, questa ani aktywnego UI.

Jeżeli settlement/NPC jest aktualnie symulowany, cleanup powinien wystąpić bez udziału gracza.

Plan nie dodaje pełnego off-screen NPC action executora. Po stream-in nadal istniejący corpse może ponownie wygenerować sanitation problem z authoritative world state.

## 12. Debug

Rozszerzyć istniejące NPC/settlement debug facilities o minimum potrzebne do ustalenia:

- corpse identity/species,
- corpse lifecycle phase,
- cleanup eligibility + rejection reason,
- odpowiedzialny nearest household,
- kandydaci household do wykonania pracy,
- sanitation pressure/score,
- active executor / claim,
- action phase,
- cancel/failure reason,
- burial/disposal result.

Nie tworzyć osobnego debug frameworka.

## Ownership

```text
AnimalAgent / animalCorpse
  → authoritative animal corpse lifecycle

Settlement spatial context
  → determines whether corpse is a local sanitation problem

Household
  → local responsibility context

NPC pressure / decisions / plans
  → chooses whether and who performs cleanup

NpcAgent + existing actions/navigation
  → loaded-settlement execution

Fauna corpse burial / terminal transition
  → authoritative completion
```

Household nie staje się właścicielem corpse state.

## Verification

### Basic cleanup

1. Zwierzę ginie w osadzie.
2. Corpse pozostaje aktywne w fauna lifecycle.
3. Najbliższy household zostaje deterministycznie wybrany jako odpowiedzialny.
4. Jeden kwalifikujący się NPC otrzymuje cleanup candidate.
5. NPC dochodzi do corpse.
6. Wykonuje timed cleanup/burial.
7. Corpse przechodzi przez istniejący authoritative transition.
8. Zwłoki nie gniją dalej ani nie wracają.

### Lifecycle phases

1. `fresh` corpse kwalifikuje się do cleanup.
2. `rotting` corpse generuje większy sanitation pressure.
3. `bones`/remains również są uprzątane, jeśli nadal istnieją w fauna contract.
4. Cleanup nie tworzy kopii corpse phase/state po stronie settlement lub household.

### Rat infestation

1. Po pladze pozostaje wiele martwych szczurów.
2. Households zaczynają je sukcesywnie usuwać.
3. Jedno corpse nie dostaje dwóch skutecznych wykonawców.
4. Po każdym cleanup problem jest ponownie oceniany.
5. Osada może zostać uprzątnięta bez udziału gracza.

### Wolf attack

1. Wilki giną podczas walki w osadzie.
2. Corpse korzystają z tego samego mechanizmu co szczury.
3. Nie istnieje wolf-specific cleanup code.

### Interruption

NPC cleanup poprawnie kończy się/canceluje, gdy corpse zostanie zakopane przez gracza, zjedzone, naturalnie usunięte albo stanie się niedostępne. NPC nie zostaje w stuck state.

### Household selection

1. Corpse przy domu A przypisuje odpowiedzialność household A.
2. Corpse pomiędzy dwoma household daje deterministyczny wynik.
3. Brak kwalifikującego household pozostawia corpse naturalnemu lifecycle.

### Regression

- predator corpse feeding nadal działa,
- player corpse interaction nadal działa,
- natural corpse decay nadal działa poza settlement,
- NPC nie próbują grzebać żywych animals,
- NPC burial/graves pozostają osobnym social lifecycle,
- cleanup nie tworzy nowych persistent corpse registries.

Podczas implementacji uruchomić focused tests dla fauna corpse lifecycle, NPC decision/action oraz settlement household selection i build.

Player wykonuje browser verification; AI nie uruchamia browser verification.

Nie uruchamiać `pnpm docs:sync` ręcznie — synchronizacja dokumentacji jest wykonywana przez GitHub workflow.

Dodać JSDoc dla nowych istotnych publicznych/architektonicznych funkcji i klas, gdy poprawi to preflight discovery; użyć `@domain settlements-npcs` tam, gdzie ma to sens.

## Poza zakresem

- NPC death/corpse lifecycle — `npc-010`,
- NPC burial i persistent graves — `npc-011`,
- mourning / grief,
- hygiene/disease simulation mieszkańców,
- corpse hauling,
- kremacja,
- cmentarz dla zwierząt,
- wykorzystanie mięsa/skór przez NPC,
- player quests związane ze sprzątaniem,
- osobny sanitation manager,
- pełna off-screen symulacja chodzenia NPC,
- household tool procurement.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
