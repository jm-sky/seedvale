# Performance Tools Backlog

## Trace Analyzer

### High priority

- [ ] **Actionable findings** — add a concise `Findings` section that identifies likely bottlenecks instead of only listing trace events.
- [ ] **Real application CPU attribution** — look through `RunTask`, `RunMicrotasks` and other browser/container events to the actual application call tree.
- [ ] **Hitch → cause correlation** — for the longest / worst frames, identify the CPU work or other trace activity responsible where possible.
- [ ] **Three.js attribution** — report meaningful CPU time, call count and percentage for renderer operations, with useful call trees instead of isolated function names.
- [ ] **GPU attribution** — distinguish attributable GPU work from generic `GPUTask`; explicitly report when the trace does not provide enough information.

### Medium priority

- [ ] **Browser noise classification** — distinguish application work from Chrome/V8/debugger/profiling infrastructure and avoid presenting framework containers as bottlenecks.
- [ ] **Frame-focused analysis** — connect frame statistics (P95/P99/longest frames) with relevant CPU, rendering and streaming events.
- [ ] **Chunk-streaming correlation** — detect and report streaming-related work/hitches when the trace contains enough evidence.
- [ ] **Actionability / severity** — classify findings by impact and confidence, and avoid implying a bottleneck when the evidence is weak.

### Report quality

- [ ] Keep raw event statistics, but make them secondary to conclusions and evidence.
- [ ] Prefer `total time`, `%`, `calls`, `average`, `max` and relevant call trees over isolated sample counts.
- [ ] Explicitly mark signals that are **not actionable** or **not attributable** from the trace.
