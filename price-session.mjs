/**
 * Price one existing session log with the bundle's own fold. Used to check the
 * estimate against real usage before the plugin is installed.
 */
import { readFileSync } from 'node:fs'
import { apply, Config } from './session-cost/index.js'

const file = process.argv[2]
if (file === undefined) {
  console.error('usage: node price-session.mjs <session.jsonl>')
  process.exit(2)
}

const definitions = []
apply({ sessionProjections: { register: (definition) => definitions.push(definition) } }, Config['~standard'].validate(undefined).value)
const definition = definitions[0]

let state = definition.init()
let events = 0
for (const line of readFileSync(file, 'utf8').split('\n')) {
  if (line.trim() === '') continue
  const event = JSON.parse(line)
  if (event.seq === undefined) continue
  events += 1
  state = definition.apply(state, event)
}

const view = definition.wire.view(state)
const total = view.totals.cacheMiss + view.totals.cacheHit + view.totals.cacheWrite + view.totals.output
const fmt = (n) => new Intl.NumberFormat('en').format(Math.round(n))
const money = (n) => n.toFixed(6)

console.log('events folded:', events)
console.log('model:', view.model, '| last tier:', view.tier)
console.log('tokens: input', fmt(view.tokens.cacheMiss), '| cache read', fmt(view.tokens.cacheHit), '| cache write', fmt(view.tokens.cacheWrite), '| output', fmt(view.tokens.output))
console.log('cost: input', money(view.totals.cacheMiss), '| cache read', money(view.totals.cacheHit), '| cache write', money(view.totals.cacheWrite), '| output', money(view.totals.output))
console.log('total:', view.symbol + money(total), view.currency)
if (view.secondary !== undefined) console.log('total:', view.secondary.symbol + money(total * (view.secondary.rate / view.rate)), view.secondary.currency)
console.log('unpriced tokens:', fmt(view.unpricedTokens), '| fallback tokens:', fmt(view.fallbackTokens))
