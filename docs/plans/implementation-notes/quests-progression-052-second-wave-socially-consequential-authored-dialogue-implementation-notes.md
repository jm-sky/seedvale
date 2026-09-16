# Implementation notes: quests-progression-052 second-wave socially consequential authored dialogue

## Dependency order

Implement only after both dependencies are on `main` in order:

```text
quests-progression-050
→ quests-progression-051
→ quests-progression-052
```

`051` already depends on `050`; this plan depends on `051`.

Do not implement against pre-`051` dialogue copy. For overlapping quests, first read the post-`051` source and treat that wording as canonical.

## Shared mechanism ownership

The reaction mechanism is owned by `quests-progression-050`, primarily in:

```text
src/quests/quests.ts
src/quests/QuestManager.ts
src/quests/materializeAuthoredQuests.ts
```

Use the actual implemented types/helpers from `050`; plan `050` contains illustrative names and may not match final identifiers exactly.

Important ownership rule:

- quest files author reaction data;
- `QuestManager` evaluates live relation/reputation and applies reaction consequences;
- settlement reputation stays owned by `ReputationManager` and is read through the existing quest lookup;
- player↔NPC relation stays in the existing quest relation store;
- do not put reaction evaluation logic into individual quest builders.

If a capability is missing, confirm it is genuinely shared by more than one migrated quest before touching the shared contract.

## Hard reaction-writing contract

Every new reaction line added by `052` must preserve the narrative quality established by `051`.

### Reactions are interpretations, not status messages

Do not write:

```text
Jestem bardziej rozczarowany, bo ci ufałem.
Twoja reputacja cię wyprzedza.
Nie spodziewałem się tego po kimś o takiej uczciwości.
Nasza relacja właśnie się pogorszyła.
Zapamiętam ten wybór.
```

Write what the NPC would actually say about the scene.

Examples:

```text
„Tobie akurat uwierzyłem bez pytania. Drugi raz tego nie zrobię.”
„Po tym, co o tobie słyszałem, spodziewałem się czegoś innego.”
„Mogłeś najpierw przyjść do mnie.”
„Dobrze. Połóż to tutaj i załatwimy sprawę porządnie.”
```

Only use community/reputation language if it sounds like ordinary social knowledge, never like a hidden stat readout.

### High relation is not a warmer adjective

Do not create variants like:

```text
neutral: „Dziękuję.”
trusted: „Bardzo ci dziękuję. Naprawdę.”
```

A high-relation variant must change the interpretation or intimacy of the response:

```text
neutral: „Dziękuję. To moje.”
trusted: „Wiedziałem, że jeśli go znajdziesz, przyniesiesz go tutaj.”
```

Likewise betrayal can hurt more at high relation:

```text
neutral: „Nie podoba mi się to.”
trusted: „Tobie dałem tę sprawę bez świadków. Więcej tego nie zrobię.”
```

### Keep the scene concrete

Reaction lines should mention the actual object/problem where useful:

```text
przesyłka
sygnet
łuk
dziennik
oznaczony klejnot
straż
```

Avoid abstract nouns such as `decyzja`, `konsekwencje`, `zaufanie`, `reputacja`, `moralność` unless natural in context.

### No fake consequences in prose

A line must not promise behaviour the systems do not implement.

Avoid:

```text
„Już nigdy z tobą nie porozmawiam.”
„Cała osada się o tym dowie.”
„Straż cię teraz ściga.”
```

unless a corresponding system/state actually exists and is triggered by this branch.

### Variant audit

For every action with multiple reactions:

1. hide the conditions;
2. read all lines aloud/in sequence;
3. if they look like mechanically generated tiers, rewrite them;
4. ensure each line is plausible as standalone speech;
5. ensure the base fallback is not obviously inferior prose to the conditional variants.

## Primary quest files and nearest tests

### Podejrzany transport

```text
src/quests/suspiciousTransportCaveCache.ts
src/quests/suspiciousTransportCaveCache.test.ts
```

The final `await_quest_outcome` stage already owns four concrete `dialogueActions`:

- keep quiet with giver;
- report to counterpart;
- keep goods while talking to giver;
- keep goods while talking to counterpart.

Keep `physicalOutcomeId` and `requireItemInstanceId` untouched.

The existing terminal outcomes already apply cross-NPC relation/reputation effects. Reaction deltas here must be small and only amplify current relationship context.

Suggested reaction anchors:

```text
report to counterpart, giver relation low/neutral:
„No dobrze. Skoro wolisz straż, nie będę cię zatrzymywał.”

report to counterpart, giver relation friendly/trusted:
„Mogłeś najpierw przyjść do mnie. Teraz już poszło dalej.”

keep quiet, giver relation positive:
„Dobrze. Oddaj ją i zostawmy tę sprawę tutaj.”

keep goods, spoken to giver, trusted relation:
„Tobie właśnie dałem tę robotę, bo nie chciałem świadków.”

keep goods, spoken to counterpart, high integrity reputation:
„Po to ją znalazłeś? Tego się po tobie nie spodziewałem.”
```

The last line is acceptable only as a concrete social expectation, not as a generic template repeated elsewhere.

### Stare kości

```text
src/quests/oldBonesAdventureCave.ts
src/quests/oldBonesAdventureCave.test.ts
```

The final action array is built dynamically because claimant B is optional.

Important:

- claimant A always exists;
- claimant B is optional;
- the keep-signet action targets claimant A;
- existing terminal outcomes already adjust claimant relations, including claimant A loss when claimant B receives the signet.

Do not make reaction authoring assume claimant B exists.

Suggested reaction anchors:

```text
give signet to claimant A, neutral relation:
„Dziękuję. Przynajmniej wrócił do rodziny.”

give signet to claimant A, positive relation:
„Wiedziałem, że go nie zatrzymasz. Dziękuję.”

give signet to claimant B while claimant A relation positive:
„Po tym wszystkim oddajesz go jemu? Dobrze. Wiem już, na czym stoję.”

keep signet, low relation:
„Czyli jednak zostaje u ciebie.”

keep signet, trusted relation:
„Tobie mówiłem o tym jak komuś swojemu. A sygnet zabierasz ze sobą.”
```

Do not invent proof that either claimant objectively owns the signet.

### Skrytka bandytów

```text
src/quests/dungeonBanditTreasure.ts
src/quests/dungeonBanditTreasure.test.ts
```

The final choices are all terminal and item-gated:

- return marked property to claimant;
- give evidence/property to guard;
- keep marked property while talking to guard.

This is the clearest place to exercise reputation conditions from `050` (`integrity`, optionally `competence`) without changing rewards or legality/world state.

Suggested reaction anchors:

```text
return property, claimant neutral:
„Tak. To ten znak. Dziękuję.”

return property, claimant positive relation:
„Poznałem go od razu. Dobrze, że trafił właśnie do ciebie.”

give evidence to guard, high competence/integrity:
„Dobrze to rozegrałeś. Zostaw rejestr i klejnot — zajmę się resztą.”

give evidence to guard, neutral standing:
„Zostaw wszystko tutaj. Sprawdzę rejestr i właściciela.”

keep marked property, high integrity:
„Naprawdę chcesz zatrzymać rzecz z cudzym znakiem?”

keep marked property, low integrity:
„No tak. Czyli jednak po klejnot tam poszedłeś.”
```

Do not create crime/wanted consequences through wording alone.

### Zaginiony myśliwy

```text
src/quests/lostHunterNaturalCave.ts
src/quests/lostHunterNaturalCave.test.ts
```

Read the post-`051` file before editing. `051` specifically removes unsupported certainty that the hunter is dead.

The final two terminal actions remain:

- return bow;
- keep bow.

Preserve `requireItemInstanceId` and the existing outcome IDs. Do not reintroduce wording such as `znalazłem go martwego` unless authoritative quest state was added by another completed dependency.

Suggested reaction anchors:

```text
return bow, neutral relation:
„Dziękuję. Chociaż łuk wrócił.”

return bow, positive relation:
„Wiedziałem, że jeśli go znajdziesz, nie zostawisz go gdzieś po drodze.”

keep bow, low relation:
„Nie będę się z tobą o niego szarpał.”

keep bow, trusted relation:
„Prosiłem cię o wieści, nie o to, żebyś zabrał jego rzeczy.”
```

The trusted line expresses hurt through the concrete mismatch between request and action; it must not claim confirmed death.

### Lost Treasure Expedition

```text
src/quests/lostTreasureExpedition.ts
src/quests/lostTreasureExpedition.test.ts
```

The final action list is dynamic:

- stakeholder/family action exists only when `stakeholderNpcId` exists;
- sponsor action always exists;
- keep-journal action targets sponsor.

Keep the exact journal instance gate and existing coin reward path unchanged.

Suggested reaction anchors:

```text
give journal to stakeholder, neutral relation:
„Dziękuję. Wreszcie wiemy, co zostało po tej wyprawie.”

give journal to stakeholder, positive relation:
„Przyniosłeś go tutaj. Dobrze. Bałem się, że już nikt go nie zobaczy.”

give journal to sponsor, high competence:
„Wiedziałem, że jeśli ktoś zamknie tę sprawę, to ty. Zostaw dziennik.”

give journal to sponsor, neutral standing:
„Dobrze. Dziennik zostaje u mnie, a zapłata jest twoja.”

keep journal, sponsor neutral:
„Skarb znalazłeś. Dziennika nie oddasz. Rozumiem.”

keep journal, sponsor positive relation:
„Tobie powierzyłem tę wyprawę do końca. Dziennik też był częścią tej sprawy.”

keep journal, low integrity interpretation:
„Czyli jednak coś miało zostać tylko dla ciebie.”
```

Do not invent blackmail, ownership law, inheritance or future publication consequences.

## Authoring approach

Prefer direct reaction metadata on the existing final action/choice rather than extra stages.

For each reaction set:

1. keep the base `playerLine` from post-`051` copy;
2. keep the canonical `physicalOutcomeId` / outcome id;
3. add only the minimum reaction variants needed to make relation/reputation visible;
4. use broad social tiers rather than many micro-thresholds;
5. keep a base fallback line so the action still behaves normally when no reaction matches;
6. use the concrete anchors above as the quality floor, not generic RPG filler.

Recommended reaction shape per action is usually 2 variants, not a large matrix:

```text
high positive relation → warmer / more personally hurt response
otherwise → base/fallback
```

or:

```text
high integrity/competence reputation → recognition/surprise
otherwise → base/fallback
```

Avoid combining relation + multiple reputation dimensions unless the scene genuinely needs both.

## Consequence tuning

Existing outcome consequences are primary.

Use reaction-specific deltas only for relationship-sensitive amplification:

```text
+1 relation  — small warmth/recognition
-1 relation  — ordinary disappointment
-2 relation  — strong betrayal from an established positive relationship
```

Do not add new renown in this pass.

Avoid extra reputation deltas unless there is a clear gap. All five quests already have terminal public reputation consequences, so reaction metadata should usually change only NPC relation and reply text.

## Terminal actions and cooldown

All five migrations are dominated by terminal final choices.

A cooldown authored on a terminal action is effectively dead state because the quest resolves immediately. Do not add cooldowns there.

Only use the `050` cooldown contract if implementation adds a non-terminal reaction before resolution and the same quest topic remains active. No such extra stage/action is required by this plan.

## Journal

`050` owns reaction-line journal projection. These quest files should only supply stable authored reaction variants/ids according to the final `050` API.

Do not persist raw reaction strings from these quests.

When adding/adjusting tests, assert that the heard line corresponds to the matched reaction only where the shared journal contract already exposes that behavior.

## Tests

Extend the nearest module test first. Use `QuestManager.test.ts` only for shared behavior that is not already covered by `050` tests.

Per quest, minimally verify:

- builder still returns the same stages and terminal outcome IDs;
- physical item requirement remains present on each final action;
- low/default social state keeps the fallback/base response;
- high relation or reputation threshold selects the authored alternate response;
- any extra relation delta is applied once;
- existing outcome consequences are unchanged and still apply once;
- reaction text does not reintroduce facts forbidden by `051`;
- variants are not merely intensity-scaled copies of the same sentence.

For dynamic NPC cases:

- `Stare kości`: test claimant-B-present and claimant-B-absent materialization;
- `Lost Treasure Expedition`: test stakeholder-present and stakeholder-absent variants.

For `Zaginiony myśliwy`, add a regression assertion that final copy does not claim confirmed death if `051` established that wording guarantee.

## Files that should normally remain untouched

Unless the implemented `050` contract exposes a real shared gap, do not change:

```text
src/app/createApp.ts
src/world/**
src/world/caves/**
src/items/**
src/reputation/ReputationManager.ts
src/ui-vue/**
```

No new persistence owner, UI surface or world-system integration is required by this plan.

## Documentation after implementation

Only update `docs/state/quests.md` if second-wave usage reveals a material clarification to the shared `050` contract.

Do not add per-quest story summaries to state docs.

If the implementation establishes a generally useful authoring lesson (for example `high relation may amplify betrayal rather than soften it`), put it in `docs/vision/quests.md` or the appropriate planning guidance, not in runtime state documentation.

## Suggested implementation order

```text
1. Re-read implemented 050 reaction API.
2. Re-read post-051 copy for overlapping quests.
3. Podejrzany transport.
4. Stare kości.
5. Skrytka bandytów.
6. Zaginiony myśliwy.
7. Lost Treasure Expedition.
8. Read all reaction variants without conditions and rewrite any obvious tiered/template prose.
9. Run targeted tests after each builder; then shared typecheck/build verification.
```

The order starts with two direct `dialogueActions` cases already covered by `051`, then validates reputation use on `Skrytka bandytów`, then finishes with the two dynamic/narrative-sensitive builders.

> **Zrób git commit i push do main, rebase jeżeli trzeba**