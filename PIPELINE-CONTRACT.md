# PIPELINE-CONTRACT — L2 file-format protocol

> contract_version: **1.0** ｜ pins upstream goal-graph **schema_version 1.0**
> The loose-coupling law: tools in this toolchain talk through **files only** — no imports, no function calls, no shared runtime. This document is the complete list of what crosses the boundary.

## 1. Who owns what（producer owns the format）

This contract **does not define a new format** for upstream artifacts — that would be a second source of truth (the exact dual-definition failure mode this ecosystem's dark-area audit flagged as D2). Ownership:

| Artifact | Canonical owner | This repo's role |
|---|---|---|
| `spec/goal-graph.json` | **spec-sonar** `schemas/goal-graph.schema.json` (v1.0) | consumer — reads the §3 subset, tolerant to everything else |
| `spec/goals/G*.md` | **spec-sonar** `docs/output-directory-spec.md` + `examples/mathdefense/goals/G4a.md` | consumer — passed verbatim to executor agents, never parsed structurally |
| `spec/contracts/C*.md` | **spec-sonar** (frozen interface contracts) | context only — already embedded verbatim in goal files; never scheduled |
| `runs/<run-id>/run-report.json` | **skill-pipeline (this repo)** — §5 | producer |
| executor agent I/O | **skill-pipeline (this repo)** — §6 | producer |

Upstream schema bump (e.g. 1.0 → 1.1) ⇒ revise this contract in the same change; the runner fail-fasts on any `schema_version` it does not pin.

## 2. Version gate

`idea-to-mvp.js` throws immediately if `graph.schema_version !== "1.0"`. No silent best-effort parsing of unknown versions — a wrong guess about a dependency graph multiplies into N agents doing wrong work in parallel.

## 3. Required subset（runner 只依賴這些欄位）

The runner reads **only** the fields below. Unknown / extra fields are ignored and preserved (tolerant reader — upstream may add fields without breaking the pipeline).

| Field | Used for | If missing / invalid |
|---|---|---|
| `schema_version` | §2 version gate | throw |
| `project.name` | report labeling | tolerated (null) |
| `goals[].id` | scheduling key (`^G[0-9]+[a-z]?$`) | throw (schema-required) |
| `goals[].title` | agent + report labels | tolerated |
| `goals[].file` | path executor Reads, resolved as `{specDir}/{file}` | executor fails that goal |
| `goals[].model_tier` | agent model mapping haiku/sonnet/opus → same-name model | tolerated → harness default model |
| `goals[].tier_condition` | quoted in executor prompt | tolerated |
| `goals[].status` | resume mode (`only:` re-runs trust prior `done`/`verified` for out-of-scope deps) | treated as `pending` |
| `goals[].depends_on[].ref` | **G-refs = execution ordering；C-refs = context only**（凍結契約已內嵌於 goal 檔，不排程） | missing G-ref target → throw |
| `goals[].depends_on[].type` | shown to executor for context | tolerated |
| `execution_plan.batches` | primary plan（decomposer 的預裁決優先） | fallback to Kahn waves computed from `depends_on` |

Fields deliberately **not** read: `contracts[]`, `goals[].module_ref`, `goals[].acceptance_count`, `goals[].produces`, `goals[].verification.*`（驗證指令由 executor 從 goal 檔 §2 讀，不從 graph 讀——goal 檔才是 self-contained 單位）。

## 4. Status writeback（the ONLY mutation upstream allows）

After a run, the bridge skill writes back into `goal-graph.json`:

- **May change**: `goals[].status` only. Legal values written: `in-progress` → `done` / `verified` / `blocked`（schema 已內建這些 runtime 值——欄位本身就是為執行期設計的）。
- **Must never touch**: any other field of `goal-graph.json`; any file under `adapters/`（投影，只能重新生成）; any `goals/G*.md` or `contracts/C*.md`（凍結）。
- Writeback is idempotent: re-running with `only:` updates just the re-run goals.

## 5. Runner-owned artifact: `runs/<run-id>/run-report.json`

`run-id` = `YYYYMMDD-HHMMSS`（bridge skill 蓋章——workflow 沙箱禁 `Date.now()`，所以時間戳一律由 bridge 落檔時補）。

```json
{
  "run_id": "20260610-153000",
  "graph_source": "spec/goal-graph.json",
  "contract_version": "1.0",
  "plan_source": "decomposer execution_plan.batches",
  "summary": { "verified": 5, "done": 1, "blocked": 1, "failed": 0,
               "questions": [{ "id": "G4b", "question": "..." }] },
  "goals": [ { "id": "G1", "title": "...", "status": "verified",
               "verify": { "passed": true, "evidence": "node test/g1.test.js → 4/4 pass" },
               "files_touched": ["server/room.js"], "notes": "" } ]
}
```

## 6. Executor agent I/O contract

**Input**（prompt 構成，由 runner 生成）: goal file path（self-contained 單位，agent 自己 Read）、`projectDir`、已滿足的上游清單、BLOCKED protocol、governance hook（宿主專案有治理閘門必須跑過，不得繞）、`tier_condition` 若有。

**Output**（StructuredOutput schema，runner 強制）:

```json
{
  "goal_id": "G4a",
  "status": "verified | done | blocked | failed",
  "verify": { "passed": true, "evidence": "每條機械驗證指令的輸出摘要" },
  "blocked_question": "（status=blocked 時必填——BLOCKED protocol：不准猜，回問題）",
  "files_touched": ["..."],
  "notes": ""
}
```

語義：`verified` = 全部機械驗證指令通過；`done` = 已實作但部分驗證在當前環境跑不了（說明哪條為何）；`blocked` = 缺資訊或正確性要求違反凍結介面/前置裁決 → 停下回問題；`failed` = 無法完成（含治理閘門擋下且超出本 goal 修復範圍）。

**Failure semantics**: 上游 `failed`/`blocked` → 下游自動標 `blocked`（不 spawn、省 token）；獨立分支照常並行；整條 pipeline 永不因單一 goal 失敗而中斷其他分支。

## 7. Compatibility matrix

| skill-pipeline | goal-graph schema | spec-sonar |
|---|---|---|
| contract 1.0 | 1.0 | v1（goal-decomposer v1 輸出） |
