# Mastra Capabilities Inventory

Verified against official Mastra documentation and the `mastra-ai/mastra` repository on 2026-08-31.
This file is the compatibility inventory for Mastra Evolution. Re-check it when upgrading `@mastra/core` or `@mastra/memory`.

**Verdict:** RFC.md is a sound direction. Mastra already owns execution, memory, skills, evaluation, A2A, auth, storage, and observability. It does not ship a closed evidence → lesson → proposal → evaluate → promote loop. Evolution should orchestrate those primitives through an adapter, not replace them.

**Observed npm versions at verification:** `@mastra/core@1.63.2` (published ~2026-08-29). Pin the supported range after the adapter spike in U4.

## Capability matrix

| RFC capability flag | Official status | Integration surface | Notes for Evolution |
| --- | --- | --- | --- |
| `observationalMemory` | Present | `Memory` from `@mastra/memory`; `observationalMemory: true` or config object with required `model` | Observer + Reflector; default model `google/gemini-2.5-flash`. Storage adapters: `@mastra/pg`, `@mastra/libsql`, `@mastra/mysql`, `@mastra/mongodb`, `@mastra/convex`, `@mastra/oracledb`. |
| `memoryExtractors` | Present | `Extractor` on `observationalMemory.observation.extract` / `reflection.extract` | Schema-backed extractors run a follow-up structured-output call. `onExtracted` fires after parse, before persist. Stream chunks: `data-om-observation-end`, `data-om-buffering-end`. Extractors run on observe/reflect cycles, not every user turn. |
| `skills` | Present | Agent `skills`, `createSkill()`, workspace `skills` paths, `SKILL.md` | Follows the Agent Skills specification. Do not invent a parallel format. |
| `skillSearch` | Present | `SkillSearchProcessor` from `@mastra/core/processors`; workspace `bm25` / vector / hybrid | Meta-tools `search_skills` and `load_skill`. Eager alternative is `SkillsProcessor`. |
| `versionedSkills` | Present | `VersionedSkillSource`, `CompositeVersionedSkillSource`, storage `mastra_skills` / `mastra_skill_versions` / `mastra_skill_blobs` | Publish through Mastra skill storage + blob store. FGA covers `/stored/skills`. |
| `feedback` | Present | Observability feedback records linked to traces/spans (`mastra.observability.addFeedback` in docs) | Use as an evidence source. Do not store a second feedback model. |
| `datasets` | Present | `mastra.datasets`; version bumps on every item mutation | Production failures become dataset items. Pin experiments to a dataset version. |
| `experiments` | Present | `dataset.startExperiment()`, `runEvals` | One target per experiment. Baseline vs candidate is two runs on the same pinned dataset. Memory-enabled agents need an inline `task` that passes `{ threadId, resourceId }`. |
| `toolHooks` | Present | Agent `hooks.beforeToolCall` / `hooks.afterToolCall` | Applies to assigned, memory, workspace, agent, and workflow tools. |
| `dynamicWorkflows` | Present | Stored JSON workflow definitions; `addDynamicWorkflow` / client `upsertDynamicWorkflow` | Later evolution target (v0.4). Requires `stored-workflows:write`. |
| `fineGrainedAuthorization` | Present | `server.fga`, `IFGAProvider` | Consume Mastra identity/resource context. Do not invent a parallel authz model. |
| processors | Present | Input/output processors; `processInputStep`; `processLLMRequest` | Attach Evolution as processors/hooks. Do not subclass `Agent`. |
| A2A | Present | Mastra A2A server/client | Transport-agnostic learning: consume thread/resource/trace context, not A2A frames. |
| observability / OTel | Present | Mastra tracing, logs, metrics, `OtelBridge` (experimental) | Emit `evolution.*` spans alongside Mastra traces. |
| workspace / sandbox | Present | `Workspace`, `LocalFilesystem`, mounts, FUSE for remote sandboxes | Local hobby path: `LocalFilesystem`. Cloud artifacts: blob store, not a FUSE-mounted SQLite file. |
| LibSQL local storage | Present | `@mastra/libsql` `file:./mastra.db` | Hobby default for Mastra domains. Evolution local store may be a sibling file DB, never a GCS FUSE path. |

## RFC citation check

| RFC reference | Official status |
| --- | --- |
| https://mastra.ai/research/observational-memory | Confirmed. LongMemEval: 84.23% gpt-4o, 94.87% gpt-5-mini. |
| https://mastra.ai/blog/observational-memory | Confirmed. Same scores. |
| https://mastra.ai/blog/introducing-memory-extractors | Confirmed. |
| https://mastra.ai/blog/introducing-skill-search-processor | Confirmed. |
| https://mastra.ai/blog/introducing-datasets | Confirmed (datasets are versioned collections of test cases). |
| https://mastra.ai/blog/mastra-experiments | Confirmed. |
| https://mastra.ai/blog/changelog-2026-02-13 | Confirmed. Breaking: `observe(threadId, resourceId)` → `observe({ threadId, resourceId })`. Standalone `observe()` plus `ObserveHooks`. |
| https://mastra.ai/blog/changelog-2026-02-24 | Confirmed. Reliability/introspection; no `@mastra/core` breaking changes in that note. |
| https://docs.cloud.google.com/run/docs/configuring/services/cloud-storage-volume-mounts | Confirmed. Cloud Storage FUSE: no file locking, last-writer-wins, not fully POSIX. |

## Adapter implications

1. Primary learning ingress is `Extractor.onExtracted`, with fallbacks from tool hooks and observability feedback when extractors are absent or fire too rarely.
2. Skill publication should write Mastra-compatible `SKILL.md` trees and register them via workspace `skillSource` / versioned skill storage so `SkillSearchProcessor` can discover them.
3. Candidate evaluation must create or append Mastra dataset items, pin a dataset version, and run two experiments (baseline agent vs candidate skill set). For observational-memory agents, use an inline experiment `task` and pre-create threads.
4. Isolate every Mastra import in `@mastra-evolution/mastra`. Probe capabilities at runtime; degrade as RFC.md section 25 describes.
5. Do not put transactional Evolution state on a Cloud Storage FUSE mount.

## Re-verification checklist

When Mastra releases:

- [ ] `Extractor` constructor and `onExtracted` context
- [ ] `observe({ threadId, resourceId })` object signature
- [ ] `SkillSearchProcessor` import path
- [ ] `CompositeVersionedSkillSource` + skill blob tables
- [ ] `dataset.startExperiment` memory forwarding behavior
- [ ] FGA stored-skill permissions
- [ ] OM-supported storage adapters list
