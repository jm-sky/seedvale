# Implementation Notes: Settlement Elder Demographics

**Reviewed:** 2026-09-18
**Plan:** `settlements-npcs-045-settlement-elder-demographics.md`

## Review conclusion

Current architecture already has every state primitive needed. This implementation should stay a small worldgen change: extend the age generator, then enforce one settlement-level invariant after authored residents have been composed.

Do **not** add an elder entity/state/system.

The most important recon finding is placement of the invariant:

```text
generateFamilies()
→ appendAuthoredResidentFamilies()
→ ensure elder demographic invariant   ← new seam
→ resolveInitialProfessionStaffing()
→ applyProfessionFamilySurnames()
→ createVillagePlan()
```

Putting the guarantee inside `generateFamilies()` alone is incorrect because Lost Treasure authored residents are appended later; the Kazimierz host would otherwise always get a second forced elder.

## 1. Age ownership and existing classification

### `src/settlement/families.ts`

`FamilyMember.age` is the demographic authority.

Relevant current helpers:

- `familyAgeSeed(seed, familyIndex)` — isolated age RNG stream.
- `generateAdultAge(random)` — current uniform `18..70`.
- `generateSpouseAge(random, firstAge)` — clamps spouse to `±15` and current adult range.
- `generateChildAge(random, parentAgeA, parentAgeB)` — keeps child `0..17` and at least 18 years younger than the younger parent.
- `reservedHomeFamilies(seed)` — uses the same family-age seed convention for Anna/Piotr/Kasia/Marek.
- `generateFamily()` / `generateFamilies()` — family shape and generated roster.

Keep the age RNG independent from the existing `familySeed()` stream. Do not consume additional calls from the role/name/personality RNG.

### `src/settlement/npcPhysicalProfile.ts`

This already owns canonical life-stage semantics:

- 50–64: `mature`
- 65–84: `elderly`
- 85–100: `veryElderly`

Use `lifeStageForAge()`. Do not create another threshold table in `families.ts`.

`NPC_AGE_MAX = 100` is also already canonical.

## 2. Exact integration point

### `src/settlement/settlementGenerator.ts::generateSettlementCore()`

Current sequence:

1. `generateFamilies(...)`
2. normalize `authoredResident` input to array
3. `appendAuthoredResidentFamilies(...)` for non-OUTPOST
4. `resolveInitialProfessionStaffing(...)`
5. `applyProfessionFamilySurnames(...)`
6. `createVillagePlan(...)`

Insert the elder-invariant resolver between steps 3 and 4.

Reason:

- all residents that count toward the settlement are now visible,
- authored Kazimierz age 74 can satisfy the invariant,
- authored residents are still protected from mutation,
- role staffing sees the same adult workforce count because promotion only changes one existing adult's age,
- layout/NpcId ordering remains unchanged.

Do not put story-specific checks into `settlementPlanCache.ts`.

## 3. Suggested helper boundary

A small pure helper in `families.ts` is sufficient, e.g. semantically:

```ts
ensureSettlementElder(
  families: readonly FamilyDef[],
  size: VillageSize,
  seed: number,
): FamilyDef[]
```

Naming is not contractual.

Required behavior:

1. if `size === 'OUTPOST'`, return unchanged;
2. if any member already resolves to `elderly | veryElderly`, return unchanged;
3. candidates are adults from generated/reserved worldgen families, not authored `family-story-*`;
4. choose highest-age candidate; tie-break by existing family/member order;
5. deterministically choose a target elder age from an age-only seed;
6. copy only the selected family/member (and spouse if required);
7. preserve family/member array order and count.

Prefer a narrow predicate for "generated/reserved family eligible for demographic correction" rather than hardcoding Lost Treasure family id. Existing authored families currently use `family-story-*`; verify all authored resident prefixes before implementation and keep the rule explicit.

If a future authored-family naming convention contradicts that assumption, resolve it at the composition call site instead of guessing.

## 4. Age distribution change

The current `ADULT_AGE_RANGE = [18, 70]` plus uniform roll prevents meaningful old-age diversity.

Replace the uniform adult roll with a deterministic banded/weighted distribution while preserving a single `() => number` input.

Recommended shape, subject to small test calibration:

```text
18–49  → dominant band
50–64  → common mature band
65–84  → minority elderly band
85–100 → rare very-elderly band
```

Do not encode a fragile exact percentage requirement into gameplay tests. The guarantee handles correctness; the distribution only provides natural variety.

Important: `generateSpouseAge()` currently clamps against `ADULT_AGE_RANGE`. If that constant is removed/redefined, keep spouse bounds explicit and compatible with `NPC_AGE_MAX`.

## 5. Promotion and family consistency

The safest candidate is the already-oldest generated adult.

Why:

- minimizes the adjustment,
- deterministic without new selection RNG,
- least likely to create implausible family gaps.

For a single adult, only change that member's age.

For a married member:

- promote the candidate,
- if spouse gap becomes >15, raise spouse age enough to restore the max gap,
- clamp to `NPC_AGE_MAX`.

Raising parent age cannot make an existing child violate the minimum 18-year parent-child gap; it only increases that gap. Therefore no child mutation should be needed for an upward-only elder promotion.

Do not lower anyone's age to repair a promotion.

If both spouses become elderly because of the gap correction, that is valid; requirement is 1+, not exactly one.

## 6. Reserved home families

`reservedHomeFamilies()` are not authored story residents. Their ages are already generated demographic data, so they can be corrected by the same invariant.

Do not:

- add a third home household,
- rename them,
- alter reserved ordering,
- touch `RESERVED_CHARACTERS`.

Existing tests already pin their names/roles and broad age behavior.

## 7. Kazimierz / Lost Treasure Chronicles — hard guardrail

### `src/settlement/lostTreasureChroniclesElderResident.ts`

Keep unchanged:

- `LOST_TREASURE_ELDER_FAMILY_ID = 'family-story-lost-treasure-elder'`
- `LOST_TREASURE_ELDER_GIVEN_NAME = 'Kazimierz'`
- surname
- `LOST_TREASURE_ELDER_AGE = 74`
- `createLostTreasureElderFamily()`
- selection logic.

### `src/settlement/settlementPlanCache.ts`

Current authored-resident injection is correct:

```text
authoredResidentsFor(cell)
→ generateSettlementDef(..., authoredResidents)
```

Do not replace this with generic elder selection.

### `src/settlement/lostTreasureChroniclesElderResident.test.ts`

This suite already proves:

- stable age/name,
- append-after-generated ordering,
- stable flattened NpcId,
- selected host uniqueness,
- no leakage to unrelated settlements.

Keep it green and add a focused assertion that the final host roster satisfies the generic elder invariant without changing the authored elder.

## 8. NpcId / identity invariant

`src/settlement/npcIdentity.ts::settlementNpcId()` derives ids from flattened family/member order.

Therefore the implementation must not:

- insert a family,
- insert a member,
- reorder families,
- reorder members.

Age-only immutable copies preserve every current `NpcId`.

This is especially important because quest materialization binds authored names to stable ids from this order.

## 9. Profession staffing interaction

`resolveInitialProfessionStaffing()` runs after the proposed invariant.

Its workforce eligibility is based on adult age (`>=18`), so raising an already-adult age does not change adult count.

Do not add elder exclusions here as part of 045. Heavy-work participation belongs to `settlements-npcs-022`.

This plan must not conflate "elder demographics" with "elder work behavior."

## 10. Persistent worldgen cache

### `src/settlement/settlementWorldgenCache.ts`

`SETTLEMENT_DEFINITION_CACHE_VERSION` is explicitly documented to bump when family/profession generation output changes for the same seed/config.

045 changes `FamilyMember.age`, so bump it.

Do not add migration logic. Old cache entries should miss and regenerate.

This is necessary even though SaveData is untouched: `settlement-definitions` is disposable IndexedDB derived data, not runtime/persistent gameplay authority.

## 11. Tests to modify/add

### `src/settlement/families.test.ts`

Preserve existing tests and add:

- adult ages can exceed 70,
- natural elderly appears across a broad sample,
- veryElderly is reachable,
- non-elder adults still materially outnumber veryElderly across a broad sample,
- deterministic ages,
- spouse gap <=15 remains true,
- child constraints remain true.

The test currently pins name/role output for seed 7/LG. Because age RNG is isolated, this array should remain exactly unchanged.

For the guarantee itself, test the new pure helper directly where practical.

### Settlement composition test

Add/extend a test around `generateSettlementDef()` or the smallest existing generator suite to prove the invariant is applied **after authored merge**.

Important cases:

- SM/MD/LG/XL final roster has elder,
- OUTPOST not forced,
- authored elder already present → no generated member changed solely to create a second elder.

### `src/settlement/lostTreasureChroniclesElderResident.test.ts`

Keep all existing assertions. Add only targeted generic-invariant coverage; do not rewrite story tests around the new helper.

### Cache test

Update the expected `SETTLEMENT_DEFINITION_CACHE_VERSION` wherever pinned.

## 12. No persistence migration

Do not touch `SaveData` or save schema.

Settlement family age is deterministic worldgen identity/config data; the relevant invalidation is the disposable settlement-definition cache version.

Existing persisted `NpcStateRegistry` is keyed by stable `NpcId`. Since ids/order do not change, its continuity remains intact.

One consequence worth knowing during implementation: an existing save may reconstruct the same NPC id with a changed deterministic base age after cache invalidation. This plan intentionally changes demographic worldgen; do not invent a per-NPC saved age migration to freeze old worlds.

## 13. Implementation order

1. Add/adjust pure adult age distribution in `families.ts`.
2. Add pure elder predicate/resolver reusing `lifeStageForAge()`.
3. Add pure settlement elder-invariant helper.
4. Integrate it in `generateSettlementCore()` after authored merge.
5. Bump settlement-definition cache version.
6. Extend `families.test.ts`.
7. Add composition + Lost Treasure regression tests.
8. Run focused tests, then typecheck/lint/test/build.

## 14. Avoid

- `ElderNPC` class/type/state.
- new manager/registry.
- special schedule.
- mutating Kazimierz.
- implementing guarantee inside `generateFamilies()` only.
- adding an extra elder household.
- changing family/member order.
- using `Math.random()`.
- coupling elder definition to an ad hoc `age >= 65` check in multiple files.
- touching `settlements-npcs-022` work behavior in this implementation.
- SaveData migration for derived settlement demographics.

## Focused verification commands

```bash
pnpm vitest run src/settlement/families.test.ts
pnpm vitest run src/settlement/lostTreasureChroniclesElderResident.test.ts
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Browser verification remains the User's responsibility.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
