/**
 * Host-half checks for the session cost fold: `node test/cost.test.mjs`.
 *
 * The fold is pure, so every case builds a fresh projection, replays synthetic
 * committed events, and compares the wire payload with a hand-computed figure.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mod = await import(new URL('../index.js', import.meta.url).href)

/** Capture the projection definition a fresh registration produces. */
const registry = (target) => ({
  sessionProjections: {
    register(candidate) {
      target.definition = candidate
      return () => {}
    },
  },
})

const config = mod.Config['~standard'].validate({
  rates: { USD: 80.53, CNY: 12.0557 },
  providers: {
    google: { label: 'Google · GOOGLE_API_KEY' },
    'deepseek-official': { label: 'DeepSeek · DEEPSEEK_API_KEY' },
  },
}).value

const mounted = {}
mod.apply(registry(mounted), config)
const definition = mounted.definition

const PEAK = Date.parse('2026-10-27T02:00:00Z') // Beijing 10:00, Tuesday
const IDLE = Date.parse('2026-10-27T14:00:00Z') // Beijing 22:00

function makeSession(from = definition) {
  let state = from.init({ id: 'session-root' }, 0)
  return {
    route(provider, model) {
      state = from.apply(state, { type: 'request/context', data: { provider, model } })
    },
    settle(turn, step, usage, time = PEAK) {
      state = from.apply(state, { type: 'assistant/message', time, data: { turn, step, usage } })
    },
    retry(turn, step) {
      state = from.apply(state, { type: 'llm/retry-started', data: { turn, step } })
    },
    view() {
      return from.wire.view(state)
    },
  }
}

const sum = (buckets) => buckets.cacheMiss + buckets.cacheHit + buckets.cacheWrite + buckets.output
const money = (value) => value.toFixed(6)
const near = (left, right, eps = 1e-6) => Math.abs(left - right) <= eps * Math.max(1, Math.abs(right))
const results = []
const check = (name, ok, detail) => results.push({ name, ok, detail })

// 1. DeepSeek at peak, priced from its own CNY list.
{
  const s = makeSession()
  s.route('deepseek-official', 'deepseek-flash')
  s.settle(1, 1, { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0 })
  const v = s.view()
  const expected = (1000 * 2 * 12.0557 + 500 * 8 * 12.0557) / 1e6
  check('deepseek peak price', near(sum(v.totals), expected), `${money(sum(v.totals))} vs ${money(expected)}`)
  check('deepseek peak tier', v.tier === 'peak', String(v.tier))
  check('deepseek key label', v.keys.length === 1 && v.keys[0].label.includes('DEEPSEEK'), JSON.stringify(v.keys.map((k) => k.label)))
}

// 2. DeepSeek off-peak halves the price.
{
  const s = makeSession()
  s.route('deepseek-official', 'deepseek-flash')
  s.settle(1, 1, { inputTokens: 1000, outputTokens: 500 }, IDLE)
  const v = s.view()
  const expected = (1000 * 1 * 12.0557 + 500 * 4 * 12.0557) / 1e6
  check('deepseek idle price', near(sum(v.totals), expected), `${money(sum(v.totals))} vs ${money(expected)}`)
  check('deepseek idle tier', v.tier === 'idle', String(v.tier))
}

// 3. Gemini priced from its own USD table, not DeepSeek's.
{
  const s = makeSession()
  s.route('google', 'gemini-3.1-pro-preview')
  s.settle(1, 1, { inputTokens: 1000, outputTokens: 2000, cacheReadTokens: 50000, cacheWriteTokens: 0 })
  const v = s.view()
  const expected = (1000 * 2 * 80.53 + 50000 * 0.2 * 80.53 + 2000 * 12 * 80.53) / 1e6
  check('gemini flat price', near(sum(v.totals), expected), `${money(sum(v.totals))} vs ${money(expected)}`)
  check('gemini has no clock tier', v.tier === null, String(v.tier))
  check('gemini is not a fallback', v.fallbackTokens === 0 && v.unpricedTokens === 0, `fallback=${v.fallbackTokens} unpriced=${v.unpricedTokens}`)
  check('gemini key currency', v.keys[0].currency === 'USD' && near(v.keys[0].rate, 80.53), `${v.keys[0].currency} @ ${v.keys[0].rate}`)
  check('gemini key label', v.keys[0].label === 'Google · GOOGLE_API_KEY', v.keys[0].label)
}

// 4. Long-context tier replaces the flat rate above 200k prompt tokens.
{
  const s = makeSession()
  s.route('google', 'gemini-3.1-pro-preview')
  s.settle(1, 1, { inputTokens: 250000, outputTokens: 1000, cacheReadTokens: 0 })
  const v = s.view()
  const expected = (250000 * 4 * 80.53 + 1000 * 18 * 80.53) / 1e6
  check('gemini 200k tier', near(sum(v.totals), expected), `${money(sum(v.totals))} vs ${money(expected)}`)
}

// 5. Both keys in one session, kept apart and summing to the total.
{
  const s = makeSession()
  s.route('deepseek-official', 'deepseek-flash')
  s.settle(1, 1, { inputTokens: 1000, outputTokens: 500 })
  s.route('google', 'gemini-3.5-flash')
  s.settle(1, 2, { inputTokens: 2000, outputTokens: 300, cacheReadTokens: 1000 })
  const v = s.view()
  const deepseek = v.keys.find((k) => k.id === 'deepseek-official')
  const google = v.keys.find((k) => k.id === 'google')
  const keyTotal = v.keys.reduce((acc, k) => acc + sum(k.totals), 0)
  check('two keys listed', v.keys.length === 2 && deepseek !== undefined && google !== undefined, JSON.stringify(v.keys.map((k) => k.id)))
  check('keys sum to total', near(keyTotal, sum(v.totals)), `${money(keyTotal)} vs ${money(sum(v.totals))}`)
  check('keys sorted by spend', sum(v.keys[0].totals) >= sum(v.keys[1].totals), `${money(sum(v.keys[0].totals))} >= ${money(sum(v.keys[1].totals))}`)
  check('gemini key priced', near(sum(google.totals), (2000 * 1.5 * 80.53 + 1000 * 0.15 * 80.53 + 300 * 9 * 80.53) / 1e6), money(sum(google.totals)))
}

// 6. A retry closes the replacement slot, so the retried attempt adds — the
// same accounting the tokenUsage projection uses.
{
  const s = makeSession()
  s.route('google', 'gemini-3.1-pro-preview')
  s.settle(1, 1, { inputTokens: 10000, outputTokens: 100 })
  const first = sum(s.view().totals)
  s.retry(1, 1)
  s.settle(1, 1, { inputTokens: 1000, outputTokens: 10 })
  const v = s.view()
  const second = (1000 * 2 * 80.53 + 10 * 12 * 80.53) / 1e6
  check('retry adds the retried attempt', near(sum(v.totals), first + second), `${money(sum(v.totals))} vs ${money(first + second)}`)
  check('retry keeps the key in step', v.keys.length === 1 && near(sum(v.keys[0].totals), sum(v.totals)), JSON.stringify(v.keys.map((k) => money(sum(k.totals)))))
}

// 7. Re-settlement of the same turn/step replaces too.
{
  const s = makeSession()
  s.route('google', 'gemini-3.5-flash')
  s.settle(2, 3, { inputTokens: 5000, outputTokens: 50 })
  s.settle(2, 3, { inputTokens: 6000, outputTokens: 60 })
  const v = s.view()
  const expected = (6000 * 1.5 * 80.53 + 60 * 9 * 80.53) / 1e6
  check('repeat settlement replaces', near(sum(v.totals), expected), `${money(sum(v.totals))} vs ${money(expected)}`)
}

// 8. Unknown Gemini model is reported unpriced, never billed at DeepSeek rates.
{
  const s = makeSession()
  s.route('google', 'gemini-9-imaginary')
  s.settle(1, 1, { inputTokens: 1000, outputTokens: 500 })
  const v = s.view()
  check('unknown gemini unpriced', v.unpricedTokens === 1500 && v.fallbackTokens === 0, `unpriced=${v.unpricedTokens} fallback=${v.fallbackTokens}`)
  check('unknown gemini zero cost', sum(v.totals) === 0, money(sum(v.totals)))
}

// 9. Unknown DeepSeek model still falls back to the DeepSeek list.
{
  const s = makeSession()
  s.route('deepseek-official', 'deepseek-mystery')
  s.settle(1, 1, { inputTokens: 1000, outputTokens: 500 })
  const v = s.view()
  check('unknown deepseek falls back', v.fallbackTokens === 1500 && v.unpricedTokens === 0, `fallback=${v.fallbackTokens} unpriced=${v.unpricedTokens}`)
}

// 10. A missing conversion rate leaves tokens unpriced instead of mis-scaled.
{
  let local
  mod.apply(registry((globalThis.__costLocal = {})), mod.Config['~standard'].validate({ rates: { USD: 0 } }).value)
  local = globalThis.__costLocal.definition
  const s = makeSession(local)
  s.route('google', 'gemini-3.1-flash')
  s.settle(1, 1, { inputTokens: 1000, outputTokens: 500 })
  const v = s.view()
  check('no rate means unpriced', v.unpricedTokens === 1500 && sum(v.totals) === 0, `unpriced=${v.unpricedTokens} cost=${money(sum(v.totals))}`)
}

// 11. The secondary reading is derived from the rate table (RUB → USD).
{
  const s = makeSession()
  s.route('google', 'gemini-3.5-flash')
  s.settle(1, 1, { inputTokens: 1000000, outputTokens: 0 })
  const v = s.view()
  const usd = sum(v.totals) * v.secondary.rate
  check('secondary is one dollar per USD of spend', near(usd, 1.5, 1e-3), `${money(usd)} USD from ${money(sum(v.totals))} RUB`)
  check('secondary rate is RUB to USD', near(v.secondary.rate, 1 / 80.53, 1e-9), String(v.secondary.rate))
}

// 12. Cross-session totals are bucketed into rolling periods, per key.
{
  const root = mkdtempSync(join(tmpdir(), 'session-cost-'))
  const now = Date.now()
  const key = (model, currency, rate, miss, output) => ({
    model,
    currency,
    rate,
    tokens: { cacheMiss: 1, cacheHit: 0, cacheWrite: 0, output: 1 },
    totals: { cacheMiss: miss, cacheHit: 0, cacheWrite: 0, output },
    unpricedTokens: 0,
    fallbackTokens: 0,
  })
  const doc = (createdAt, keys) =>
    JSON.stringify({ record: { identity: { createdAt }, rows: { sessionCost: { ver: 2, val: { keys } } } } })

  writeFileSync(
    join(root, 'today.json'),
    doc(now - 3_600_000, { google: key('gemini-4-argon', 'USD', 80.53, 3, 0.7) }),
  )
  writeFileSync(
    join(root, 'old.json'),
    doc(now - 10 * 86_400_000, {
      google: key('gemini-4-argon', 'USD', 80.53, 2, 0.5),
      'deepseek-official': key('deepseek-flash', 'CNY', 12.0557, 0.8, 0.2),
    }),
  )
  writeFileSync(join(root, 'fresh.json'), doc(now - 1_000, { google: key('unknown', 'USD', 80.53, 0, 0) }))
  writeFileSync(join(root, 'broken.json'), '{ not json')
  writeFileSync(join(root, 'old-version.json'), JSON.stringify({ record: { identity: { createdAt: now }, rows: { sessionCost: { ver: 1, val: {} } } } }))

  const mountedLife = {}
  mod.apply(
    registry(mountedLife),
    mod.Config['~standard'].validate({ rates: { USD: 80.53, CNY: 12.0557 }, lifetime: { root } }).value,
  )
  const s = makeSession(mountedLife.definition)
  s.route('deepseek-official', 'deepseek-flash')
  s.settle(1, 1, { inputTokens: 10, outputTokens: 5 })
  const lifetime = s.view().lifetime
  const period = (id) => lifetime.periods.find((entry) => entry.id === id)
  const amount = (id, keyId) => {
    const found = (period(id)?.keys ?? []).find((entry) => entry.id === keyId)
    return found === undefined ? 0 : sum(found.totals)
  }
  check('lifetime counts sessions with cost', lifetime.sessions === 3, String(lifetime?.sessions))
  check('lifetime has four periods', lifetime.periods.map((entry) => entry.id).join(',') === 'session,today,week,month,all', '')
  check('today holds only the fresh session', near(amount('today', 'google'), 3.7), String(amount('today', 'google')))
  check('week excludes the ten-day-old session', near(amount('week', 'google'), 3.7), String(amount('week', 'google')))
  check('month includes the ten-day-old session', near(amount('month', 'google'), 6.2), String(amount('month', 'google')))
  check('all sums everything', near(amount('all', 'google'), 6.2) && near(amount('all', 'deepseek-official'), 1), '')
  check('period keys carry labels', (period('all').keys ?? []).every((entry) => typeof entry.label === 'string'), '')
  check('period keys sorted by spend', sum(period('all').keys[0].totals) >= sum(period('all').keys[1].totals), '')
  rmSync(root, { recursive: true, force: true })
}

// 13. Replay determinism: same events, same payload.
{
  const run = () => {
    const s = makeSession()
    s.route('deepseek-official', 'deepseek-flash')
    s.settle(1, 1, { inputTokens: 1234, outputTokens: 567 })
    s.route('google', 'gemini-3.5-flash')
    s.settle(1, 2, { inputTokens: 4321, outputTokens: 765, cacheReadTokens: 9999 })
    return JSON.stringify(s.view())
  }
  check('replay deterministic', run() === run(), 'two runs differ')
}

// 14. A delegated session's spend joins the run that spawned it.
{
  const root = mkdtempSync(join(tmpdir(), 'session-cost-'))
  const key = (model, currency, rate, miss, output) => ({
    model,
    currency,
    rate,
    tokens: { cacheMiss: 1, cacheHit: 0, cacheWrite: 0, output: 1 },
    totals: { cacheMiss: miss, cacheHit: 0, cacheWrite: 0, output },
    unpricedTokens: 0,
    fallbackTokens: 0,
  })
  const doc = (createdAt, keys, head) =>
    JSON.stringify({
      record: {
        identity: { createdAt },
        rows: {
          sessionCost: { ver: 3, val: { keys } },
          ...(head === undefined ? {} : { subagentCatalog: { ver: 6, val: { head: { values: head } } } }),
        },
      },
    })
  const now = Date.now()
  writeFileSync(
    join(root, 'session-root.json'),
    doc(now, { 'deepseek-official': key('deepseek-flash', 'CNY', 12.0557, 5, 1) }, [
      { childId: 'child-one', childCreatedAt: now },
    ]),
  )
  writeFileSync(
    join(root, 'child-one.json'),
    doc(now, { google: key('gemini-4-argon', 'USD', 80.53, 3, 2) }, [{ childId: 'grandchild' }]),
  )
  writeFileSync(join(root, 'grandchild.json'), doc(now, { google: key('gemini-4-argon', 'USD', 80.53, 1, 1) }))

  const mountedChain = {}
  mod.apply(
    registry(mountedChain),
    mod.Config['~standard'].validate({ rates: { USD: 80.53, CNY: 12.0557 }, lifetime: { root } }).value,
  )
  const chain = makeSession(mountedChain.definition)
  chain.route('deepseek-official', 'deepseek-flash')
  chain.settle(1, 1, { inputTokens: 10, outputTokens: 5 })
  const v = chain.view()

  const google = v.keys.find((entry) => entry.id === 'google')
  check('delegates are counted', v.delegates === 2, String(v.delegates))
  check('delegate cost joins the session', google !== undefined && near(sum(google.totals), 7), money(google === undefined ? 0 : sum(google.totals)))
  check('session total includes delegates', sum(v.totals) > 7, money(sum(v.totals)))
  check('session total matches its keys', near(sum(v.totals), v.keys.reduce((acc, entry) => acc + sum(entry.totals), 0)), money(sum(v.totals)))
  check('tokens include delegates', v.tokens.cacheMiss === 12 && v.tokens.output === 7, JSON.stringify(v.tokens))
  const todayTotal = v.lifetime.periods.find((p) => p.id === 'today').keys.reduce((acc, k) => acc + sum(k.totals), 0)
  check('periods still count each session once', near(todayTotal, 13), money(todayTotal))
  rmSync(root, { recursive: true, force: true })
}

// 15. A fork child does not bill its inherited prefix a second time.
{
  const mountedFork = {}
  mod.apply(registry(mountedFork), mod.Config['~standard'].validate({ rates: { USD: 80.53, CNY: 12.0557 } }).value)
  const forkDefinition = mountedFork.definition
  const event = (seq, usage) => ({ type: 'assistant/message', seq, time: PEAK, data: { turn: 1, step: 1, usage } })
  let state = forkDefinition.init({ id: 'child' }, 2)
  state = forkDefinition.apply(state, { type: 'request/context', data: { provider: 'deepseek-official', model: 'deepseek-flash' } })
  state = forkDefinition.apply(state, event(0, { inputTokens: 1000, outputTokens: 100 }))
  const beforeCut = forkDefinition.wire.view(state)
  check('fork: inherited prefix not billed', sum(beforeCut.totals) === 0 && beforeCut.tokens.cacheMiss === 0, money(sum(beforeCut.totals)))
  state = forkDefinition.apply(state, event(2, { inputTokens: 1000, outputTokens: 100 }))
  const afterCut = forkDefinition.wire.view(state)
  check('fork: own suffix billed', near(sum(afterCut.totals), (1000 * 2 * 12.0557 + 100 * 8 * 12.0557) / 1e6), money(sum(afterCut.totals)))
}

const failed = results.filter((r) => !r.ok)
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  - ${r.detail}`)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length === 0 ? 0 : 1)
