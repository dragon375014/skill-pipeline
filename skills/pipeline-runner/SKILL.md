---
name: pipeline-runner
description: |
  使用者要「一個指令跑完 idea→spec→goals→平行執行」整條管線、或手上已有 spec-sonar 產出的
  goal graph 想直接平行執行時 trigger。本 skill 是 L3b bridge：把檔案世界（goal-graph.json /
  goals/G*.md）接上 Claude Code 的 Workflow 引擎（workflows/idea-to-mvp.js），自己不實作任何
  分解或執行邏輯——鬆耦合，只靠檔案格式（PIPELINE-CONTRACT.md）溝通。

  明確 trigger keyword：「跑完整管線」「一條龍」「idea to mvp」「把 spec 跑成 MVP」
  「執行 goal graph」「平行執行 goals」「跑 pipeline」「run the pipeline」。

  不 trigger：
  - 還在收斂規格（讓位 idea-to-spec）
  - 只要分解不要執行（讓位 goal-decomposer）
  - 單一任務要打磨（讓位 goal skill）
  - 同質批次掃描（讓位 workflow-shaper——那是「同一檢查 × N 單位」，這裡是「異質 goal 依賴圖」）
---

# Pipeline Runner — L3b bridge skill

> 角色：**接線生，不是工人**。檢查管線該從哪一段進、把 goal-graph.json 餵給 runner workflow、
> 落地 run-report 與 status writeback。所有格式規則見 [PIPELINE-CONTRACT.md](../../PIPELINE-CONTRACT.md)。

## Step 0 — 管線進度路由（先判斷從哪段進）

| 現場狀態 | 動作 |
|---|---|
| 連 spec 都沒有（只有想法） | 讓位 **idea-to-spec**（5–7 輪收斂），完成後回到本表 |
| 有 `spec/project-spec.md` 但無 `spec/goal-graph.json` | 讓位 **goal-decomposer**（分解出 graph + goals/），完成後回到本表 |
| 有 `spec/goal-graph.json` + `spec/goals/G*.md` | 進 Step 1 |

## Step 1 — 起飛前檢查（fail fast，省一次 workflow 啟動）

1. Read `spec/goal-graph.json` → 確認 `schema_version` 值等於 `"1.0"`（字串或數字皆可，`1.0 == "1.0"` 視為相符；不符 → 停，回報需要升級 contract）
2. 抽查 `goals[].file` 指到的檔案存在（缺檔 → 停，回 goal-decomposer 重生成）
3. 多 session 環境（repo 有 WORK-BOARD.md）→ 先掃「進行中」確認 `projectDir` 沒人認領，並加一列認領

## Step 2 — 啟動 runner

```
Workflow({
  scriptPath: '.claude/workflows/idea-to-mvp.js',
  args: {
    graph: <parsed goal-graph.json>,   // bridge 讀檔，script 沙箱無 fs
    specDir: 'spec',
    projectDir: '.',
    serial: false,        // 平行 agent 撞共享檔時的逃生口 → true
    only: null            // resume：只重跑指定 goal ids，上游信任 graph 內 prior status
  }
})
```

batch 內平行的安全性由 goal-decomposer 的模組分解保證（這正是依賴圖存在的意義）；
真撞檔 → `serial: true` 重跑，或對撞檔 goals 用 `only:` 分兩波。

## Step 3 — 落地（workflow 回來之後，bridge 的責任）

1. 蓋時間戳 `run-id = YYYYMMDD-HHMMSS`，寫 `runs/<run-id>/run-report.json`（格式：CONTRACT §5）
2. Status writeback：把每個 goal 的結果寫回 `goal-graph.json` 的 `goals[].status` —— **唯一可動欄位**（CONTRACT §4），其他一律不碰
3. `summary.questions` 非空 → 把 BLOCKED 問題逐條呈給使用者（這是 BLOCKED protocol 的出口：agent 不猜，人來裁決），裁決後用 `only: [被擋的 ids]` resume
4. 有 `failed` → 附 verify.evidence 回報，建議修復路徑（goal 層問題 → 改 goal 檔重跑；規格層問題 → 回 goal-decomposer）

## 失敗模式速查

| 症狀 | 含義 | 出口 |
|---|---|---|
| Validate 丟 cycle | 依賴圖有環 | 回 goal-decomposer 重分解 |
| Validate 丟 missing goal | graph 不完整 | 同上 |
| 「Kahn fallback」warning | decomposer batches 與 depends_on 矛盾 | 可繼續（runner 已自救），但回報 spec-sonar 修 bug |
| 大量 blocked 連鎖 | 最上游一顆 goal 倒了 | 先修那顆，`only:` resume |

## 生態系定位

spec-sonar（收斂+分解）→ **本 skill + idea-to-mvp.js（執行軌）** → 各專案 domain skills（executor agent 的手）→ governance-meta（executor prompt 內建治理 hook：宿主閘門必須跑過不得繞）。地圖：ai-dev-toolkit/ECOSYSTEM.md。
