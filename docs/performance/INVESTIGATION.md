# Seedvale — Performance Investigation Guide

## Workflow

```text
Reproduce → Benchmark → Trace → Analyze → Change → Benchmark again → Record
```

## Benchmark

Use the in-app benchmark to measure sustained performance and compare reproducible scenarios.

## Chrome Performance Trace

Use a Chrome Performance trace to investigate CPU/main-thread work, frame-time spikes, rendering stalls and chunk-streaming hitches.

## Trace Analyzer

Analyze captured traces with:

```bash
pnpm trace:analyze __TRACE_PATH__
```

The analyzer generates a Markdown report in:

```text
docs/performance/trace-results/Trace-YYYYMMDDTHHMMSS.md
```

## Decision

Identify the bottleneck before optimizing. Change one significant thing at a time, then benchmark again.
