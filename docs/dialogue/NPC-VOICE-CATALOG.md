# NPC Voice Catalog

Canonical working catalog for generated NPC voice samples.

Visible in-game dialogue remains Polish. Generated/spoken voice samples are English and represent semantic intent rather than a literal reading of the displayed Polish line.

Runtime generated samples currently live flat under `public/sounds/voices/`.

## Naming

Generated runtime files use:

```text
<scope>_<gender>_[<age>]_<keyword>_<variant>.mp3
```

Examples:

```text
general_male_greeting_01.mp3
merchant_female_greeting_01.mp3
guard_male_warning_01.mp3
hunter_male_quest_complete_02.mp3
general_female_quest_declined_01.mp3
```

`scope` is `general` or a profession/role such as `merchant`, `guard`, or `hunter`.

Current semantic keywords used by the working catalog:

- `greeting`
- `farewell`
- `thanks`
- `agree`
- `refusal`
- `attention`
- `warning`
- `acknowledgement`
- `well_wish`
- `quest_offer`
- `quest_accepted`
- `quest_declined`
- `quest_complete`

`refusal` means the NPC refuses something requested by the player. `quest_declined` means the player declines the NPC's quest/offer and the NPC reacts to that decision.

## Voice sources

| Profile | Provider | Voice/reference | Notes |
|---|---|---|---|
| `merchant_female` | Fish Audio | `d4f161bee1934b47ad3090f05649270c` | `Expressive Female Voice`; current merchant voice selection. |
| `general_male` | Fish Audio | `c2a3921fd7024b9189cb912bdfe5266a` | `Casual Male Speaker`; generic male fallback. |
| `guard_male` | Fish Audio | `c29549f41b3b4aa498d66d76fba0e887` | Fish Audio voice labelled/selected as `guard`. |
| `hunter_male` | Fish Audio | `bd22266aba38416cb602e90ce651520c` | Fish Audio voice selected as Arthur Morgan-style Hunter voice. |
| `general_female` | Fish Audio | `5e3be339f2df45e6a1a338bb2ce94800` | `Warm Conversational`; current generic female/villager selection. Previous candidate was `British female` (`82a3ef4504a6441e9a07acdaaf5349c1`). |
| `campfire_female` | Fish Audio | `5e3be339f2df45e6a1a338bb2ce94800` | `Warm Conversational` was used for the current campfire female POC; keep this as provisional and revisit later. |
| `campfire_male` | Fish Audio | `c2a3921fd7024b9189cb912bdfe5266a` | `Casual Male Speaker`; current campfire male POC voice. |
| `shepard` | Fish Audio | `4af16ba03cee422996ec29a43e1947ee` | `hetalia Russia` | 

Provider page used for the Fish Audio voices: `https://fish.audio/app/`.

## Fish Audio generation notes

Fish Audio supports expressive text cues/tags in the generation text. These should be treated as **generation metadata only** — they must not appear in runtime filenames or semantic IDs.

Example exploration direction:

```text
Yeah. [soft] Feels like [emphasis] rain by morning.
```

Potential useful tags to experiment with for Seedvale dialogue include:

- `[soft]` — quieter, more intimate delivery, useful for campfire/night conversation,
- `[emphasis]` — stress a meaningful word without rewriting the line,
- pause/breath-style cues where supported by the selected Fish model/voice,
- restrained emotion cues for quest decline, warning, relief, thanks, etc.

Guidelines:

- keep the canonical spoken phrase readable without tags,
- store/tag generation input separately from runtime filename identity,
- do not encode tags in the resolver or semantic-key naming,
- verify tags per voice; the same tag may produce different results depending on the Fish voice/model,
- prefer subtle cues over theatrical delivery for ordinary NPCs,
- campfire dialogue is a good POC area for `[soft]` / emphasis experimentation because the context naturally supports quieter delivery.

---

# General male

Provider: Fish Audio.

Voice: `Casual Male Speaker` — `c2a3921fd7024b9189cb912bdfe5266a`.

## greeting

`general_male_greeting_01.mp3`

> Hello, traveler. Good to see you.

`general_male_greeting_02.mp3`

> Good day. How are you doing?

## farewell

`general_male_farewell_01.mp3`

> Take care out there.

`general_male_farewell_02.mp3`

> Safe travels. Watch yourself on the road.

## thanks

`general_male_thanks_01.mp3`

> Thank you. I appreciate it.

`general_male_thanks_02.mp3`

> Much obliged. You've been a great help.

## agree

`general_male_agree_01.mp3`

> Alright. Sounds good to me.

`general_male_agree_02.mp3`

> Very well. Let's do it.

## refusal

`general_male_refusal_01.mp3`

> No, thank you. Not today.

`general_male_refusal_02.mp3`

> I'd rather not. Maybe another time.

## attention

`general_male_attention_01.mp3`

> Hey, you! Got a moment?

`general_male_attention_02.mp3`

> Traveler! Over here for a moment.

## warning

`general_male_warning_01.mp3`

> Careful out there. The roads aren't always safe.

`general_male_warning_02.mp3`

> Watch yourself. Something's been moving in the woods.

## acknowledgement

`general_male_acknowledgement_01.mp3`

> I understand.

`general_male_acknowledgement_02.mp3`

> Alright. I understand.

## well_wish

`general_male_well_wish_01.mp3`

> Good luck out there.

`general_male_well_wish_02.mp3`

> Safe travels. May the road treat you kindly.

## quest_offer

`general_male_quest_offer_01.mp3`

> I could use some help, if you've got a moment.

`general_male_quest_offer_02.mp3`

> There's something I need taken care of. Interested?

## quest_accepted

`general_male_quest_accepted_01.mp3`

> Good. I knew I could count on you.

`general_male_quest_accepted_02.mp3`

> Alright. Come back when it's done.

## quest_declined

`general_male_quest_declined_01.mp3`

> I see. That's unfortunate.

`general_male_quest_declined_02.mp3`

> Alright. I was hoping you'd help.

## quest_complete

`general_male_quest_complete_01.mp3`

> Well done. You handled that nicely.

`general_male_quest_complete_02.mp3`

> Good work. I appreciate what you've done.

---

# Guard male

Provider: Fish Audio.

Voice ID: `c29549f41b3b4aa498d66d76fba0e887`.

## greeting

`guard_male_greeting_01.mp3`

> Good day. State your business.

`guard_male_greeting_02.mp3`

> Morning, traveler. Keep your weapons sheathed inside the settlement.

## farewell

`guard_male_farewell_01.mp3`

> Move along, and stay out of trouble.

`guard_male_farewell_02.mp3`

> Safe travels. Keep your eyes open on the road.

## thanks

`guard_male_thanks_01.mp3`

> You have my thanks.

`guard_male_thanks_02.mp3`

> Good work. You've done us a service.

## agree

`guard_male_agree_01.mp3`

> Understood. I'll see to it.

`guard_male_agree_02.mp3`

> Very well. Consider it done.

## refusal

`guard_male_refusal_01.mp3`

> No. I can't allow that.

`guard_male_refusal_02.mp3`

> Not permitted. You'll have to find another way.

## attention

`guard_male_attention_01.mp3`

> You there. Hold a moment.

`guard_male_attention_02.mp3`

> Traveler. A word, if you please.

## warning

`guard_male_warning_01.mp3`

> Stay alert. We've had trouble outside the walls.

`guard_male_warning_02.mp3`

> Careful beyond the gate. The roads are not safe.

## acknowledgement

`guard_male_acknowledgement_01.mp3`

> I understand.

`guard_male_acknowledgement_02.mp3`

> Understood. I'll remember that.

## well_wish

`guard_male_well_wish_01.mp3`

> Stay safe out there.

`guard_male_well_wish_02.mp3`

> Good luck. Keep your wits about you.

## quest_offer

`guard_male_quest_offer_01.mp3`

> I could use someone capable. Interested in some work?

`guard_male_quest_offer_02.mp3`

> We have a problem that needs dealing with. Think you can handle it?

## quest_accepted

`guard_male_quest_accepted_01.mp3`

> Good. I knew I could count on you.

`guard_male_quest_accepted_02.mp3`

> Very well. Report back when it's done.

## quest_declined

`guard_male_quest_declined_01.mp3`

> Very well. I'll find someone else.

`guard_male_quest_declined_02.mp3`

> That's disappointing. I thought I could count on you.

## quest_complete

`guard_male_quest_complete_01.mp3`

> Well done. You handled yourself well.

`guard_male_quest_complete_02.mp3`

> Good work. The settlement owes you thanks.

---

# Hunter male

Provider: Fish Audio.

Voice ID: `bd22266aba38416cb602e90ce651520c`.

## greeting

`hunter_male_greeting_01.mp3`

> Morning. Heading into the woods?

`hunter_male_greeting_02.mp3`

> Good to see you. Been traveling far?

## farewell

`hunter_male_farewell_01.mp3`

> Watch your step out there.

`hunter_male_farewell_02.mp3`

> Stay downwind, and keep your eyes open.

## thanks

`hunter_male_thanks_01.mp3`

> Thanks. I owe you one.

`hunter_male_thanks_02.mp3`

> Much appreciated. That'll help.

## agree

`hunter_male_agree_01.mp3`

> Alright. Sounds good.

`hunter_male_agree_02.mp3`

> Fine by me. Let's do it.

## refusal

`hunter_male_refusal_01.mp3`

> No. Not worth the risk.

`hunter_male_refusal_02.mp3`

> I'd leave that alone if I were you.

## attention

`hunter_male_attention_01.mp3`

> Hey. Over here a moment.

`hunter_male_attention_02.mp3`

> Traveler. Come take a look at this.

## warning

`hunter_male_warning_01.mp3`

> Keep away from the deep woods after dark.

`hunter_male_warning_02.mp3`

> Something's been stalking the trails. Stay sharp.

## acknowledgement

`hunter_male_acknowledgement_01.mp3`

> I hear you.

`hunter_male_acknowledgement_02.mp3`

> Alright. I understand.

## well_wish

`hunter_male_well_wish_01.mp3`

> Good hunting.

`hunter_male_well_wish_02.mp3`

> May the trail be kind to you.

## quest_offer

`hunter_male_quest_offer_01.mp3`

> I've got a job, if you're not afraid of the woods.

`hunter_male_quest_offer_02.mp3`

> There's something out there I could use help with.

## quest_accepted

`hunter_male_quest_accepted_01.mp3`

> Good. Meet me back here when you're done.

`hunter_male_quest_accepted_02.mp3`

> Alright. Keep quiet and don't take unnecessary risks.

## quest_declined

`hunter_male_quest_declined_01.mp3`

> Fair enough. I'll manage somehow.

`hunter_male_quest_declined_02.mp3`

> Shame. I could've used another pair of hands.

## quest_complete

`hunter_male_quest_complete_01.mp3`

> Nicely done. You know how to handle yourself.

`hunter_male_quest_complete_02.mp3`

> Good work. Not everyone comes back from a job like that.

---

# General female / villager

Provider: Fish Audio.

Voice: `Warm Conversational` — `5e3be339f2df45e6a1a338bb2ce94800`.

This is the current generic female/villager fallback voice. Previous candidate: `British female` — `82a3ef4504a6441e9a07acdaaf5349c1`.

## greeting

`general_female_greeting_01.mp3`

> Hello there. Good to see you.

`general_female_greeting_02.mp3`

> Good day. How are you doing?

## farewell

`general_female_farewell_01.mp3`

> Take care of yourself.

`general_female_farewell_02.mp3`

> Safe travels. Come back soon.

## thanks

`general_female_thanks_01.mp3`

> Thank you. I really appreciate it.

`general_female_thanks_02.mp3`

> That's very kind of you. Thank you.

## agree

`general_female_agree_01.mp3`

> Alright. That sounds good.

`general_female_agree_02.mp3`

> Of course. Let's do it.

## refusal

`general_female_refusal_01.mp3`

> No, thank you. Not today.

`general_female_refusal_02.mp3`

> I'd rather not, if you don't mind.

## attention

`general_female_attention_01.mp3`

> Excuse me! Have you got a moment?

`general_female_attention_02.mp3`

> Traveler! Could I speak with you?

## warning

`general_female_warning_01.mp3`

> Be careful out there. It isn't safe after dark.

`general_female_warning_02.mp3`

> Watch yourself on the road. There's been trouble lately.

## acknowledgement

`general_female_acknowledgement_01.mp3`

> I understand.

`general_female_acknowledgement_02.mp3`

> Alright. I'll keep that in mind.

## well_wish

`general_female_well_wish_01.mp3`

> Good luck out there.

`general_female_well_wish_02.mp3`

> Take care, and may you have a safe journey.

## quest_offer

`general_female_quest_offer_01.mp3`

> I could use some help, if you have a moment.

`general_female_quest_offer_02.mp3`

> There's something troubling me. Would you be willing to help?

## quest_accepted

`general_female_quest_accepted_01.mp3`

> Thank you. I knew I could count on you.

`general_female_quest_accepted_02.mp3`

> That means a lot. Come back when it's done.

## quest_declined

`general_female_quest_declined_01.mp3`

> Oh... I see. Maybe someone else can help.

`general_female_quest_declined_02.mp3`

> That's a shame. I was really hoping you would.

## quest_complete

`general_female_quest_complete_01.mp3`

> You did it! Thank you so much.

`general_female_quest_complete_02.mp3`

> I'm glad you came back. You've been a great help.

---

# Merchant female

Provider: Fish Audio.

Voice: `Expressive Female Voice` — `d4f161bee1934b47ad3090f05649270c`.

The merchant batch is being regenerated from scratch with this Fish Audio voice. Older Chatterbox-generated merchant files are historical and should not be treated as the target voice identity.

## greeting

`merchant_female_greeting_01.mp3`

> Welcome, traveler. Looking for something useful today?

`merchant_female_greeting_02.mp3`

> Ah, a customer. Come, take a look.

## farewell

`merchant_female_farewell_01.mp3`

> Safe travels. Come back if you need anything.

`merchant_female_farewell_02.mp3`

> Take care out there. I'll be here if you need supplies.

## agree

`merchant_female_agree_01.mp3`

> Alright. We have a deal.

`merchant_female_agree_02.mp3`

> Very well. That works for me.

## thanks

`merchant_female_thanks_01.mp3`

> Thank you. Always a pleasure doing business.

`merchant_female_thanks_02.mp3`

> Much appreciated. You've been very helpful.

## attention

`merchant_female_attention_01.mp3`

> Traveler! A moment, if you please.

`merchant_female_attention_02.mp3`

> You there! Come have a look at what I have.

## refusal

`merchant_female_refusal_01.mp3`

> I'm afraid I can't agree to that.

`merchant_female_refusal_02.mp3`

> No, that won't do. I'd lose money on the deal.

## warning

`merchant_female_warning_01.mp3`

> Careful on the road. Goods aren't the only thing bandits are after.

## quest_offer

`merchant_female_quest_offer_01.mp3`

> I may have a little work for someone willing to earn a few coins.

`merchant_female_quest_offer_02.mp3`

> There's something I need taken care of. Interested?

## quest_accepted

`merchant_female_quest_accepted_01.mp3`

> Excellent. Come back when it's done.

`merchant_female_quest_accepted_02.mp3`

> Good. I knew you looked dependable.

## quest_declined

`merchant_female_quest_declined_01.mp3`

> A pity. I suppose I'll have to ask someone else.

`merchant_female_quest_declined_02.mp3`

> Shame. I thought you might be interested.

## quest_complete

`merchant_female_quest_complete_01.mp3`

> Well done. You've earned your reward.

`merchant_female_quest_complete_02.mp3`

> Excellent work. Here, this is yours.

---

# Campfire conversation POC

Campfire naming includes speaker gender:

```text
campfire_<gender>_<topic>_<question|answer>_<variant>.mp3
```

The current POC deliberately mixes male/female speakers so both voices can participate as questioner and responder. Female campfire lines currently use `Warm Conversational` (`5e3be339f2df45e6a1a338bb2ce94800`); this choice is provisional and should be revisited after listening in-game.

## Weather

### Question 01

`campfire_female_weather_question_01.mp3`

> Cold tonight, isn't it?

### Question 02

`campfire_male_weather_question_02.mp3`

> Think this wind will last?

### Answer 01

`campfire_male_weather_answer_01.mp3`

> Yeah. Feels like rain by morning.

### Answer 02

`campfire_female_weather_answer_02.mp3`

> Maybe. It usually turns before dawn.

## Work

### Question 01

`campfire_male_work_question_01.mp3`

> Long day?

### Question 02

`campfire_female_work_question_02.mp3`

> You look exhausted. Been working all day?

### Answer 01

`campfire_female_work_answer_01.mp3`

> Since sunrise. I'm glad to finally sit down.

### Answer 02

`campfire_male_work_answer_02.mp3`

> Pretty much. There's always something that needs doing around here.

## Road / world

### Question 01

`campfire_female_road_question_01.mp3`

> You hear anything from the road today? Travelers have been coming through more often.

### Question 02

`campfire_male_road_question_02.mp3`

> Anything interesting happen outside the settlement?

### Answer 01

`campfire_male_road_answer_01.mp3`

> Mostly the usual. Bad weather, wolves near the woods, and someone saying the northern trail isn't as safe as it used to be.

### Answer 02

`campfire_female_road_answer_02.mp3`

> Not much. Saw fresh tracks near the forest, though. Bigger than deer. I wouldn't wander out there alone tonight.
