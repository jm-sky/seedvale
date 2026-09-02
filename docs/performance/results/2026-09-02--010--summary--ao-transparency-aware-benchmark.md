# Render Isolation — AO Transparency-Aware Benchmark

**Date:** 2026-09-02
**Status:** `measured`

## Scope

Compared the standard `stream` benchmark against the same benchmark with:

```text
aoNoTransparencyAware=1
```

Both runs used:

```text
benchmark=stream
seed=42
res=193
```

## Results

| Metric                 | Baseline | No Transparency-Aware |   Change |
| ---------------------- | -------: | --------------------: | -------: |
| FPS avg                |     27.5 |              **42.4** | **+54%** |
| Frame time avg         |  36.3 ms |           **23.6 ms** | **−35%** |
| RENDER avg             |  23.0 ms |           **12.1 ms** | **−47%** |
| Max frame              | 162.5 ms |              195.5 ms |    worse |
| Largest labelled hitch |  92.6 ms |               83.2 ms |  −9.4 ms |
| Created programs       |      108 |                   107 |       −1 |
| Final programs         |      107 |                   106 |       −1 |

## Findings

### 1. Transparency-aware AO is a confirmed sustained rendering cost

Disabling `transparencyAware` reduced average `RENDER` time by approximately **47%** and increased average FPS by approximately **54%**.

This is a large and reproducible performance improvement.

The optimization does **not** disable AO itself. It removes the transparency-aware path.

### 2. It does not solve program/shader churn

Program Census remained almost identical between runs.

The late program-creation transitions were effectively unchanged, including the large streaming-related transitions.

Therefore:

```text
transparencyAware
    → large sustained render cost
    → NOT the root cause of late program creation
```

### 3. Streaming hitches remain a separate problem

The optimization did not eliminate streaming-related hitches.

The maximum frame time actually increased:

```text
162.5 ms → 195.5 ms
```

The largest labelled hitch improved somewhat:

```text
92.6 ms → 83.2 ms
```

but a large amount of frame time remains unattributed.

Therefore the remaining hitch problem should be investigated independently from AO.

## Decision

**Keep `transparencyAware` disabled for now** as a validated performance optimization, subject to manual visual-quality verification.

Do not spend further investigation effort on AO shader/program count at this stage.

### Next investigation target

Focus on **streaming hitch attribution**, especially:

* chunk mesh generation;
* grass generation;
* late asset/material first-use;
* remaining unattributed frame time;
* relationship between streaming events and long frames.

The current evidence does not justify further shader/program optimization before these costs are better attributed.
