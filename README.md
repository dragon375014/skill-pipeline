# specmit

> **Auto spec → MVP, Made in Taiwan, MIT licensed.**
> 把「人工搬運」的管線升級成一個指令跑完——工具之間仍然鬆耦合，只靠檔案格式溝通。
>
> *specmit = spec + submit + MIT（Made in Taiwan）*

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

1. Install — one command (installs the spec-sonar skills, this repo's bridge skill + workflow, and scaffolds `spec/` + `runs/`):
   ```bash
   npx specmit init
   ```
   Or copy manually:
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
ECOSYSTEM.md                  the canonical map of the whole toolchain (all repos link here)
PIPELINE-CONTRACT.md          L2 — file-format protocol (consumer contract)
workflows/idea-to-mvp.js      L3 — Dynamic Workflow runner (validate → execute → report)
skills/pipeline-runner/       L3b — bridge skill (trigger + pre-flight + writeback)
bin/pipeline.js               the `specmit` npm CLI (init / sync / contrib)
```

## Design highlights

- **Batches-first scheduling**: the decomposer's `execution_plan.batches` is a pre-adjudication — honored when consistent with `depends_on`; Kahn topological waves are always computed as the cycle / missing-ref fail-fast gate and used as fallback.
- **Failure semantics**: upstream failed/blocked → downstream auto-blocked without spawning; independent branches keep running; the pipeline never hard-stops for one goal.
- **`model_tier` mapping**: haiku/sonnet/opus per goal → same-tier executor agent. Pay for opus only where the decomposer said so.
- **Governance hook**: every executor must run the host project's governance gates (guard scripts, audit:all, architecture-gate skills) before declaring done — composing with claude-skills-governance-meta instead of bypassing it.
- **No-fs sandbox split**: the workflow script never touches the filesystem (sandbox law); the bridge skill reads the graph in, executor agents read their own goal files, the bridge writes reports out.

## Ecosystem

This repo is the **execution rail and front door** of a five-public-repo toolchain — the canonical map lives here: [ECOSYSTEM.md](./ECOSYSTEM.md).

**One-command install** (core skills — spec-sonar's two + this repo's bridge skill and workflow — plus `spec/` and `runs/` scaffolding; sibling repos below install separately):
```bash
npx specmit init
```

Upstream: [spec-sonar](https://github.com/dragon375014/spec-sonar) (formats), [goal-workflow-designer](https://github.com/dragon375014/goal-workflow-designer) (single-task depth + homogeneous breadth). Execution-time: [claude-skills-governance-meta](https://github.com/dragon375014/claude-skills-governance-meta) (gates, enforced in the executor prompt), [agent-work-board](https://github.com/dragon375014/agent-work-board) (multi-session claims, in the bridge's pre-flight).

## Publication status

Public since 2026-06-11. The original gate — ① spec-sonar public with a green [PUBLIC-CHECKLIST](https://github.com/dragon375014/spec-sonar/blob/main/PUBLIC-CHECKLIST.md), ② the pipeline validated end-to-end on ≥1 real project, ③ a full-history secret scan — was completed retroactively on 2026-06-12: validated on the MathBattle classroom-game pipeline run plus a 12-section external audit, and the secret scan across all toolchain repos came back clean.

## License

MIT.
