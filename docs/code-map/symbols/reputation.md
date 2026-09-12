# Symbols

Generated from exported TypeScript symbols.

## `reputation/animalDeeds.ts`

- `FULL_ANIMAL_DEED_EFFECT_DISTANCE` — const — line 59
- `MAX_ANIMAL_DEED_INFLUENCE_DISTANCE` — const — line 55
- `PlayerAnimalKillContext` — type — line 41
  - domain: quests-progression
  - system: reputation
  - role: Pure species-baseline resolver producing the generic dangerous- animal-kill social-news signal, plus the canonical distance-attenuation functions `SocialNewsLedger` applies per settlement.
- `renownFactor` — function — line 92
- `reputationFactor` — function — line 83
- `resolveAnimalDeedSignal` — function — line 135
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

## `reputation/SocialNewsLedger.ts`

- `ANIMAL_DEED_NEWS_TTL_DAYS` — const — line 86
- `createSocialNewsLedger` — function — line 197
- `MAX_PENDING_SOCIAL_NEWS_EVENTS` — const — line 91
- `SOCIAL_NEWS_RELAY_FACTOR` — const — line 96
- `SocialNewsCarrierSnapshot` — type — line 53
- `SocialNewsEventKind` — type — line 47
- `SocialNewsEventSnapshot` — type — line 62
- `SocialNewsLedger` — type — line 111
- `SocialNewsLedgerSnapshot` — type — line 79
- `SocialNewsSettlementRef` — type — line 45
- `SocialNewsSignal` — type — line 37
  - domain: quests-progression
  - system: reputation
  - role: Owns pending social-news events and settlement knowledge carriers; resolves lazy, idempotent per-settlement catch-up into already-resolved `SocialConsequence`s without ever scanning the settlement grid.
  - owns: SocialNewsEvent
