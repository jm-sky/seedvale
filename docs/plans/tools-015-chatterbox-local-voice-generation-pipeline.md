# Plan: Chatterbox local voice generation pipeline

**Created:** 2026-09-16
**Status:** `draft` 📝
**Priority:** high · **Effort:** M
**Depends on:** npc-041, npc-042
**Domain:** `tools`
**Type:** `infrastructure`
**Subdomains:** `automation` `development`
**Tags:** `chatterbox` `voice` `audio` `generation`
**Roadmap:** -

## Goal

Create a reproducible local developer pipeline inside the Seedvale repository for generating NPC voice assets with Chatterbox.

After this plan, an AI agent or developer should be able to:

1. install the required local Chatterbox environment,
2. select a configured voice/reference,
3. generate one line or a catalog batch,
4. convert the result to Seedvale's runtime audio format,
5. place generated assets in the correct `public/sounds/npc/` hierarchy,
6. preserve generation settings and reference provenance,
7. rerun generation later without reconstructing the workflow manually.

Chatterbox remains an **offline development dependency only**. It must never become a browser/runtime dependency.

## Dependencies

### npc-041

Use its Chatterbox POC findings, especially:

- selected Chatterbox variant/model,
- Polish-generation quality findings,
- generation settings that produced acceptable results,
- whether no-reference/default generation is acceptable for any archetype,
- reference-audio requirements and preferred reference duration,
- audio export/normalization findings.

Do not independently create a second competing POC pipeline.

### npc-042

Consume the canonical dialogue and voice-profile data defined there, including:

- universal dialogue intents,
- campfire dialogue samples,
- voice archetypes,
- reference-audio metadata,
- sample-generation matrix.

The generation pipeline must operate from the same canonical dialogue and voice-profile data rather than maintaining another list of phrases, voices, archetypes or reference clips.

## Required repository tooling

Create a dedicated local tooling area following existing repository conventions discovered during recon.

Expected conceptual ownership:

```text
tools/chatterbox/
  README.md
  ...
```

The implementation agent must determine the exact structure after checking existing repository tooling conventions.

The tooling must contain everything reasonably required to reproduce generation except:

- model checkpoints,
- large downloaded ML artifacts,
- reference recordings that cannot legally be committed,
- generated caches,
- Python virtual environments.

These must be ignored/documented rather than committed.

## Environment bootstrap

Provide a reproducible setup path for the supported development environment.

The implementation agent must:

1. verify Chatterbox's current official installation requirements,
2. identify compatible Python and PyTorch versions,
3. determine CPU/CUDA requirements and supported execution modes,
4. pin dependencies sufficiently to avoid accidental environment drift,
5. provide an installation/bootstrap command or script,
6. ensure generated environments and model caches are excluded from git.

Prefer a repository-local isolated environment.

Examples of acceptable mechanisms include:

```text
venv
uv
requirements.txt
pyproject.toml
```

Choose the smallest mechanism appropriate for Chatterbox and existing Seedvale tooling.

Do not install Python packages globally as the documented workflow.

## Generator CLI

Provide one clear repository command for voice generation.

The interface should support at least:

```text
generate one semantic line
generate one voice profile
generate a selected batch
generate all catalog entries requested by the current batch definition
```

Exact syntax may follow repository conventions, but conceptually it should allow operations such as:

```text
voice generate --voice guard --line greeting
voice generate --voice merchant --batch universal
voice generate --batch initial
```

The user should not need to edit Python source code to select a line or voice.

## Canonical input data

The generator must consume the catalog/data introduced by `npc-042`.

Keep these concerns separate:

```text
dialogue text
voice profiles
reference audio configuration
generation settings
output asset mapping
```

Do not duplicate dialogue strings inside generator source code.

Stable semantic IDs must determine generated output identity, for example:

```text
greeting
farewell
weather.question
weather.answer
```

## Voice reference configuration

A voice profile must be able to identify:

- voice archetype/profile ID,
- reference audio path,
- reference provenance/source,
- generation parameters,
- optional notes about reference preparation.

Reference recordings may live outside git when licensing or size requires it.

The repository configuration should support a documented local reference directory, for example conceptually:

```text
.local/voice-references/
```

Do not silently depend on undocumented absolute filesystem paths.

Missing references must produce a clear error identifying the missing profile/path.

## Generation

The pipeline must wrap Chatterbox sufficiently that generation is deterministic/repeatable where Chatterbox permits it.

Record/configure material parameters such as:

- selected model,
- reference audio,
- seed where supported,
- exaggeration/emotion controls,
- CFG or equivalent controls,
- temperature/sampling parameters where applicable,
- language/model variant,
- any preprocessing materially affecting the voice.

Avoid exposing irrelevant model internals unless they are useful for reproducing output.

## Audio post-processing

Generated output must automatically be normalized to Seedvale's runtime requirements.

Reuse repository audio conventions discovered during recon.

Expected output:

```text
mono OGG
```

The pipeline should handle required operations such as:

```text
generation
→ trim excessive silence if necessary
→ sample/channel conversion
→ normalization where appropriate
→ OGG encoding
→ final asset path
```

Prefer invoking a standard local tool such as `ffmpeg` rather than implementing audio conversion manually.

Document external prerequisites.

## Output paths

Generate directly into the hierarchy established by `npc-042`, conceptually:

```text
public/sounds/npc/
  common/<voice-profile>/<semantic-id>-NN.ogg
  profession/<profession>/<voice-profile>/<semantic-id>-NN.ogg
  quest/<quest-id>/<npc-id>/<semantic-id>-NN.ogg
```

The generator must derive paths from canonical data.

Do not require developers to manually rename generated files.

## Existing-file safety

Generation must not silently overwrite existing curated assets.

Provide one of:

- explicit `--force`,
- version/variant selection,
- equivalent deliberate overwrite mechanism.

Default behavior must preserve existing output.

## Batch generation

Support the initial `npc-042` batch:

```text
10 universal intents × 7 voice archetypes = 70 clips

2 campfire topics
× question/answer
× male/female
= 8 clips
```

Total:

```text
78 clips
```

Batch generation must use the canonical catalog instead of maintaining a hard-coded list of those 78 combinations.

## Validation

Before generation, validate:

- requested semantic ID exists,
- requested voice profile exists,
- required reference audio exists where the profile requires it,
- required text is non-empty,
- output mapping is valid.

After generation, validate at least:

- output file exists,
- expected format/container,
- mono channel requirement,
- non-zero duration.

Fail clearly rather than silently skipping invalid entries.

## Developer commands

Expose convenient repository-level commands if consistent with existing tooling.

Desired developer experience:

```text
install/bootstrap voice tooling once

pnpm voice:generate ...
```

or an equivalent existing repository convention.

Node scripts may orchestrate the developer command, but Chatterbox itself remains isolated in its Python environment.

Do not pull Chatterbox/PyTorch dependencies into the Vite/browser dependency graph.

## Documentation

`tools/chatterbox/README.md` or equivalent must explain:

- prerequisites,
- installation,
- GPU/CPU considerations,
- first setup/model download,
- reference-audio location,
- single-line generation,
- batch generation,
- regeneration/overwrite behavior,
- output directories,
- common failures,
- where provenance and generation configuration live.

A fresh developer checkout should be able to reconstruct the generation environment using this documentation.

## Repository hygiene

Do not commit:

- Python virtual environments,
- Chatterbox model checkpoints,
- Hugging Face/model caches,
- temporary WAV generation files unless deliberately retained,
- CUDA/PyTorch caches,
- private/unlicensed reference recordings.

Update `.gitignore` where necessary.

Do commit:

- scripts,
- dependency declarations,
- configuration schemas/data,
- documentation,
- small legally distributable test/reference assets where appropriate.

## Runtime boundary

The game runtime must remain completely independent of Chatterbox.

Forbidden:

```text
browser → Chatterbox
game startup → Python
runtime network TTS
runtime model loading
```

Required architecture:

```text
catalog + voice profile + reference
          ↓
local developer generator
          ↓
static OGG asset
          ↓
existing Seedvale NPC/world audio runtime
```

## Verification

Automated/tooling verification:

- bootstrap/install path works from documented prerequisites,
- generator help/CLI starts correctly,
- one configured voice can generate one test line,
- generated file passes audio validation,
- batch dry-run resolves expected input/output mappings,
- malformed/missing voice references fail clearly,
- existing asset is not overwritten without explicit permission,
- normal `pnpm typecheck` / build remains independent of the Python environment.

Do not perform browser verification.

Manual listening and in-game verification are performed by the user.

## Implementation guidance

Before implementation:

- read `CLAUDE.md`,
- read `docs/STATE.md`,
- read `docs/plans/PLANNING.md`,
- inspect `npc-041` and `npc-042`,
- inspect existing `tools/`, `scripts/`, package scripts and `.gitignore`,
- verify the current official Chatterbox installation/API rather than relying on remembered examples.

Add JSDoc to new architectural/public orchestration functions where it materially improves preflight discovery; use `@domain tools` where useful.

Do not run `pnpm docs:sync`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
