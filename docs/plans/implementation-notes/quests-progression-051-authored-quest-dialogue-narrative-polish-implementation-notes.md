# Implementation Notes: quests-progression-051 authored quest dialogue narrative polish

These notes are intentionally narrow. The plan is a copy-only pass; the implementation agent should not rediscover or refactor quest architecture.

## Dependency / starting point

Implement only after `quests-progression-050` is on `main`.

`051` must treat the post-`050` quest definitions as authoritative. If `050` has added reaction-specific fields/lines to any of these conversations, preserve their mechanics and edit only prose required by `051`. Do not remove, flatten or bypass the social-reaction contract just to simplify copy.

The current five targets are runtime-built `QuestDef`s, not the name-based `AuthoredQuestDef` catalog. Their copy is authored directly in builder functions with stable `NpcId` bindings already resolved.

## Primary edit points

- `src/quests/lostHunterNaturalCave.ts` — `buildLostHunterNaturalCaveQuest()`
- `src/quests/suspiciousTransportCaveCache.ts` — `buildSuspiciousTransportCaveCacheQuest()`
- `src/quests/oldBonesAdventureCave.ts` — `buildOldBonesAdventureCaveQuest()`
- `src/quests/lostTreasureChronicleSearch.ts` — `chronicleSearchOfferLine()` and `buildLostTreasureChronicleSearchQuests()`
- `src/quests/lostTreasureChroniclesElder.ts` — `buildLostTreasureChroniclesElderQuests()`; only the `Stara uraza` quest is in the narrative-pass target, not a redesign of the winter prerequisite quest.

Do not move prose into a new shared dialogue abstraction. The existing builders are the correct ownership for this authored text.

## Hard narrative contract

This section is normative. If a proposed line conflicts with it, rewrite the line rather than weakening the contract.

### Voice

Seedvale NPCs are inhabitants with their own concerns, not narrators of quest state.

Every spoken line should pass these checks:

- Could a person plausibly say this aloud in the situation?
- Does it refer to something concrete in the scene rather than an abstract outcome?
- Does it reveal only facts the speaker can actually know?
- Is it short enough to sound spoken rather than written exposition?
- Does it avoid explaining to the player what emotion/reputation/relation mechanic just changed?

Default target length:

```text
playerLine: usually 3–14 words
npcLine: usually 4–22 words
longer only when a new fact/location must be conveyed
```

### Do not name emotions when the line can show them

Avoid:

```text
Jestem zły.
Jestem rozczarowany.
Cieszę się, że mogę ci ufać.
Nie ufam ci już.
```

Prefer concrete responses:

```text
„Mogłeś najpierw przyjść do mnie.”
„Tego akurat nie musiałeś robić.”
„Dobrze. Wiedziałem, że wrócisz z odpowiedzią.”
„Drugi raz nie dam ci tego w ręce.”
```

### Forbidden generic RPG language

Do not introduce lines like:

```text
Zapamiętam to.
Twoje czyny mają konsekwencje.
Dokonałeś wyboru.
Udowodniłeś swoją wartość.
Twoja odwaga zostanie zapamiętana.
Los osady jest w twoich rękach.
Wiedziałem, że jesteś właściwą osobą.
Nie zawiedź mnie.
```

A line is not improved by sounding dramatic. Prefer ordinary, grounded speech tied to the actual object/person/problem.

### No objective disguised as dialogue

Bad:

```text
„Idź do jaskini, odzyskaj przedmiot i wróć do mnie.”
```

Better:

```text
„Widziałem go przy tamtej jaskini. Jeśli coś zostało, będzie właśnie tam.”
```

The quest log can remain explicit. NPC speech should not carry every gameplay instruction if `description` / `reminderLine` already does.

### No fake specificity

Do not improve prose by inventing names, dates, family relations, prior promises, causes, motives or history not in current state.

If the binding only knows:

```text
someone disappeared
player found belongings
```

then prose may become more natural, but it may not become:

```text
„Mój brat Jan zginął trzy dni temu w zawaleniu.”
```

### Prefer subtext

A strong line often says less than a weak line.

Weak:

```text
„Jestem podejrzliwy wobec tej przesyłki, ponieważ nie znam jej pochodzenia.”
```

Better:

```text
„Paczka bez nadawcy i bez świadka? Nie podoba mi się to.”
```

Only use the second form if the quest actually establishes those concrete facts. Otherwise stay with known facts.

### Final self-review before commit

For every edited conversation, read only the spoken lines in order, without `description`, objective ids or code. If the conversation sounds like:

- a tutorial,
- a quest summary,
- a morality lecture,
- tiered AI-generated variants,
- or exposition written for the player rather than speech between people,

rewrite it before committing.

## Cave-location wording contract

`src/quests/caveLocationDescription.ts` already owns player-facing cave phrases. `resolveCaveQuestPresentation()` / `describeCaveLocation()` produce complete noun phrases such as:

- `Jaskinia Mroczna, na północ od osady`
- `mała jaskinia na północ od osady`
- `stary loch poza osadą`

The helper already decides whether a speaker role (`guard`, `hunter`, `miner`, `trader`) may use the canonical location name.

Implementation rules:

- consume the builder's existing `caveDescription` as a complete phrase;
- do not recompute direction/name from ids or coordinates;
- do not modify `caveLocationDescription.ts` merely to make one sentence easier to inflect;
- write the surrounding sentence so the existing phrase remains grammatical.

Existing tests already assert that location wording is present without leaking internal archetype/debug terminology.

## Per-quest findings and copy anchors

The strings below are **strong suggested copy anchors**. They may be adapted for grammar or post-`050` mechanics, but the agent should not replace them with more generic RPG prose.

### Zaginiony myśliwy

`buildLostHunterNaturalCaveQuest()` has the exact knowledge bug identified by the plan:

- after looting the pack, the quest establishes only that the player found the hunter's belongings (`plecak` + exact `hunting_bow` instance);
- there is no corpse/remains/death-confirmation objective or binding;
- the current keep-bow player line says `Znalazłem go martwego. Łuk zostaje przy mnie.` and must stop claiming confirmed death.

Preserve:

- witness `reveal_location` effect;
- exact `bowInstanceId` requirement on both final actions;
- `return_bow_to_family` / `report_fate_keep_bow` outcome ids;
- transfer of the exact bow instance on the return outcome;
- `abandonment: { allowed: false }`.

Suggested direction:

```text
offerLine:
„Nie wrócił z polowania. Jeśli ktoś widział, dokąd poszedł, to raczej nie ja.”

playerLine to witness:
„Widziałeś, dokąd poszedł?”

witness progressLine:
„Widziałem go ostatniego. Szedł w stronę: ${caveDescription}. Potem już go nie spotkałem.”

playerLine back to giver:
„Znalazłem jego plecak i łuk.”

giver progressLine:
„To jego rzeczy. Dobrze, że je przyniosłeś. Co zrobisz z łukiem?”

return bow playerLine:
„Łuk powinien zostać z wami.”

return bow npcLine:
„Dziękuję. Chociaż tyle wróciło do domu.”

keep bow playerLine:
„Znalazłem jego rzeczy. Łuk zatrzymam.”

keep bow npcLine:
„Nie będę się z tobą o niego szarpać. Ale liczyłem, że go oddasz.”
```

Do not use `martwy`, `ciało`, `zginął` or equivalent unless authoritative state changes before implementation.

`src/quests/lostHunterNaturalCave.test.ts` already checks the cave phrase, reveal effect, exact item requirement and transfer effect. Add the plan-required regression assertion that authored player-facing lines do not assert confirmed death.

### Podejrzany transport

`buildSuspiciousTransportCaveCacheQuest()` owns all story copy. The final keep-item wording is factored into local `keepGoodsLines` and spread into actions for both giver and counterpart. If that wording changes, edit the shared object once rather than duplicating the two actions.

The physical evidence is an exact `damascus_knife` item instance, but the current quest does not establish provenance beyond it being the distinctive item in the hidden shipment. Narrative polish must not explain who originally owned it or whether a crime definitely occurred.

Preserve:

- cave reveal and exact evidence-instance requirement;
- the three existing outcomes `keep_quiet`, `report_it`, `keep_goods`;
- all current relation/reputation/reward consequences;
- four final actions (including the shared keep-goods action on both NPCs);
- `abandonment: { allowed: false }`.

Suggested direction:

```text
offerLine:
„Potrzebuję drobnej przysługi. Czeka na mnie paczka poza osadą. Przynieś ją prosto do mnie.”

playerLine asking location:
„Gdzie ją zostawiono?”

giver progressLine:
„Tutaj: ${caveDescription}. Weź paczkę i wróć z nią do mnie.”

keep quiet playerLine:
„Masz swoją paczkę. Zostawmy to między nami.”

keep quiet npcLine:
„Dobrze. Im mniej osób o niej gada, tym lepiej.”

report playerLine:
„Znalazłem przesyłkę. Wolę, żebyś ty ją zobaczył.”

counterpart npcLine:
„Połóż ją tutaj. Sprawdzimy, co właściwie trafiło do osady.”

keep goods playerLine:
„Nie oddam tego. Zostaje u mnie.”

keep goods npcLine:
„Czyli po to po nią poszedłeś. Dobrze wiedzieć.”
```

Do not add `przestępstwo`, `kontrabanda`, `kradziony`, original owner, sender identity or criminal intent unless current quest state establishes it.

### Stare kości

`buildOldBonesAdventureCaveQuest()` receives only the selected giver/claimant identities, settlement name and `caveDescription`; the binding contains no historical proof about the family story.

Important content boundary:

- claimant A is a real adult selected from one household;
- claimant B is optional and, when present, is another adult from that same selected household;
- this selection is not evidence of the currently authored claims such as a historical promise, inheritance rule or genealogy beyond what the existing copy already states.

Do not strengthen those claims during polish. In particular, avoid adding inscriptions, wills, dates, named ancestors or new evidence.

Keep copy valid in both builder shapes: with and without optional claimant B. Preserve exact signet-instance requirements and all existing recipient/keep outcomes.

Suggested direction:

```text
giver progressLine:
„Szczątki są tutaj: ${caveDescription}. Jeśli coś przy nich zostało, ktoś z osady może to rozpoznać.”

claimant A playerLine:
„Znalazłem stare szczątki. Ktoś z waszej rodziny zaginął w tamtej okolicy?”

claimant A progressLine:
„Taką historię u nas opowiadano. Miał przy sobie sygnet. Jeśli go znajdziesz, przynieś go.”

claimant B playerLine:
„Znalazłem sygnet. Mówisz, że powinien trafić do ciebie?”

claimant B progressLine:
„Mówię, że nie tylko on ma do niego prawo. Zanim go oddasz, wysłuchaj obu stron.”

return A playerLine:
„Sygnet wraca do ciebie.”

keep playerLine:
„Sygnet zatrzymam.”

keep npcLine:
„Przynosisz nam historię, a pamiątkę bierzesz ze sobą. Rozumiem.”
```

Do not use `przodek obiecał mojej linii` unless that fact remains explicitly authored and intentionally retained as a claim rather than objective truth. Prefer phrasing that makes contested family history sound like a claim.

### Zakodowana kronika

This file has two presentation layers that must stay consistent:

1. `chronicleSearchOfferLine(binding, lead)` owns the elder's basic/strong offer wording;
2. the main `QuestDef` sets a static basic `offerLine` **and** `resolveOfferLine: leadResolver(binding)`, so live dialogue may use the dynamically resolved variant.

Do not polish only the static `offerLine`; update `chronicleSearchOfferLine()` so both paths stay aligned.

`resolveChronicleSearchLead()` semantics are mechanics and must not change. Current tests require:

- `basic` offer does **not** contain `researcherSurname`;
- `strong` offer **does** contain it.

Preserve this information boundary while shortening the prose.

Also preserve the literal world-knowledge token `{worldKnowledgeClue:ruins}` wherever used. It is expanded by the quest runtime; changing/removing the token would alter information delivery rather than just prose.

`buildLostTreasureChronicleSearchQuests()` returns both the main `Zakodowana kronika` quest and the cemetery-favour quest. Avoid broadening this pass into new permission/gameplay semantics; if adjacent favour copy is edited for consistency, keep its current objective/outcome contract intact.

Suggested direction:

```text
basic elder offer:
„W ${binding.archaeologistSettlementName} mieszka ${binding.archaeologistName} ${binding.archaeologistLastName}. Szuka starej kroniki po zaginionej wyprawie. Przyda mu się ktoś, kto umie szukać w terenie.”

strong suffix:
„Zapamiętaj też nazwisko ${binding.researcherSurname}. To on prowadził tamtą wyprawę.”

playerLine to archaeologist:
„Słyszałem, że szukasz kroniki po dawnej wyprawie.”

archaeologist progressLine:
„Mam dwa tropy: grób badacza i ruiny obozu. Cmentarz mogę wskazać od razu; trasę do ruin muszę jeszcze odtworzyć z notatek.”

world-knowledge follow-up playerLine:
„Masz już trasę do ruin?”

world-knowledge npcLine:
„Mam. Szukaj {worldKnowledgeClue:ruins}. Kronika jest tylko w jednym z tych dwóch miejsc.”
```

Avoid `quest briefing` rhythm. The archaeologist can be precise without listing mechanics.

### Stara uraza

`buildLostTreasureChroniclesElderQuests()` returns two quests. The dispute (`story:lost-treasure-chronicles:elder:dispute`) is unlocked by either successful winter outcome; that prerequisite is mechanics and stays unchanged.

The dispute's known facts are deliberately sparse:

- elder says a tool was loaned and not returned;
- counterpart says it was returned;
- the game does not establish which account is true.

Preserve that ambiguity. Do not add corroborating witnesses, a proven timeline, previous friendship, fire/field history or other facts.

The terminal choice remains exactly `support_elder` vs `reconcile`; do not rewrite prose in a way that implies a third factual resolution.

Suggested direction:

```text
elder offerLine:
„Mam jeszcze jedną sprawę. ${binding.counterpartName} pożyczył ode mnie siekierę. On mówi, że oddał. Ja jej nie widziałem. Posłuchaj go sam.”

playerLine to elder:
„Powiedz, jak ty to pamiętasz.”

elder progressLine:
„Dałem mu siekierę na jeden sezon. Potem już jej u siebie nie zobaczyłem. On mówi co innego.”

playerLine to counterpart:
„${binding.elderName} mówi, że siekiera nie wróciła.”

counterpart progressLine:
„Wróciła. Jeśli jej potem nie znalazł, to nie znaczy, że mam płacić drugi raz.”

support elder playerLine:
„Wyrównajcie to jakoś. On tej sprawy nie odpuści.”

reconcile playerLine:
„Zostaw tę siekierę. Po tylu latach już niczego nie udowodnicie.”
```

Keep both sides credible. Neither voice should sound like the writer telling the player which choice is morally correct.

## Quest-log / journal consequence of copy edits

Quest journal text is projected from the **current live `QuestDef`**, not persisted as raw strings. Changing authored `offerLine`, `progressLine`, `dialogueActions.npcLine` or result text will therefore also change how previously stamped journal events are rendered after load.

That is expected for this polish pass. Do not add persistence or snapshot old strings to preserve historical wording.

## Tests and implementation order

Recommended order:

1. implement copy changes one quest module at a time;
2. after each quest, read the full spoken exchange in order and apply the hard narrative contract above;
3. update only exact-string/text-fragment assertions broken intentionally;
4. keep behavioral assertions for ids, effects, transitions, exact item instances and consequences unchanged;
5. run the five adjacent quest test files, then relevant `QuestManager`/definition validation tests if `050` introduced reaction-copy assertions;
6. typecheck/build per current repository workflow.

Adjacent tests already exist for all five modules. In particular:

- `lostHunterNaturalCave.test.ts` covers cave presentation and exact bow mechanics;
- `lostTreasureChronicleSearch.test.ts` covers the basic/strong information boundary;
- corresponding `suspiciousTransportCaveCache.test.ts`, `oldBonesAdventureCave.test.ts`, and `lostTreasureChroniclesElder.test.ts` should remain the first place for local regression assertions.

Do not weaken mechanics assertions just because prose changed.

## Architecture guardrails

No changes are expected in:

- `QuestManager` lifecycle;
- quest persistence;
- `QuestDef` / objective contracts;
- reputation or relation math;
- world/container/cave bindings;
- NPC selection;
- item identities;
- UI components.

If implementation appears to require any of those, stop and re-check whether the wording can be expressed using values already available in the builder. This plan should remain a prose-only change on top of `050`.

No new public/shared helper is expected. If one becomes genuinely necessary, add concise JSDoc with `@domain quests-progression` as required by planning guidance.

> **Zrób git commit i push do main, rebase jeżeli trzeba**