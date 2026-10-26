/**
 * Checks for the client-side subagent aggregation. The functions live inside the
 * browser bundle, so the test extracts their source and runs it in Node; this
 * keeps one implementation rather than a copied test double.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./session-cost/client.js', import.meta.url), 'utf8')
const start = source.indexOf('function costTotal')
const end = source.indexOf('function Tokens')
if (start < 0 || end < 0) throw new Error('could not locate the aggregation functions in client.js')
const { costTotal, collectSubagentCosts } = new Function(
  `${source.slice(start, end)}; return { costTotal, collectSubagentCosts }`,
)()

const cost = (amount) => ({
  symbol: '₽',
  rate: 12,
  totals: { cacheMiss: amount, cacheHit: 0, cacheWrite: 0, output: 0 },
  unpricedTokens: 0,
  fallbackTokens: 0,
})

const projections = {
  root: {
    state: 'ready',
    values: {
      subagentCatalog: [
        { id: 'a', mode: 'continuable', label: 'A' },
        { id: 'b', mode: 'continuable', label: 'B' },
        { id: 'd', mode: 'external', label: 'D' },
      ],
      sessionCost: cost(0),
    },
  },
  a: { state: 'ready', values: { subagentCatalog: [], sessionCost: cost(1) } },
  b: {
    state: 'ready',
    values: { subagentCatalog: [{ id: 'c', mode: 'one-shot', label: 'C' }], sessionCost: cost(2) },
  },
  c: {
    state: 'ready',
    values: { subagentCatalog: [{ id: 'a', mode: 'continuable' }], sessionCost: cost(3) },
  },
}

const nodes = collectSubagentCosts('root', projections.root.values.subagentCatalog, projections)
assert.equal(nodes.length, 4, 'flattens every local child plus the external leaf')
assert.equal(nodes.filter((node) => node.external).length, 1, 'keeps the external child unpriced')
assert.equal(nodes.find((node) => node.id === 'c').depth, 2, 'includes grandchildren at their depth')
assert.equal(costTotal(projections.c.values.sessionCost), 3)

const childTotal = nodes.filter((node) => !node.external).reduce((sum, node) => sum + costTotal(node.cost), 0)
assert.equal(childTotal, 6, 'sums a, b and c without double-counting the cycle')

const pending = collectSubagentCosts('root', [{ id: 'missing', mode: 'continuable' }], {})
assert.equal(pending.length, 1)
assert.equal(pending[0].loading, true, 'waits for a child projection that has not arrived')

const unavailable = collectSubagentCosts('root', [{ id: 'cold', mode: 'one-shot' }], {
  cold: { state: 'ready', values: {}, error: null },
})
assert.equal(unavailable[0].loading, false)
assert.equal(unavailable[0].unavailable, true, 'distinguishes a missing projection from a pending read')

console.log('ok   4 child rows (1 external, 1 grandchild), sum 6, loading and unavailable states')
