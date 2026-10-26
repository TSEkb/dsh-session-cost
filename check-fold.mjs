/**
 * Scratch verification of the session-cost fold. Not part of the bundle: it
 * mounts the Host half against a fake registry and folds synthetic events.
 */
import { apply, Config } from './session-cost/index.js'

const near = (actual, expected, label) => {
  const ok = Math.abs(actual - expected) <= 1e-12
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${actual} (expected ${expected})`)
  if (!ok) process.exitCode = 1
}

const definitions = []
const ctx = { sessionProjections: { register: (definition) => definitions.push(definition) } }
// Price in the base list currency first, so the assertions below read as the
// published per-million figures; the conversion is checked separately.
apply(ctx, Config['~standard'].validate({ rate: 1, currency: 'CNY', symbol: '¥' }).value)

const definition = definitions[0]
const viewOf = (state) => definition.wire.viewSchema.parse(definition.wire.view(state))

const step = (turn, stepNumber, usage, time, extra = {}) => ({
  type: 'assistant/message',
  time,
  data: { turn, step: stepNumber, message: {}, stream: [], usage, ...extra },
})

const context = (model, time = 0) => ({ type: 'request/context', time, data: { provider: 'deepseek-official', model } })

const peakTime = Date.UTC(2026, 9, 26, 2, 0) // 10:00 Beijing, Monday
const idleTime = Date.UTC(2026, 9, 26, 12, 0) // 20:00 Beijing, Monday

const usageA = { inputTokens: 1000, cacheReadTokens: 9000, outputTokens: 500 }

// 1. Peak pricing for deepseek-flash.
let state = definition.init()
state = definition.apply(state, context('deepseek-flash'))
state = definition.apply(state, step(1, 1, usageA, peakTime))
let view = viewOf(state)
near(view.totals.cacheMiss, 0.002, 'peak cache-miss cost')
near(view.totals.cacheHit, 0.00036, 'peak cache-hit cost')
near(view.totals.output, 0.004, 'peak output cost')
console.log('    tier:', view.tier, 'model:', view.model, 'symbol:', view.symbol)

// 2. Off-peak pricing on another turn.
state = definition.apply(state, step(1, 2, usageA, idleTime))
view = viewOf(state)
near(view.totals.cacheMiss, 0.003, 'peak+idle cache-miss total')
near(view.totals.output, 0.006, 'peak+idle output total')
near(view.totals.cacheHit, 0.00054, 'peak+idle cache-hit total')

// 3. A repeat settlement for the same turn/step replaces, not adds.
const before = viewOf(state)
state = definition.apply(state, step(1, 2, { inputTokens: 2000, cacheReadTokens: 9000, outputTokens: 500 }, idleTime))
view = viewOf(state)
near(view.totals.cacheMiss, 0.004, 'replaced cache-miss total')
near(view.tokens.cacheMiss, 3000, 'replaced cache-miss tokens')
near(view.totals.cacheHit, before.totals.cacheHit, 'cache-hit unchanged by replacement')
near(view.totals.output, 0.006, 'output unchanged by replacement')

// 4. An identical repeat reports the same state reference.
const repeated = definition.apply(state, step(1, 2, { inputTokens: 2000, cacheReadTokens: 9000, outputTokens: 500 }, idleTime))
console.log(`${repeated === state ? 'ok  ' : 'FAIL'} identical repeat keeps state identity`)
if (repeated !== state) process.exitCode = 1

// 5. A retry closes the replacement scope, so the next attempt adds.
state = definition.apply(state, { type: 'llm/retry-started', time: idleTime, data: { turn: 1, step: 2 } })
state = definition.apply(state, step(1, 2, { inputTokens: 1000, cacheReadTokens: 0, outputTokens: 0 }, idleTime))
view = viewOf(state)
near(view.tokens.cacheMiss, 4000, 'retried attempt adds its tokens')
near(view.totals.cacheMiss, 0.005, 'retried attempt adds its cost')

// 6. An unknown route model falls back to deepseek-flash and reports it.
state = definition.apply(state, context('some-other-model'))
state = definition.apply(state, step(2, 1, { inputTokens: 1_000_000, cacheReadTokens: 0, outputTokens: 0 }, idleTime))
view = viewOf(state)
near(view.totals.cacheMiss, 0.005 + 1, 'fallback priced at flash off-peak rate')
console.log(`${view.fallbackTokens === 1_000_000 ? 'ok  ' : 'FAIL'} fallback token count reported`)
if (view.fallbackTokens !== 1_000_000) process.exitCode = 1

// 7. An attempt-only settlement reads usage out of its compacted stream.
state = definition.apply(state, {
  type: 'assistant/attempt',
  time: idleTime,
  data: { turn: 2, step: 2, stream: [{ type: 'chunk', time: idleTime, chunk: { type: 'usage', usage: { inputTokens: 1000, outputTokens: 0 } } }] },
})
view = viewOf(state)
near(view.tokens.cacheMiss, 1_000_000 + 1000 + 4000, 'attempt stream usage counted')

// 8. The derived view keeps identity while the fold state does.
const first = definition.wire.view(state)
const second = definition.wire.view(state)
console.log(`${first === second ? 'ok  ' : 'FAIL'} view identity is stable`)
if (first !== second) process.exitCode = 1

// 9. The default config converts the published CNY list into rubles.
const rubDefinitions = []
apply(
  { sessionProjections: { register: (candidate) => rubDefinitions.push(candidate) } },
  Config['~standard'].validate(undefined).value,
)
const rub = rubDefinitions[0]
let rubState = rub.init()
rubState = rub.apply(rubState, context('deepseek-flash'))
rubState = rub.apply(rubState, step(1, 1, usageA, idleTime))
const rubView = rub.wire.view(rubState)
near(rubView.totals.cacheMiss, 0.001 * 12.0557, 'rubles: cache-miss conversion')
near(rubView.totals.cacheHit, 0.00018 * 12.0557, 'rubles: cache-hit conversion')
near(rubView.totals.output, 0.002 * 12.0557, 'rubles: output conversion')
console.log(`${rubView.symbol === '₽' && rubView.currency === 'RUB' && rubView.rate === 12.0557 ? 'ok  ' : 'FAIL'} ruble display metadata`)

// 10. The secondary currency rides the same base list: USD per CNY.
const usdView = rubDefinitions.length > 0 ? rub.wire.view(rubState) : undefined
near(usdView.secondary.rate, 0.1497, 'secondary USD rate')
console.log(`${usdView.secondary.currency === 'USD' && usdView.secondary.symbol === '$' ? 'ok  ' : 'FAIL'} secondary display metadata`)
const secondaryTotal = (usdView.totals.cacheMiss + usdView.totals.cacheHit + usdView.totals.output) * (usdView.secondary.rate / usdView.rate)
near(secondaryTotal, (0.001 + 0.00018 + 0.002) * 0.1497, 'secondary USD conversion')

// 11. A fork-inherited prefix is already billed to the parent; the child counts
// only its own suffix.
let forkState = definition.init({}, 2)
forkState = definition.apply(forkState, { ...step(1, 1, usageA, peakTime), seq: 0 })
let forkView = viewOf(forkState)
near(forkView.totals.cacheMiss, 0, 'fork: inherited cache-miss not billed again')
near(forkView.tokens.cacheMiss, 0, 'fork: inherited tokens not counted')
forkState = definition.apply(forkState, { ...step(1, 1, usageA, peakTime), seq: 2 })
forkView = viewOf(forkState)
near(forkView.totals.cacheMiss, 0.002, 'fork: own cache-miss billed')
near(forkView.tokens.cacheMiss, 1000, 'fork: own tokens counted')
