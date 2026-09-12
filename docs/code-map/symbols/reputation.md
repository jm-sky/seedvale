# Symbols

Generated from exported TypeScript symbols.

## `reputation/animalDeeds.ts`

- `AnimalDeedSettlementCandidate` — type — line 42
- `FULL_ANIMAL_DEED_EFFECT_DISTANCE` — const — line 53
- `MAX_ANIMAL_DEED_INFLUENCE_DISTANCE` — const — line 49
- `PlayerAnimalKillContext` — type — line 33
  - domain: quests-progression
  - system: reputation
  - role: Pure species-baseline + distance-attenuation resolver for the generic dangerous-animal-kill reputation/renown deed.
- `renownFactor` — function — line 86
- `reputationFactor` — function — line 77
- `resolveAnimalDeedConsequences` — function — line 127
  - domain: quests-progression

## `reputation/ReputationManager.ts`

- `applySocialConsequence` — function — line 148
- `NEUTRAL_REPUTATION` — const — line 34
- `Reputation` — type — line 19
- `ReputationDimension` — type — line 17
- `ReputationManager` — class — line 61
  - domain: quests-progression
  - system: reputation
  - role: Sole owner of per-settlement reputation dimensions and renown.
  - owns: SettlementSocialStanding
- `ReputationManagerInitial` — type — line 51
- `SettlementSocialStanding` — type — line 27
- `SocialConsequence` — type — line 136

## `reputation/socialExposure.ts`

- `GRAVE_DISTURBANCE_EXPOSURE` — const — line 52
- `resolveSocialExposure` — function — line 76
- `SOCIAL_EXPOSURE_BASE_RISK` — const — line 15
  - domain: quests-progression
  - system: reputation
  - role: Pure social-exposure risk + event-roll resolver.
- `SOCIAL_EXPOSURE_MIN_RISK` — const — line 19
- `SOCIAL_EXPOSURE_NIGHT_REDUCTION` — const — line 17
- `SocialExposureContext` — type — line 37
- `socialExposureEventRoll` — function — line 72
- `SocialExposureResult` — type — line 44
- `socialExposureRisk` — function — line 58
