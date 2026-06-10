export const meta = {
  name: 'idea-to-mvp',
  description: 'Execute a spec-sonar goal graph end-to-end: validate deps, batch-parallel agents (tier-mapped models), aggregate report',
  whenToUse: 'After goal-decomposer produced spec/goal-graph.json + spec/goals/G*.md. The pipeline-runner bridge skill reads the graph and passes it via args — this script never touches the filesystem itself.',
  phases: [
    { title: 'Validate', detail: 'schema gate + Kahn cycle check + batch cross-check (pure JS, zero agents)' },
    { title: 'Execute', detail: 'one executor agent per goal, parallel within a batch, model_tier-mapped' },
    { title: 'Report', detail: 'aggregate per-goal results + blocked chains' },
  ],
}

// ============================================================================
// idea-to-mvp — pipeline runner (L3) for the dragon375014 toolchain
//
// LOOSE COUPLING IS THE LAW HERE:
//   - imports nothing, calls no repo code; the only interface is data:
//     args.graph (parsed goal-graph.json, schema 1.0 — canonical schema lives
//     in spec-sonar/schemas/goal-graph.schema.json; this runner reads the
//     minimal subset pinned in PIPELINE-CONTRACT.md §3 and ignores the rest)
//   - Workflow scripts have no fs access by design → the bridge skill reads
//     the graph; each executor agent Reads its own goal file with its tools.
//
// args = {
//   graph:      required — parsed goal-graph.json object
//   specDir:    optional — dir containing goals/ + contracts/ (default 'spec')
//   projectDir: optional — where executors write code (default '.')
//   serial:     optional — true = run goals one-by-one even within a batch
//                (escape hatch if parallel agents collide on shared files)
//   only:       optional — array of goal ids to (re)run; deps still checked
//                against prior statuses in the graph (resume support)
// }
// ============================================================================

const A = args || {}
const graph = A.graph
if (!graph || !Array.isArray(graph.goals) || graph.goals.length === 0) {
  throw new Error('args.graph missing or empty — the pipeline-runner skill must pass parsed goal-graph.json')
}
if (graph.schema_version !== '1.0') {
  throw new Error(`unsupported goal-graph schema_version "${graph.schema_version}" — this runner pins 1.0 (PIPELINE-CONTRACT.md §2)`)
}
const specDir = A.specDir || 'spec'
const projectDir = A.projectDir || '.'
const serial = !!A.serial
const only = Array.isArray(A.only) && A.only.length ? new Set(A.only) : null

// ---------------------------------------------------------------------------
phase('Validate')
// ---------------------------------------------------------------------------
const goals = new Map(graph.goals.map(g => [g.id, g]))
// G-refs order execution; C-refs are frozen contracts — context only, already
// embedded verbatim inside each goal file (凍結介面複本), so not scheduled.
const gdeps = id => (goals.get(id).depends_on || []).map(d => d.ref).filter(r => /^G/.test(r))

// Kahn topological waves — always computed, even when decomposer batches are
// used, because this is also the cycle / missing-ref fail-fast gate.
function kahnWaves() {
  const indeg = new Map(), out = new Map()
  for (const g of graph.goals) { indeg.set(g.id, 0); out.set(g.id, []) }
  for (const g of graph.goals) {
    for (const d of gdeps(g.id)) {
      if (!goals.has(d)) throw new Error(`${g.id} depends_on "${d}" which is not in goals[] — graph is incomplete, send it back to goal-decomposer`)
      indeg.set(g.id, indeg.get(g.id) + 1)
      out.get(d).push(g.id)
    }
  }
  const waves = []
  let frontier = [...indeg].filter(([, n]) => n === 0).map(([id]) => id)
  let placed = 0
  while (frontier.length) {
    waves.push(frontier)
    placed += frontier.length
    const next = []
    for (const id of frontier) {
      for (const m of out.get(id)) {
        indeg.set(m, indeg.get(m) - 1)
        if (indeg.get(m) === 0) next.push(m)
      }
    }
    frontier = next
  }
  if (placed !== graph.goals.length) {
    const cyclic = [...indeg].filter(([, n]) => n > 0).map(([id]) => id)
    throw new Error(`dependency cycle among: ${cyclic.join(', ')} — send the graph back to goal-decomposer`)
  }
  return waves
}

// decomposer's execution_plan.batches is the pre-adjudicated plan; honor it
// when it is consistent with depends_on, otherwise fall back to Kahn waves.
function batchesConsistent(batches) {
  const pos = new Map()
  batches.forEach((wave, i) => (wave || []).forEach(id => pos.set(id, i)))
  if (pos.size !== graph.goals.length) return false
  for (const g of graph.goals) {
    if (!pos.has(g.id)) return false
    for (const d of gdeps(g.id)) if (!(pos.get(d) < pos.get(g.id))) return false
  }
  return true
}

const kahn = kahnWaves() // throws on cycle / missing ref
const declared = graph.execution_plan && Array.isArray(graph.execution_plan.batches) ? graph.execution_plan.batches : null
let batches, planSource
if (declared && batchesConsistent(declared)) {
  batches = declared; planSource = 'decomposer execution_plan.batches'
} else {
  batches = kahn; planSource = declared ? 'Kahn fallback (declared batches inconsistent with depends_on)' : 'Kahn fallback (no batches declared)'
}
log(`plan: ${graph.goals.length} goals in ${batches.length} batches — ${planSource}${serial ? ' [serial mode]' : ''}`)

// ---------------------------------------------------------------------------
phase('Execute')
// ---------------------------------------------------------------------------
const TIER = { haiku: 'haiku', sonnet: 'sonnet', opus: 'opus' } // model_tier → agent model
const RESULT = {
  type: 'object',
  required: ['goal_id', 'status', 'verify'],
  properties: {
    goal_id: { type: 'string' },
    status: { enum: ['verified', 'done', 'blocked', 'failed'] },
    verify: {
      type: 'object',
      required: ['passed', 'evidence'],
      properties: { passed: { type: 'boolean' }, evidence: { type: 'string' } },
    },
    blocked_question: { type: 'string' },
    files_touched: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
}

function executorPrompt(g) {
  const goalPath = `${specDir}/${g.file}`
  const deps = (g.depends_on || []).map(d => `${d.ref}(${d.type})`).join(', ') || 'none'
  return [
    `You are the executor for goal ${g.id} — "${g.title}".`,
    ``,
    `1. Read ${goalPath} in full. It is SELF-CONTAINED: outcome, mechanical verification commands, constraints, frozen interfaces (凍結介面), pre-adjudicated decisions (前置裁決), explicit non-goals (明確不做), BLOCKED protocol. Dependencies already satisfied upstream: ${deps}.`,
    `2. Implement it inside ${projectDir}. The frozen interfaces, pre-adjudications and non-goals are LAW — do not re-adjudicate, do not rename, do not add scope.${g.tier_condition ? ` Tier condition noted by the decomposer: ${g.tier_condition}.` : ''}`,
    `3. BLOCKED protocol — if required information is missing, or correctness would force you to break a frozen interface / pre-adjudication: do NOT guess. Stop, return status "blocked" with a precise blocked_question.`,
    `4. Governance hook — if the host project has governance gates (a scripts/governance-guard.mjs, npm run audit:all, an architecture-gate skill under .claude/skills/, or CI lint hooks), run/observe them before declaring done; a gate failure you cannot fix within this goal's scope = status "failed" with the gate output as evidence. Never bypass a gate.`,
    `5. Run EVERY mechanical verification command from the goal file's Verification section. status "verified" = all commands pass (put the command outputs summary in verify.evidence). "done" = implemented but some verification could not be executed in this environment (say which and why). "failed" = could not complete.`,
    `6. Your final output is consumed by a pipeline, not a human: return only the structured result (goal_id, status, verify, files_touched, notes).`,
  ].join('\n')
}

const results = new Map()   // id → structured result
const blockedBy = new Map() // id → upstream id that blocked it

function upstreamOk(id) {
  for (const d of gdeps(id)) {
    if (blockedBy.has(d)) return d
    const r = results.get(d)
    if (only && !only.has(d) && !r) {
      // resume mode: trust prior status recorded in the graph for goals not re-run
      const prior = goals.get(d).status
      if (prior === 'done' || prior === 'verified') continue
      return d
    }
    if (!r || (r.status !== 'verified' && r.status !== 'done')) return d
  }
  return null
}

for (let i = 0; i < batches.length; i++) {
  const wave = batches[i].filter(id => goals.has(id) && (!only || only.has(id)))
  if (!wave.length) continue
  const runnable = []
  for (const id of wave) {
    const bad = upstreamOk(id)
    if (bad) {
      blockedBy.set(id, bad)
      log(`⛔ ${id} skipped — upstream ${bad} not done/verified`)
    } else runnable.push(id)
  }
  if (!runnable.length) continue
  const run = id => () =>
    agent(executorPrompt(goals.get(id)), {
      label: id,
      phase: 'Execute',
      model: TIER[goals.get(id).model_tier],
      schema: RESULT,
    }).then(r => {
      results.set(id, r || { goal_id: id, status: 'failed', verify: { passed: false, evidence: 'executor agent returned null (skipped or terminal error)' } })
    })
  if (serial) { for (const id of runnable) await run(id)() }
  else await parallel(runnable.map(run))
  const okCount = runnable.filter(id => ['verified', 'done'].includes(results.get(id).status)).length
  log(`batch ${i + 1}/${batches.length}: ${okCount}/${runnable.length} ok`)
}

// ---------------------------------------------------------------------------
phase('Report')
// ---------------------------------------------------------------------------
const perGoal = graph.goals.map(g => {
  const r = results.get(g.id)
  if (r) return { id: g.id, title: g.title, ...r }
  if (blockedBy.has(g.id)) return { id: g.id, title: g.title, goal_id: g.id, status: 'blocked', verify: { passed: false, evidence: `upstream ${blockedBy.get(g.id)} did not complete` }, blocked_question: null }
  return { id: g.id, title: g.title, goal_id: g.id, status: only ? 'not-in-scope' : 'not-reached', verify: { passed: false, evidence: '' } }
})
const count = s => perGoal.filter(p => p.status === s).length
const summary = {
  project: graph.project && graph.project.name,
  plan_source: planSource,
  batches: batches.length,
  verified: count('verified'),
  done: count('done'),
  blocked: count('blocked'),
  failed: count('failed'),
  questions: perGoal.filter(p => p.status === 'blocked' && p.blocked_question).map(p => ({ id: p.id, question: p.blocked_question })),
}
log(`done: ${summary.verified} verified / ${summary.done} done / ${summary.blocked} blocked / ${summary.failed} failed`)
// The bridge skill persists this as runs/<run-id>/run-report.json and writes
// goals[].status back into goal-graph.json (the ONLY field it may touch —
// PIPELINE-CONTRACT.md §4). Timestamps are stamped there, not here.
return { summary, goals: perGoal }
