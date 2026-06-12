# Ecosystem Map

> The central map of the `dragon375014` AI-dev toolchain — five public repos, one pipeline, from vague idea to governed code.
> 生態系中央地圖：五個公開 repo、一條從想法到出貨的管線。

**This file is the single source of truth for ecosystem topology.** Each sibling repo's README carries a short `## Ecosystem` section pointing here. When a repo's role changes, update this file first, then the pointers.

## The pipeline

```
  vague idea
      │
      ▼
┌────────────────────────────────────────────────────────────────┐
│  spec-sonar                     CONVERGE & DECOMPOSE  收斂與分解 │
│  idea-to-spec   → 5–7 round Q&A → spec (CLAUDE.md + STATE)     │
│  goal-decomposer → dependency-ordered goals/G*.md + contracts  │
└────────────────────────────────────────────────────────────────┘
      │  goals / specs
      ▼
┌────────────────────────────────────────────────────────────────┐
│  goal-workflow-designer         SHAPE THE TASK        塑形任務  │
│  goal            (depth: one task, iterated to a quality bar)  │
│  workflow-shaper (breadth: same check across many units)       │
└────────────────────────────────────────────────────────────────┘
      │  precise /goal prompt or workflow script
      ▼
┌────────────────────────────────────────────────────────────────┐
│  specmit (this repo)            RUN THE PIPELINE      執行管線  │
│  pipeline-runner skill → idea-to-mvp.js workflow runner        │
│  batch-parallel executors, frozen contracts, BLOCKED protocol  │
│  (domain skills in your project's .claude/skills/ do the work) │
└────────────────────────────────────────────────────────────────┘
      │ guarded by                       │ coordinated by
      ▼                                  ▼
┌──────────────────────────────┐  ┌────────────────────────────┐
│ claude-skills-governance-meta│  │ agent-work-board           │
│ GOVERN 治理 (design-time):   │  │ COORDINATE 協調:           │
│ CI guards, gate skills,      │  │ cross-session board,       │
│ step-back sentinel           │  │ territory + footprint      │
└──────────────────────────────┘  └────────────────────────────┘
```

## Quick start — 新專案一鍵安裝

```bash
# 在你的新專案資料夾裡執行：
npx specmit init
```

安裝後直接在 Claude Code 說「我想做一個...」即可開始；要一條龍跑完就說「跑完整管線」。CLI 指令：

| 指令 | 說明 |
|---|---|
| `specmit init` | 安裝核心 skill（spec-sonar 兩套 + pipeline-runner + idea-to-mvp workflow）+ 建立 spec/ 與 runs/ 資料夾 |
| `specmit sync` | 更新已安裝 skill 到最新 canonical 版本 |
| `specmit contrib` | 顯示本地修改與 canonical 的差異，印出 PR 步驟 |

已有全域 skill？`init` 自動跳過，不覆蓋。`--force` 強制更新。`goal` / `workflow-shaper` / 治理 skill / 看板屬選配，到各自 repo 依 README 安裝。

## Repo roles

| Repo | Layer | Owns | Reach for it when |
|---|---|---|---|
| [spec-sonar](https://github.com/dragon375014/spec-sonar) | converge + decompose | `idea-to-spec`, `goal-decomposer`, Audit / Complex-System / Conflict-Analysis modes, project-scanner, 4 platform adapters | "I have a product idea" / "decompose this spec" / "audit this design for blind spots" |
| [goal-workflow-designer](https://github.com/dragon375014/goal-workflow-designer) | shape | `goal` (depth), `workflow-shaper` (breadth) | "one task done right" / "same check over many units" |
| [claude-skills-governance-meta](https://github.com/dragon375014/claude-skills-governance-meta) | govern | `governance-guard` + `step-back-sentinel` templates, `architecture-completeness-guardian` + `trace-lock-modify` + `step-back-review` scaffold skills, adoption fitness check | "stop shipping the same class of bug" / "gate architecture changes" |
| [agent-work-board](https://github.com/dragon375014/agent-work-board) | coordinate | WORK-BOARD template, claim ritual, footprint methodology | "I run 2+ AI sessions in parallel on one repo" |
| [specmit](https://github.com/dragon375014/specmit) | run + front door | this map, `PIPELINE-CONTRACT.md` (consumer contract pinning goal-graph 1.0), `idea-to-mvp` workflow runner, `pipeline-runner` bridge skill, the `specmit` npm CLI (`bin/`) | "run the whole spec→goals→execution pipeline in one command" / "where do I start?" |

The author also keeps a **private cross-project knowledge vault** (`ai-dev-toolkit`) — it is not required for any workflow above; everything public lives in the five repos in this table.

## Routing rules

| You want to… | Start at | Then |
|---|---|---|
| build a product from a vague idea | spec-sonar `idea-to-spec` | → `goal-decomposer` → execute goals in dependency order |
| audit an existing design for blind spots | spec-sonar Audit Mode | → remediation goals → `goal-decomposer` |
| get one task done deep and converged | goal-workflow-designer `goal` | paste the emitted `/goal` prompt |
| run the same check/change across many units | goal-workflow-designer `workflow-shaper` | WORTH-IT gate first; paste the workflow prompt |
| stop a recurring bug class | claude-skills-governance-meta | run the adoption fitness check, then copy a template |
| gate "I want to add X" declarations | governance-meta scaffold `architecture-completeness-guardian` | install into `.claude/skills/`, fill the dispatch table |
| coordinate parallel sessions | agent-work-board | board file on main + claim ritual |
| run a decomposed spec all the way to working code | specmit `pipeline-runner` | pre-flight → batch-parallel executors → run-report + BLOCKED questions back to you |

**One-second disambiguation** (from goal-workflow-designer): count how many units. One thing to perfect → `goal`. The same check across many things → `workflow-shaper`. A whole multi-module spec → `goal-decomposer`.

**How the layers hook into each other mechanically** — not just conceptually:

- spec stage: `idea-to-spec` **recommends** (never auto-installs) the governance skills when it calibrates a project as enterprise-complexity.
- execution stage: every `idea-to-mvp` executor runs the host project's governance gates (`scripts/governance-guard.mjs`, `npm run audit:all`, architecture-gate skills under `.claude/skills/`) before declaring a goal done — a failing gate fails the goal.
- coordination: when several sessions run pipelines on one repo, the work-board claim ritual prevents collisions; the runner's same-batch file-collision tripwire covers collisions *inside* one run.

## Canonical ownership — multi-copy skills

Several skills exist in more than one place. **The repo copy is canonical; installed copies are deployments.**

| Skill | Canonical home | Installed copies live at |
|---|---|---|
| `idea-to-spec`, `goal-decomposer` | spec-sonar `skills/` | `~/.claude/skills/` |
| `goal`, `workflow-shaper` | goal-workflow-designer `skills/` | `~/.claude/skills/`, project `.claude/skills/` |
| `architecture-completeness-guardian`, `trace-lock-modify`, `step-back-review` | claude-skills-governance-meta `scaffold/skills/` | project `.claude/skills/` (customized) |
| `pipeline-runner`, `idea-to-mvp.js` | specmit `skills/` + `workflows/` | project `.claude/skills/`, `.claude/workflows/` (frontmatter `canonical: false`) |

Three rules:

1. **Flow back** — a generalizable improvement made in an installed copy gets contributed back to its canonical repo via PR (strip project-specific parts first).
2. **Never blind-overwrite** — re-installing must diff against a customized project copy before writing.
3. **Expected divergence ≠ drift** — guardian / trace-lock installed copies are *supposed* to differ: their dispatch tables are project-specific. The canonical scaffold owns structure, not content.

## Maintenance

- Sibling README `## Ecosystem` sections stay ≤ 10 lines and link here — topology details live in this file only.
- New repo, or a repo changes role → update the pipeline diagram + tables here in the same PR.
- Repos publish on `main`; until specmit ≥ 0.2.1 is the live npm version, keep `master` mirrored to `main` (the 0.2.0 CLI fetches raw files from `master`).
- Known follow-ups are tracked as issues labeled `connector-needed`.

---
*Established 2026-06-10 from an ecosystem-wide gap diagnosis; canonical home moved from the private `ai-dev-toolkit` to this repo on 2026-06-12 so the map is reachable by everyone.*
