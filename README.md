# specmit

> **Auto spec → MVP, Made in Taiwan, MIT licensed.**
> 把「人工搬運」的管線升級成一個指令跑完——工具之間仍然鬆耦合，只靠檔案格式溝通。
>
> *specmit = spec + submit + MIT（Made in Taiwan）*

🔒 **Private while spec-sonar is private** — this repo consumes spec-sonar's goal-graph format; it goes public together with (or after) spec-sonar, never before. See "Publication gate" below.

## The pipeline

```
  vague idea
      │  idea-to-spec (spec-sonar) — 5–7 round convergence
      ▼
  spec/project-spec.md + STATE_FINAL.json
      │  goal-decomposer (spec-sonar) — dependency inference + pre-adjudication
      ▼
  spec/goal-graph.json + spec/goals/G*.md + spec/contracts/C*.md
      │
      │  ╔══════════════ THIS REPO ══════════════╗
      │  ║ pipeline-runner (L3b bridge skill)    ║  reads graph, launches runner,
      │  ║   └─▶ workflows/idea-to-mvp.js (L3)   ║  batch-parallel executor agents
      │  ║         governed by                   ║  (model_tier-mapped), BLOCKED
      │  ║   PIPELINE-CONTRACT.md (L2)           ║  protocol + governance hook
      │  ╚═══════════════════════════════════════╝
      ▼
  working code + runs/<run-id>/run-report.json + status writeback
```

## Loose coupling is the law

- The runner **imports nothing and calls no repo code**. The only interface is files: `goal-graph.json` (canonical schema owned by spec-sonar), `goals/G*.md` (self-contained, passed verbatim to executor agents), and `run-report.json` (owned here).
- [PIPELINE-CONTRACT.md](./PIPELINE-CONTRACT.md) is a **consumer contract**, not a format definition — it pins `schema_version 1.0`, lists the minimal field subset the runner reads (tolerant to everything else), and the one mutation allowed upstream (`goals[].status` writeback). The producer keeps owning the format.
- Every tool in the chain stays independently usable. Delete this repo and nothing upstream breaks.

## How to use

1. Install the bridge skill into the project where you want to run a pipeline:
   ```
   skills/pipeline-runner/  →  .claude/skills/pipeline-runner/
   workflows/idea-to-mvp.js →  .claude/workflows/idea-to-mvp.js
   ```
2. In a Claude Code session: say **「跑完整管線」 / "run the pipeline"**. The skill routes by what exists:
   - no spec → defers to `idea-to-spec`
   - spec but no goal graph → defers to `goal-decomposer`
   - graph + goals present → pre-flight checks, then launches the workflow
3. Read `runs/<run-id>/run-report.json`. BLOCKED questions come back to you (executors never guess); answer them and resume with `only: [ids]`.

## Repo layout

```
PIPELINE-CONTRACT.md          L2 — file-format protocol (consumer contract)
workflows/idea-to-mvp.js      L3 — Dynamic Workflow runner (validate → execute → report)
skills/pipeline-runner/       L3b — bridge skill (trigger + pre-flight + writeback)
```

## Design highlights

- **Batches-first scheduling**: the decomposer's `execution_plan.batches` is a pre-adjudication — honored when consistent with `depends_on`; Kahn topological waves are always computed as the cycle / missing-ref fail-fast gate and used as fallback.
- **Failure semantics**: upstream failed/blocked → downstream auto-blocked without spawning; independent branches keep running; the pipeline never hard-stops for one goal.
- **`model_tier` mapping**: haiku/sonnet/opus per goal → same-tier executor agent. Pay for opus only where the decomposer said so.
- **Governance hook**: every executor must run the host project's governance gates (guard scripts, audit:all, architecture-gate skills) before declaring done — composing with claude-skills-governance-meta instead of bypassing it.
- **No-fs sandbox split**: the workflow script never touches the filesystem (sandbox law); the bridge skill reads the graph in, executor agents read their own goal files, the bridge writes reports out.

## Ecosystem

This repo is the **execution rail** of the six-repo toolchain — full map: [ai-dev-toolkit/ECOSYSTEM.md](https://github.com/dragon375014/ai-dev-toolkit/blob/master/ECOSYSTEM.md).

**One-command install** (drops all six tools into the right place):
```bash
npx specmit init
```

Upstream: [spec-sonar](https://github.com/dragon375014/spec-sonar) (formats), [goal-workflow-designer](https://github.com/dragon375014/goal-workflow-designer) (single-task depth + homogeneous breadth). Execution-time: [claude-skills-governance-meta](https://github.com/dragon375014/claude-skills-governance-meta) (gates, enforced in the executor prompt), [agent-work-board](https://github.com/dragon375014/agent-work-board) (multi-session claims, in the bridge's pre-flight).

## Publication gate

Public when **all** of: ① spec-sonar flips public (its PUBLIC-CHECKLIST.md has no ❌ rows); ② this pipeline validated end-to-end on ≥1 real project; ③ this repo passes its own history secret scan + gets a description review. Until then: private, iterate freely.

## License

MIT (effective on publication).
