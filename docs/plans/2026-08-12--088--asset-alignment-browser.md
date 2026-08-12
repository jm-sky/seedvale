# Asset Alignment Browser

## Status

- Status: `planned`
- Priority: 🟡 `medium`
- Effort: `L`
- Dependencies: `—`

## 1. Goal

Create an internal Seedvale developer tool for quickly loading, comparing, aligning and visually diagnosing 3D assets without starting the full game.

The tool should replace repeated manual "eyeballing" of transforms with a deterministic workflow that exposes model anchors, measurements and rendering context.

Typical problems include:

- tools not fitting correctly into NPC/player hands,
- lamps not mounting correctly to buildings,
- doors and building parts being offset,
- props having inconsistent origins, rotations or scale,
- AI agents guessing where an attachment point exists,
- visual differences that only become apparent under lighting or transparency.

The tool is primarily development tooling, not a gameplay feature.

## 2. Core workflow

The user loads two assets:

- **Reference** — the asset that defines the desired alignment context.
- **Target** — the asset being aligned.

Example:

```text
Reference: NPC_MALE
Target: AXE

Reference anchor: hand.right
Target anchor: grip
```

The browser displays both assets together and provides several synchronized views:

- Front
- Side
- Top
- Perspective

The user can inspect and adjust the Target transform, reload the asset and repeat the process without running the game.

## 3. Asset anchors / slots

Anchors are a first-class part of the asset alignment workflow.

The tool must expose named points defined by an asset instead of asking a developer or AI agent to infer them from geometry.

Examples:

```text
NPC
├── hand.left
├── hand.right
├── head
├── feet
└── interaction

AXE
├── origin
├── grip
└── blade

BUILDING
├── door
├── lamp_mount
├── window
└── interaction
```

An anchor should have at minimum:

- a stable name,
- a position relative to the asset,
- visualization in the viewport.

Orientation and a small controlled set of semantic types may be added where useful, for example `attachment`, `grip`, `mount`, `interaction` or `origin`.

Do not create a large generic metadata framework in the MVP.

## 4. Alignment inspection

When a reference anchor and target anchor are selected, the tool should:

- display both anchor markers,
- draw a visual connection between them,
- show their positions,
- show position delta,
- show rotation delta where meaningful,
- show Target scale,
- clearly identify Reference vs Target.

The tool should support a future/optional direct operation:

```text
Align Target.anchor → Reference.anchor
```

The exact automatic alignment algorithm should be defined during implementation planning, especially for orientation-aware anchors.

## 5. Transform editing

The MVP should allow editing the Target:

- position,
- rotation,
- scale.

It should also provide:

- transform reset,
- copying transform values,
- readable numeric values,
- quick reload after an asset file changes.

The tool should prefer the same coordinate conventions and model-loading path as Seedvale where practical.

## 6. Multi-view and visual helpers

The viewport should provide:

- orthographic Front / Side / Top views,
- Perspective view,
- grid,
- world axes,
- optional local axes,
- unit markers,
- bounding boxes,
- anchor markers and labels,
- optional line between selected anchors.

Camera controls should include orbit/rotate, pan, zoom and reset.

The layout should make precise alignment possible without excessive UI complexity.

## 7. Rendering and lighting preview

The tool must not be limited to geometry alignment. Some asset problems are only visible when rendered under representative game conditions.

Provide configurable preview lighting, including:

- ambient / hemisphere lighting,
- directional light,
- point light,
- light position,
- intensity,
- color,
- shadows where practical,
- asset-emitted or attached light where applicable.

A dedicated **Torch** preview is especially useful for checking a torch held by a character, including the apparent strength and reach of the light.

The tool should provide rendering presets such as:

- `Alignment`
- `Daylight`
- `Night`
- `Torch`
- `Transparent`
- `Game-like`

`Game-like` should reuse Seedvale's existing rendering/material/lighting conventions as far as practical instead of creating a visually unrelated renderer.

## 8. Transparency and materials

The preview must make transparent and semi-transparent assets easy to inspect.

The environment should provide a sensible neutral background and ground plane with enough contrast to expose alpha and material problems.

The tool should support inspection of:

- opacity,
- transparent materials,
- alpha blending / alpha test behaviour used by Seedvale,
- visible material response under the selected lighting preset.

The MVP does not need to become a material editor.

## 9. Environment

The preview scene should contain a predictable visual environment:

- neutral background,
- ground plane,
- optional grid on/near the ground,
- optional shadows,
- configurable light/dark background,
- enough contrast for transparent objects.

The ground plane should provide visual scale and contact context so that floating or incorrectly grounded assets are obvious.

## 10. AI-friendly diagnostics

The tool should generate a compact diagnostic representation suitable for passing to an AI coding/asset agent.

Example:

```text
Reference: NPC_MALE
Anchor: hand.right

Target: AXE
Anchor: grip

Position delta:
X: +0.032
Y: -0.081
Z: +0.014

Rotation delta:
X: +4.2°
Y: -1.8°
Z: +7.1°

Scale:
1.00

Status:
MISALIGNED
```

The diagnostic output should be copyable and should not require the AI to infer model structure from a screenshot alone.

## 11. AI snapshot

Provide a fast way to capture a diagnostic screenshot containing, where practical:

- Reference asset,
- Target asset,
- selected anchors,
- anchor labels/markers,
- grid and axes,
- current camera view,
- transform/alignment information,
- selected lighting preset.

The intended workflow is:

```text
Load → select anchors → inspect → snapshot + diagnostics → AI agent → modify asset → reload → verify
```

The snapshot should represent the actual preview configuration, including lighting and transparency state.

## 12. Asset metadata direction

The implementation should establish a small, explicit convention for asset anchors/slots that can be reused outside this tool.

The long-term direction is:

```text
Asset Anchors
    ↓
Equipment
    ↓
Interactions
    ↓
Animations
    ↓
Building attachments
```

The tool must not create a second, incompatible attachment system if an existing Seedvale mechanism can be extended.

Before implementation, inspect existing asset loading, item/equipment attachment and building/lamp code and identify the smallest shared abstraction that can serve these use cases.

## 13. Hot reload

Asset iteration is a primary use case. Reloading a changed model should be fast and should preserve useful viewer state where possible:

- selected assets,
- selected anchors,
- camera,
- current preview preset,
- Target transform where appropriate.

The tool should avoid requiring a full game reload for every asset adjustment.

## 14. Initial asset use cases

The first implementation should validate the tool against real Seedvale problems rather than synthetic examples:

1. NPC + axe/tool grip.
2. NPC/player + held torch, including light preview.
3. Building + wall lamp mount.
4. Building + door/other attached part.
5. Furniture + NPC interaction point.
6. Transparent/semi-transparent prop or material.

## 15. Out of scope

The first version is not:

- a Blender replacement,
- a general 3D modelling tool,
- a full animation editor,
- a material authoring tool,
- a full scene editor,
- a general asset management system.

Keep the scope focused on asset alignment, attachment-point inspection and representative visual preview.

## 16. Architecture constraints

Use the existing Seedvale stack:

- TypeScript,
- Three.js,
- WebGL2,
- Vite,
- existing Vue/UI conventions where appropriate.

Do not introduce another 3D engine or rendering abstraction.

Prefer reusing existing asset loaders, material setup and rendering conventions. The viewer should behave as close to the game as practical, while remaining isolated enough to iterate quickly.

The tool should not duplicate gameplay systems merely to render a preview. If existing rendering/asset utilities can be reused, they should be preferred.

## 17. Success criteria

The tool is successful when it makes recurring asset alignment work substantially faster and more deterministic.

MVP acceptance criteria:

- two real Seedvale assets can be loaded independently,
- Reference and Target are clearly distinguished,
- Front / Side / Top / Perspective views are available,
- grids, axes and ground context are available,
- all defined anchors/slots are listed and visualized,
- a reference/target anchor pair can be selected,
- position/rotation/scale diagnostics are visible,
- Target transform can be edited,
- assets can be reloaded quickly,
- lighting presets include at least a torch-oriented preview,
- transparent materials can be inspected against a useful background/ground,
- a diagnostic screenshot can be captured,
- diagnostic text can be copied for an AI agent.

## 18. Implementation planning questions

Before coding, the implementation plan should resolve:

1. Where should the viewer live in the Vite/Vue application?
2. How are GLB/GLTF assets currently loaded and which utilities can be reused?
3. How should anchors be represented in existing assets without creating an incompatible metadata system?
4. Can anchors be authored directly in GLB nodes, through external metadata, or both?
5. How should anchor transforms be resolved relative to nested model transforms?
6. Which existing Seedvale lighting/material setup can be reused for `Game-like` mode?
7. How should transparency be rendered so the viewer matches gameplay behaviour?
8. What is the smallest useful hot-reload mechanism?
9. How should screenshots and diagnostic data be generated consistently?
10. Which parts should remain local to the tool and which should become shared Seedvale asset utilities?

## 19. Implementation phases

### Phase 1 — Viewer shell

- dedicated developer route/screen,
- asset loading,
- Reference/Target selection,
- multi-view camera setup,
- grid/axes/ground.

### Phase 2 — Anchor inspection

- anchor representation,
- anchor discovery/listing,
- marker rendering,
- Reference/Target anchor selection,
- alignment diagnostics.

### Phase 3 — Transform workflow

- numeric transform controls,
- Target editing,
- reset/copy,
- fast reload,
- optional direct alignment operation.

### Phase 4 — Rendering preview

- lighting presets,
- Torch preview,
- shadows where useful,
- transparency/material inspection,
- background/ground presets,
- Game-like mode.

### Phase 5 — AI workflow

- diagnostic text export,
- snapshot capture,
- combined visual + textual context,
- polish based on real asset alignment tasks.

## 20. Verification

Technical verification should cover the viewer code and any shared asset utilities with the repository's normal checks.

Visual/manual verification must be performed in a browser against real assets. Passing TypeScript/build/lint is not sufficient to verify alignment or rendering quality.

At minimum, manually verify:

- hand + tool alignment,
- building + lamp alignment,
- torch light appearance,
- transparent asset readability,
- ground contact and scale,
- all four camera views,
- hot reload,
- diagnostic snapshot output.
