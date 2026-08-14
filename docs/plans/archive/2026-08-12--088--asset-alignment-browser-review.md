# Review — Asset Alignment Browser

## 1. Overall assessment

**READY WITH CHANGES**

The PRD is well directed and addresses a real Seedvale problem. It correctly combines alignment, anchors, diagnostics and representative rendering instead of turning the tool into a general 3D editor.

Before implementation planning, several product-level decisions should be clarified, especially anchor orientation, skinned assets, resolved transforms, asset-domain ownership of anchors, the AI diagnostic contract and runtime reuse.

The current code confirms that these are real problems rather than hypothetical ones: held tools currently use manually maintained per-tool position, rotation, scale and grip offsets, while house lamps use manual local mount data. The new direction should ultimately reduce or replace this kind of scattered alignment data rather than merely make it easier to debug.

## 2. Strengths

- The problem is correctly framed as a transform/alignment and diagnostic problem, not merely a model preview problem.
- The Reference / Target model is simple and useful for both humans and AI agents.
- Anchors are treated as a potentially reusable Seedvale concept rather than only viewport markers.
- Lighting, transparency, ground and Game-like rendering are correctly included.
- Initial use cases are based on real Seedvale problems rather than synthetic demos.
- The scope explicitly avoids becoming a Blender replacement.
- The architecture section correctly prefers existing asset loading and rendering mechanisms.
- AI diagnostics are correctly positioned as textual data that complements screenshots rather than requiring AI to infer everything from images.

## 3. Issues

### 🔴 Critical

#### C1. Anchor contract is incomplete

The current minimum contract is stable name + position + visualization. That is insufficient for orientation-sensitive attachments such as grips, hand sockets and building mounts.

The PRD should require an anchor orientation, or explicitly state that orientation is optional only for anchors whose semantics do not require it.

#### C2. Skinned/skeleton assets are not specified

NPCs are a primary use case, and existing Seedvale equipment attachment already resolves hand bones. The PRD should state whether anchors can be associated with bones/nodes and what pose is used for MVP.

A reasonable MVP boundary is rest/bind pose; animation editing can remain out of scope.

#### C3. Root transform and resolved anchor transform must be distinguishable

Diagnostics need to distinguish the asset root transform from the final world-space transform of an anchor resolved through nested GLTF nodes/bones.

The implementation plan can decide the technical mechanism, but the PRD should require this distinction.

#### C4. Missing/invalid anchor diagnostics are required

The tool should explicitly report missing anchors, duplicate names, missing orientation where required and other invalid anchor states. AI should not have to infer why an expected attachment point is unavailable.

#### C5. Automatic Align needs a product-level definition

The PRD does not need the algorithm, but it should define the expected result: when the selected anchors are aligned, their positions coincide and, when orientation is available, their coordinate frames are aligned according to the chosen alignment semantics.

### 🟡 Important

#### I1. Add asset-only inspection

The viewer should support inspecting one asset and its anchors without requiring a Reference/Target pair.

#### I2. Show anchor local frames

Anchor markers should optionally display local X/Y/Z axes. This is essential for orientation debugging.

#### I3. Clarify semantic anchor types

Types should be optional semantic information, not a mandatory hierarchy or large metadata framework. A small controlled set is appropriate.

#### I4. Require stable and unique anchor names

Names should be unique within an asset and stable enough for runtime and AI workflows. They should not depend on generated runtime IDs.

#### I5. Define hot-reload failure behaviour

If a selected asset or anchor disappears after reload, the tool should report the invalid selection instead of silently preserving stale state.

#### I6. Expand transform/origin diagnostics

Include root scale, bounding dimensions, origin information and anchor-to-origin distance where useful.

#### I7. Grounding needs explicit diagnostics

The ground plane is useful, but the PRD should explicitly require enough information to identify floating/underground assets and their lowest point. Full terrain preview is not necessary for MVP.

#### I8. Terrain placement should be acknowledged

Ground plane does not reproduce terrain slopes. The PRD should state that MVP provides deterministic ground/contact diagnostics rather than a full terrain placement simulator.

### ⚪ Minor

#### M1. Clarify “synchronized views”

The requirement should mean that all views represent the same scene/transform state.

#### M2. Separate rendering presets from transparency/environment modes

`Transparent` is conceptually different from lighting presets. The final UI terminology can be decided during planning.

#### M3. Reduce ambiguous “where practical / where possible” wording

MVP requirements should be explicit; implementation constraints can be documented in the implementation plan.

## 4. Missing requirements

Add requirements for:

- asset-only inspection,
- root transform diagnostics,
- resolved world-space anchor transforms,
- anchor local axes,
- stable/unique anchor names,
- missing/invalid anchor diagnostics,
- skinned asset / bone anchor behaviour,
- explicit ground contact diagnostics,
- reload behaviour when asset structure changes,
- deterministic AI diagnostic output,
- runtime consumption of shared asset anchor definitions.

The PRD should also explicitly state that anchor definitions belong to the asset domain and must not be owned exclusively by the browser.

## 5. MVP recommendation

### Must be in MVP

- Reference + Target viewer.
- Asset-only inspection.
- Existing Seedvale asset loading path.
- Front / Side / Top / Perspective views.
- Grid, world axes, ground and bounding box.
- Origin and dimensions diagnostics.
- Anchor discovery/listing and visualization.
- Anchor local frames where orientation exists.
- Reference/Target anchor selection.
- Position/rotation/scale diagnostics.
- Target transform editing and reset.
- Copyable numeric diagnostics.
- Fast asset reload.
- Neutral, daylight, night and torch-oriented preview.
- Transparency/opacity inspection.
- Diagnostic screenshot and text export.
- Validation against real Seedvale alignment cases.

### Defer

- Full anchor authoring UI.
- Advanced skeleton editor.
- Animation pose editor.
- Full material editor.
- Full scene composition.
- Batch asset processing.
- Asset management system.
- Automatic asset “repair”.

The MVP should remain a diagnostic/alignment browser, not an asset authoring application.

## 6. Anchor/Slot recommendations

### Anchor should conceptually be a transform frame

At minimum:

- stable name,
- position,
- orientation when meaningful.

### Semantic type should be optional

A small controlled set such as `origin`, `attachment`, `grip`, `mount`, `interaction` is sufficient as a direction. The final set should be decided during implementation planning.

### Hierarchy should be supported, but not over-designed

Anchors may be associated with the relevant node/bone hierarchy. There is no need for a large anchor framework in MVP.

### Anchors should belong to asset metadata/domain

The browser should not become the sole owner of alignment data. The long-term direction should be:

`Asset → Anchors → Equipment / Interactions / Animations / Building attachments`

The implementation plan should determine the smallest shared abstraction and whether GLB nodes, external metadata or both are appropriate.

### Runtime reuse is a requirement

The same anchor definition should eventually be consumable by runtime systems. This is critical for avoiding a third parallel alignment mechanism.

## 7. AI workflow recommendations

The screenshot should be treated as visual context, not the authoritative data source.

Diagnostic output should include, at minimum:

- reference asset ID/name,
- reference anchor name,
- target asset ID/name,
- target anchor name,
- anchor positions,
- anchor orientations where applicable,
- resolved world-space transforms,
- asset root transform,
- position/rotation delta,
- target scale,
- camera/view,
- rendering preset,
- transparency state,
- status/warnings.

The AI should also be able to receive a complete list of available anchors without inspecting the screenshot.

A snapshot should preserve the actual preview state so the visual and textual diagnostics describe the same scene.

## 8. Rendering recommendations

Use two conceptual rendering modes:

### Diagnostic

Optimized for precise inspection:

- grid,
- axes,
- labels,
- anchor gizmos,
- bounding box,
- neutral/high-contrast background,
- controlled lighting.

### Game-like

Optimized for visual fidelity to Seedvale:

- existing materials,
- existing lighting conventions,
- shadows where supported,
- relevant tone mapping/post-processing if already used by the game.

The `Torch` preview should use the actual attached-light behaviour where possible, not merely an unrelated point light placed beside the model. It should make light position, intensity, color, reach and shadows diagnosable.

Transparency should be tested against both neutral and game-like contexts so alpha/material problems are visible.

## 9. Recommended PRD changes

1. Add asset-only inspection mode.
2. Require anchor orientation where semantically relevant.
3. Add local-axis visualization for anchors.
4. Define skinned assets and MVP pose behaviour.
5. Require root-transform vs resolved-anchor-transform diagnostics.
6. Add origin, dimensions and ground-contact diagnostics.
7. Add explicit missing/invalid anchor diagnostics.
8. Require stable and unique anchor names.
9. Define the expected result of automatic anchor alignment without specifying its algorithm.
10. State explicitly that anchors belong to the asset domain, not only the browser.
11. State explicitly that runtime systems should be able to consume the same anchor definitions.
12. Reference existing held-tool alignment data as a migration/integration candidate.
13. Reference existing building/lamp mount data as another candidate.
14. Define deterministic AI diagnostic output.
15. Separate Diagnostic rendering from Game-like rendering conceptually.
16. Clarify that Torch preview should represent actual attached-light behaviour.
17. Make success criteria measurable around deterministic diagnosis and real Seedvale use cases.
18. Remove ambiguous MVP wording such as “where practical” where a requirement is intended to be mandatory.

## 10. Readiness for implementation planning

The PRD is approximately 80–85% ready.

Before implementation planning, resolve the following product-level points:

- anchor orientation,
- skinned/bone asset behaviour,
- root vs resolved anchor transforms,
- asset-domain ownership of anchors,
- runtime reuse expectations,
- AI diagnostic contract,
- Game-like vs Diagnostic rendering semantics,
- measurable success criteria.

After these changes, the PRD should be a strong input for detailed implementation planning without expanding into a general 3D editor.
