# Plan: NPC dialogue grouping and quest priority

**Created:** 2026-09-17
**Status:** `planned` 📋
**Type:** polish
**Priority:** high · **Effort:** M
**Depends on:** none
**Domain:** `ui-input`
**Subdomains:** `menus` `interaction` `feedback`
**Tags:** `npc-dialogue` `quests` `grouping`
**Roadmap:** -

## Goal

Uprościć główne menu rozmowy z NPC bez zmiany istniejących systemów dialogu, questów, handlu, pomocy i wypraw.

Docelowy dialog ma:

- ograniczyć płaską listę kilkunastu opcji do kilku czytelnych kategorii,
- pozostawić ważne i kontekstowe interakcje bezpośrednio dostępne,
- pokazywać na samej górze questy wymagające działania **teraz** — przede wszystkim report/hand-in oraz wymagane rozmowy/choices,
- zachować `Może w czymś ci pomóc?` jako wejście do nowych ofert questowych,
- zachować rezygnację z aktywnego questu wewnątrz konkretnego quest contextu,
- nie tworzyć drugiego dialogue-tree engine ani osobnego quest state.

## Current behaviour

`src/ui-vue/NpcDialogueMenu.vue` renderuje główny poziom jako płaską listę niezależnych przycisków. W typowym przypadku Guard może jednocześnie pokazywać m.in.:

- Handel,
- Poproś o uznanie,
- Opowiedz mi coś o okolicy,
- Daj przedmiot,
- Poproś o jedzenie,
- Poproś o wodę,
- Zaproponuj udział w wyprawie,
- Może w czymś ci pomóc?,
- Powiedz coś o sobie,
- Co teraz robisz?,
- Powiedz coś o wiosce,
- Nic, miłego dnia.

Questy są już integrowane przez `QuestManager.onInteract(npcId)` oraz `QuestDialogOverride` / `QuestDialogTopic`. Przy wielu jednoczesnych quest contexts istniejący system wystawia topic picker z live `resolve()` zamiast tworzyć osobne drzewa dialogowe.

`resolveNpcDialogueOpenTopic()` celowo nie otwiera automatycznie `help` tylko dlatego, że NPC ma quest context. Automatyczne wejście jest zarezerwowane dla specjalnych przypadków jak wage payment lub self-initiated join proposal. To zachować.

Quest markers już definiują priorytet bieżących interakcji:

```text
?  required talk/action available now
✓  actionable hand-in/report/completion
!  exposed/selectable new offer
…  active reminder
```

Ten sam sens semantyczny powinien być wykorzystany w menu dialogowym zamiast implementowania niezależnego rankingu questów po stronie Vue.

## Target UX

### Root menu

Docelowa kolejność:

```text
[NPC name]

✓ Zgłoś: <quest title>             // jeśli dostępne teraz
? Porozmawiaj: <quest title>       // jeśli quest wymaga rozmowy teraz

Sprawy i pomoc  >
Handel                              // tylko jeśli dostępny
Rozmowa          >
Działania        >

Nic, miłego dnia!
```

Jeżeli jednocześnie istnieje kilka actionable quest contexts, pokazać każdy jako osobny shortcut nad kategoriami, zachowując deterministyczną kolejność pochodzącą z quest presentation/arbitration layer.

Nie pokazywać na root:

- zwykłych active reminders (`…`),
- nowych ofert (`!`) jako osobnych shortcutów,
- generic abandon.

### Group: `Sprawy i pomoc`

Zawartość:

- `Może w czymś ci pomóc?` — nowe oferty oraz istniejący quest topic picker,
- `Aktywne sprawy` — tylko jeśli NPC ma aktywne konteksty, które nie są już pokazane jako root actionable shortcut,
- `Poproś o jedzenie`,
- `Poproś o wodę`,
- `Poproś o uznanie` dla home guarda, jeśli dostępne.

Rezygnacja z questu pozostaje wewnątrz konkretnego quest contextu. Istniejący `topicScoped` abandon jest właściwym mechanizmem i nie powinien zostać spłaszczony do root menu.

### Group: `Rozmowa`

Zawartość:

- `Opowiedz mi coś o okolicy` — tylko jeśli aktualnie dostępne,
- `Powiedz coś o sobie`,
- `Co teraz robisz?`,
- `Powiedz coś o wiosce`.

To jest wyłącznie prezentacyjne grupowanie istniejących topics. Nie zmieniać źródeł odpowiedzi ani `dialogueTemplates`.

### Group: `Działania`

Zawartość:

- `Daj przedmiot`,
- `Zaproponuj udział w wyprawie`,
- przyszłe bezpośrednie interakcje gracz → NPC, które nie są handlem, rozmową ani questem.

Nie tworzyć osobnego action registry tylko na potrzeby tego planu. Grupa ma składać istniejące callbacks/capabilities z `NpcDialogueMenuState`.

### Handel

`Handel` pozostaje bezpośrednio na root, jeśli `state.canTrade === true`.

Powód: jest częstą, konkretną czynnością i dodatkowy poziom nestingu nie daje wartości.

### Goodbye

`Nic, miłego dnia!` pozostaje zawsze bezpośrednio na dole root menu.

## Quest presentation contract

### Problem

Root menu potrzebuje wiedzieć, czy dany NPC ma obecnie:

- actionable hand-in/report,
- required talk/action,
- zwykły active reminder,
- selectable new offer.

Nie należy w tym celu wywoływać `QuestManager.onInteract()` podczas samego otwierania dialogu, ponieważ ten path wykonuje normalną arbitraż/admission logikę i nie powinien być używany jako przypadkowy read API warstwy Vue.

Nie należy też rekonstruować statusu na podstawie `QuestState`, `stageIndex`, objective kinds ani markerów w `NpcDialogueMenu.vue`.

### Read-only dialogue preview

Rozszerzyć istniejącą warstwę quest presentation o mały read-only contract, np. semantycznie:

```ts
type QuestDialoguePreviewKind =
  | 'report'
  | 'required-action'
  | 'active'
  | 'offer'

type QuestDialoguePreviewEntry = {
  questId: QuestId
  title: string
  kind: QuestDialoguePreviewKind
  resolve: () => QuestDialogOverride
}
```

Nazwy typów mogą zostać dopasowane do aktualnego kodu, ale contract ma spełniać następujące zasady:

- `QuestManager` pozostaje właścicielem interpretacji lifecycle/objectives,
- preview jest derived/read-only i nie jest persistowany,
- preview nie mutuje progressu ani nie wykonuje action callbacks,
- preview korzysta z **tej samej** wewnętrznej logiki zbierania/arbitrażu quest contexts co `onInteract()` i `labelMarker()`, zamiast kopiować warunki,
- `resolve()` musi czytać live state przy wejściu w shortcut/topic analogicznie do obecnego `QuestDialogTopic.resolve()`.

Jeżeli obecne `onInteract()` miesza zbieranie contextów z offer admission, wydzielić minimalny wewnętrzny helper prezentacyjny tak, aby preview i właściwa interakcja współdzieliły klasyfikację bez zmiany ownership questów.

Nie wystawiać całych `QuestDef` do Vue.

## Dialogue navigation state

Obecny `topic: Ref<Topic | null>` obsługuje pojedynczy poziom topic/result. Dodać mały presentation-only navigation state dla root groups, np.:

```ts
type DialogueGroup = 'help' | 'conversation' | 'actions'
const group = ref<DialogueGroup | null>(null)
```

Zasady:

- `topic === null && group === null` → root,
- `group !== null && topic === null` → lista elementów grupy,
- `topic !== null` → istniejący response/action view,
- `Wróć` z topicu otwartego z grupy wraca do tej grupy,
- `Wróć` z grupy wraca do root,
- questowy drill-down wewnątrz `help` nadal korzysta z obecnego `helpDrilled` / `QuestDialogTopic.resolve()` flow.

Nie wprowadzać dowolnie głębokiego drzewa ani generycznego routera dialogowego. Scope to maksymalnie jeden dodatkowy poziom kategorii.

## Root actionable quest shortcuts

Shortcuts nad kategoriami mają być budowane wyłącznie z read-only quest dialogue preview.

Mapowanie:

- `report` → wizualny prefix `✓`, mocniejszy pozytywny/quest-complete tint,
- `required-action` → prefix `?`, neutralny quest accent,
- `offer` → nie trafia na root; pozostaje pod `Może w czymś ci pomóc?`,
- `active` → nie trafia na root; dostępny przez `Aktywne sprawy` / istniejący quest topic flow.

Kolor nie może być jedynym nośnikiem znaczenia. Prefix i tekst muszą wystarczać bez koloru.

Nie hardcodować questowych kolorów jako domenowego API. Vue mapuje semantyczny kind na istniejące klasy/tokeny UI.

## `Aktywne sprawy`

Nie tworzyć nowego quest list lub mini Quest Logu w dialogu.

Jeżeli NPC ma nie-actionable active quest contexts, `Aktywne sprawy` powinno wejść w istniejący topic-based quest navigation i pokazać tylko konteksty związane z tym NPC.

Preferowane rozwiązanie: rozszerzyć read-only preview / existing `QuestDialogTopic` presentation na tyle, by UI mogło odfiltrować `active` contexts i użyć istniejącego live `resolve()`.

Nie kopiować tytułów, objective textów ani abandon actions do osobnego UI modelu.

## Relevant files

Primary implementation:

- `src/ui-vue/NpcDialogueMenu.vue`
  - root rendering,
  - `Topic`,
  - `topic`, `helpDrilled`,
  - `selectTopic()`, `helpBack()`, `backToTopics()`,
  - existing direct handlers (`openTrade`, `requestFood`, `requestWater`, `giveItem`, `openProposeJoin`, `askAboutArea`).
- `src/ui-vue/store.ts`
  - `NpcDialogueMenuState`,
  - `openNpcDialogueMenu()`,
  - `resolveNpcDialogueHelp()`,
  - `selectNpcDialogueHelpTopic()`,
  - `resolveNpcDialogueOpenTopic()`.
- `src/quests/QuestManager.ts`
  - `QuestDialogOverride`,
  - `QuestDialogTopic`,
  - `onInteract(npcId)`,
  - `labelMarker(npcId)`,
  - existing context collection/ranking and `topicScoped` actions.

Tests:

- `src/ui-vue/npcDialogueOpen.test.ts` — opening/root behaviour and non-auto-open guarantees,
- `src/quests/QuestManager.test.ts` — preview classification, live resolve and consistency with actionable dialogue/markers,
- add a focused Vue/presentation test only if the repository already has a suitable lightweight pattern; do not add a heavy UI test stack solely for this plan.

Reference only unless recon during implementation proves a real need:

- `src/ai/dialogueTemplates.ts`,
- `src/app/createApp.ts`,
- quest definitions in `src/quests/quests.ts`.

## Implementation stages

1. Refactor the minimum shared quest-context presentation logic in `QuestManager` needed to support a read-only NPC dialogue preview without duplicating lifecycle/objective conditions.
2. Add tests proving preview classification for `report`, required talk/action, active reminder and offer contexts, including multiple simultaneous contexts.
3. Expose the read-only preview through the existing NPC dialogue UI/store seam without leaking `QuestDef` or mutable quest state into Vue.
4. Add one-level `DialogueGroup` navigation to `NpcDialogueMenu.vue` and preserve existing response/topic flows.
5. Move generic options into `Sprawy i pomoc`, `Rozmowa` and `Działania`; leave `Handel` and goodbye on root.
6. Render actionable quest shortcuts above root categories using preview semantic kind.
7. Add `Aktywne sprawy` only when relevant and route it through existing live quest topic resolution.
8. Verify back-navigation from group → topic → group → root, including multi-quest `helpDrilled` cases.
9. Add/adjust automated tests for opening behaviour, root shortcut visibility and no quest mutation caused merely by opening the dialogue menu.

## Verification

Automated/unit:

- opening NPC dialogue does not auto-open `help`,
- opening NPC dialogue alone does not accept/advance/complete/abandon a quest,
- read-only preview returns `report` for an actionable hand-in/report,
- read-only preview returns `required-action` for a required talk/choice available now,
- ordinary active reminder is not classified as root actionable,
- new offer is not classified as root actionable,
- preview and `labelMarker()` agree semantically for `✓` and `?` scenarios,
- multiple actionable quest contexts remain individually reachable,
- preview `resolve()` re-reads live quest state rather than using a frozen override,
- generic abandon remains topic-scoped,
- `resolveNpcDialogueOpenTopic()` keeps its current special-case behaviour and does not begin returning `help` for ordinary quest presence.

Manual browser verification — User:

1. Otwórz dialog z Guardem bez questów — root zawiera tylko dostępne kategorie/actions, bez pustych grup.
2. Sprawdź Guard/Merchant — `Handel` jest bezpośrednio dostępny na root.
3. Wejdź w `Rozmowa` i sprawdź: okolica / o sobie / obecna aktywność / wioska.
4. Wejdź w `Działania` i sprawdź `Daj przedmiot` oraz propozycję wyprawy.
5. Wejdź w `Sprawy i pomoc` i sprawdź prośby food/water oraz `Może w czymś ci pomóc?`.
6. Przy NPC z nowym questem potwierdź, że oferta nie zajmuje root, ale jest dostępna przez `Może w czymś ci pomóc?`.
7. Doprowadź quest do `ready_to_report` / hand-in — shortcut `✓` pojawia się na górze i prowadzi bezpośrednio do właściwego contextu.
8. Doprowadź quest do wymaganej rozmowy/choice — shortcut `?` pojawia się na górze.
9. Przy dwóch concurrent quest contexts sprawdź, że każdy ważny context jest osiągalny i nie zostaje przykryty przez drugi.
10. Sprawdź `Wróć` na każdym poziomie: topic → grupa → root oraz quest drill-down → quest picker → grupa/root.
11. Potwierdź czytelność przy 420 px i wąskim/mobile viewport; menu nadal przewija się pionowo.

## Non-goals

- nowy dialogue-tree engine,
- dowolnie głęboki nesting,
- redesign quest systemu,
- zmiana quest lifecycle, rankingów, giver capacity lub marker priorities,
- zmiana authored dialogue content,
- LLM-generated dialogue,
- zmiana handlu, food/water assistance, guard rewards lub expedition mechanics,
- persistence UI navigation/group state,
- nowy globalny action registry,
- Quest Log wewnątrz dialogu,
- automatyczne otwieranie quest topic przy każdym `[E]` na NPC.

## Guardrails

- `QuestManager` pozostaje ownerem interpretacji quest state i actionable statusu.
- Vue nie interpretuje `QuestState`, objective kinds ani `stageIndex`.
- Nie wywoływać mutującego quest interaction path tylko po to, by wyrenderować root menu.
- Preview jest derived/read-only; nie persistować go.
- Reuse existing `QuestDialogOverride`, `QuestDialogTopic`, live `resolve()` i `topicScoped` abandon.
- Nie przenosić food/water/trade/general dialogue do `QuestDialogOverride`.
- Zachować maksymalnie jeden poziom presentation grouping nad istniejącymi topics.
- Root actionable shortcuts mają reprezentować tylko interakcje wymagające uwagi teraz; nie zamieniać root w drugi Quest Log.
- Zachować deterministyczną kolejność quest contexts z quest layer.
- Kolor jest tylko dodatkowym feedbackiem; stan musi być czytelny z symbolu/tekstu.
- Dla nowego publicznego quest preview/helpera dodać krótki JSDoc z `@domain quests-progression`; dla istotnego helpera UI użyć `@domain ui-input`.
- Browser/manual verification wykonuje User, nie AI agent.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
