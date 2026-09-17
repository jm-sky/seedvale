# NPC Voice Catalog

Canonical working catalog for generated NPC voice samples.

Visible in-game dialogue remains Polish. Generated/spoken voice samples are English and represent semantic intent rather than a literal reading of the displayed Polish line.

Runtime generated samples currently live flat under `public/sounds/voices/`.

## Naming

Generated runtime files use:

```text
<scope>_<gender>_[<age>]_ <keyword>_<variant>.wav
```

There is no literal space in filenames. Examples:

```text
general_male_greeting_01.wav
merchant_female_greeting_01.wav
guard_male_warning_01.wav
hunter_male_quest_complete_02.wav
general_female_quest_declined_01.wav
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
| `merchant_female` | Chatterbox | default/reference TBD | Current merchant voice; exact default reference still needs confirmation. |
| `general_male` | Chatterbox | no reference | Generic male fallback voice. |
| `guard_male` | Fish Audio | `c29549f41b3b4aa498d66d76fba0e887` | Fish Audio voice labelled/selected as `guard`. |
| `hunter_male` | Fish Audio | `bd22266aba38416cb602e90ce651520c` | Fish Audio voice selected as Arthur Morgan-style Hunter voice. |
| `general_female` | Fish Audio | `82a3ef4504a6441e9a07acdaaf5349c1` | Fish Audio `British female`; generic female/villager fallback. |

Provider page used for the Fish Audio voices: `https://fish.audio/app/`.

## Existing generated files observed during catalog work

```text
public/sounds/voices/
├── general_male_greeting_01.wav
├── merchant_female_agree_01.wav
├── merchant_female_farewell_01.wav
├── merchant_female_greeting_01.wav
├── merchant_female_greeting_02.wav
├── merchant_female_greeting_03.wav
├── merchant_female_thanks_01.wav
└── references/
    ├── guard_male_deep_voice.mp3
    ├── male_voice_foster.mp3
    └── steady_man_voice.mp3
```

The local files under `references/` are retained as source material/history, but the current Guard voice selection uses Fish Audio voice ID `c29549f41b3b4aa498d66d76fba0e887` instead of those reference files.

---

# General male

Provider: Chatterbox, no reference.

## greeting

`general_male_greeting_01.wav`

> Hello, traveler. Good to see you.

`general_male_greeting_02.wav`

> Good day. How are you doing?

## farewell

`general_male_farewell_01.wav`

> Take care out there.

`general_male_farewell_02.wav`

> Safe travels. Watch yourself on the road.

## thanks

`general_male_thanks_01.wav`

> Thank you. I appreciate it.

`general_male_thanks_02.wav`

> Much obliged. You've been a great help.

## agree

`general_male_agree_01.wav`

> Alright. Sounds good to me.

`general_male_agree_02.wav`

> Very well. Let's do it.

## refusal

`general_male_refusal_01.wav`

> No, thank you. Not today.

`general_male_refusal_02.wav`

> I'd rather not. Maybe another time.

## attention

`general_male_attention_01.wav`

> Hey, you! Got a moment?

`general_male_attention_02.wav`

> Traveler! Over here for a moment.

## warning

`general_male_warning_01.wav`

> Careful out there. The roads aren't always safe.

`general_male_warning_02.wav`

> Watch yourself. Something's been moving in the woods.

## acknowledgement

`general_male_acknowledgement_01.wav`

> I understand.

`general_male_acknowledgement_02.wav`

> Alright. I understand.

## well_wish

`general_male_well_wish_01.wav`

> Good luck out there.

`general_male_well_wish_02.wav`

> Safe travels. May the road treat you kindly.

## quest_offer

`general_male_quest_offer_01.wav`

> I could use some help, if you've got a moment.

`general_male_quest_offer_02.wav`

> There's something I need taken care of. Interested?

## quest_accepted

`general_male_quest_accepted_01.wav`

> Good. I knew I could count on you.

`general_male_quest_accepted_02.wav`

> Alright. Come back when it's done.

## quest_declined

`general_male_quest_declined_01.wav`

> I see. That's unfortunate.

`general_male_quest_declined_02.wav`

> Alright. I was hoping you'd help.

## quest_complete

`general_male_quest_complete_01.wav`

> Well done. You handled that nicely.

`general_male_quest_complete_02.wav`

> Good work. I appreciate what you've done.

---

# Guard male

Provider: Fish Audio.

Voice ID: `c29549f41b3b4aa498d66d76fba0e887`.

## greeting

`guard_male_greeting_01.wav`

> Good day. State your business.

`guard_male_greeting_02.wav`

> Morning, traveler. Keep your weapons sheathed inside the settlement.

## farewell

`guard_male_farewell_01.wav`

> Move along, and stay out of trouble.

`guard_male_farewell_02.wav`

> Safe travels. Keep your eyes open on the road.

## thanks

`guard_male_thanks_01.wav`

> You have my thanks.

`guard_male_thanks_02.wav`

> Good work. You've done us a service.

## agree

`guard_male_agree_01.wav`

> Understood. I'll see to it.

`guard_male_agree_02.wav`

> Very well. Consider it done.

## refusal

`guard_male_refusal_01.wav`

> No. I can't allow that.

`guard_male_refusal_02.wav`

> Not permitted. You'll have to find another way.

## attention

`guard_male_attention_01.wav`

> You there. Hold a moment.

`guard_male_attention_02.wav`

> Traveler. A word, if you please.

## warning

`guard_male_warning_01.wav`

> Stay alert. We've had trouble outside the walls.

`guard_male_warning_02.wav`

> Careful beyond the gate. The roads are not safe.

## acknowledgement

`guard_male_acknowledgement_01.wav`

> I understand.

`guard_male_acknowledgement_02.wav`

> Understood. I'll remember that.

## well_wish

`guard_male_well_wish_01.wav`

> Stay safe out there.

`guard_male_well_wish_02.wav`

> Good luck. Keep your wits about you.

## quest_offer

`guard_male_quest_offer_01.wav`

> I could use someone capable. Interested in some work?

`guard_male_quest_offer_02.wav`

> We have a problem that needs dealing with. Think you can handle it?

## quest_accepted

`guard_male_quest_accepted_01.wav`

> Good. I knew I could count on you.

`guard_male_quest_accepted_02.wav`

> Very well. Report back when it's done.

## quest_declined

`guard_male_quest_declined_01.wav`

> Very well. I'll find someone else.

`guard_male_quest_declined_02.wav`

> That's disappointing. I thought I could count on you.

## quest_complete

`guard_male_quest_complete_01.wav`

> Well done. You handled yourself well.

`guard_male_quest_complete_02.wav`

> Good work. The settlement owes you thanks.

---

# Hunter male

Provider: Fish Audio.

Voice ID: `bd22266aba38416cb602e90ce651520c`.

## greeting

`hunter_male_greeting_01.wav`

> Morning. Heading into the woods?

`hunter_male_greeting_02.wav`

> Good to see you. Been traveling far?

## farewell

`hunter_male_farewell_01.wav`

> Watch your step out there.

`hunter_male_farewell_02.wav`

> Stay downwind, and keep your eyes open.

## thanks

`hunter_male_thanks_01.wav`

> Thanks. I owe you one.

`hunter_male_thanks_02.wav`

> Much appreciated. That'll help.

## agree

`hunter_male_agree_01.wav`

> Alright. Sounds good.

`hunter_male_agree_02.wav`

> Fine by me. Let's do it.

## refusal

`hunter_male_refusal_01.wav`

> No. Not worth the risk.

`hunter_male_refusal_02.wav`

> I'd leave that alone if I were you.

## attention

`hunter_male_attention_01.wav`

> Hey. Over here a moment.

`hunter_male_attention_02.wav`

> Traveler. Come take a look at this.

## warning

`hunter_male_warning_01.wav`

> Keep away from the deep woods after dark.

`hunter_male_warning_02.wav`

> Something's been stalking the trails. Stay sharp.

## acknowledgement

`hunter_male_acknowledgement_01.wav`

> I hear you.

`hunter_male_acknowledgement_02.wav`

> Alright. I understand.

## well_wish

`hunter_male_well_wish_01.wav`

> Good hunting.

`hunter_male_well_wish_02.wav`

> May the trail be kind to you.

## quest_offer

`hunter_male_quest_offer_01.wav`

> I've got a job, if you're not afraid of the woods.

`hunter_male_quest_offer_02.wav`

> There's something out there I could use help with.

## quest_accepted

`hunter_male_quest_accepted_01.wav`

> Good. Meet me back here when you're done.

`hunter_male_quest_accepted_02.wav`

> Alright. Keep quiet and don't take unnecessary risks.

## quest_declined

`hunter_male_quest_declined_01.wav`

> Fair enough. I'll manage somehow.

`hunter_male_quest_declined_02.wav`

> Shame. I could've used another pair of hands.

## quest_complete

`hunter_male_quest_complete_01.wav`

> Nicely done. You know how to handle yourself.

`hunter_male_quest_complete_02.wav`

> Good work. Not everyone comes back from a job like that.

---

# General female / villager

Provider: Fish Audio.

Voice ID: `82a3ef4504a6441e9a07acdaaf5349c1` (`British female`).

This is the generic female/villager fallback voice.

## greeting

`general_female_greeting_01.wav`

> Hello there. Good to see you.

`general_female_greeting_02.wav`

> Good day. How are you doing?

## farewell

`general_female_farewell_01.wav`

> Take care of yourself.

`general_female_farewell_02.wav`

> Safe travels. Come back soon.

## thanks

`general_female_thanks_01.wav`

> Thank you. I really appreciate it.

`general_female_thanks_02.wav`

> That's very kind of you. Thank you.

## agree

`general_female_agree_01.wav`

> Alright. That sounds good.

`general_female_agree_02.wav`

> Of course. Let's do it.

## refusal

`general_female_refusal_01.wav`

> No, thank you. Not today.

`general_female_refusal_02.wav`

> I'd rather not, if you don't mind.

## attention

`general_female_attention_01.wav`

> Excuse me! Have you got a moment?

`general_female_attention_02.wav`

> Traveler! Could I speak with you?

## warning

`general_female_warning_01.wav`

> Be careful out there. It isn't safe after dark.

`general_female_warning_02.wav`

> Watch yourself on the road. There's been trouble lately.

## acknowledgement

`general_female_acknowledgement_01.wav`

> I understand.

`general_female_acknowledgement_02.wav`

> Alright. I'll keep that in mind.

## well_wish

`general_female_well_wish_01.wav`

> Good luck out there.

`general_female_well_wish_02.wav`

> Take care, and may you have a safe journey.

## quest_offer

`general_female_quest_offer_01.wav`

> I could use some help, if you have a moment.

`general_female_quest_offer_02.wav`

> There's something troubling me. Would you be willing to help?

## quest_accepted

`general_female_quest_accepted_01.wav`

> Thank you. I knew I could count on you.

`general_female_quest_accepted_02.wav`

> That means a lot. Come back when it's done.

## quest_declined

`general_female_quest_declined_01.wav`

> Oh... I see. Maybe someone else can help.

`general_female_quest_declined_02.wav`

> That's a shame. I was really hoping you would.

## quest_complete

`general_female_quest_complete_01.wav`

> You did it! Thank you so much.

`general_female_quest_complete_02.wav`

> I'm glad you came back. You've been a great help.

---

# Merchant female

Provider: Chatterbox.

Reference: current/default Chatterbox reference; exact reference identity/settings still need confirmation.

Already generated files currently include:

```text
merchant_female_agree_01.wav
merchant_female_farewell_01.wav
merchant_female_greeting_01.wav
merchant_female_greeting_02.wav
merchant_female_greeting_03.wav
merchant_female_thanks_01.wav
```

Do not regenerate or rename these until the exact current reference/settings and spoken text are confirmed.
