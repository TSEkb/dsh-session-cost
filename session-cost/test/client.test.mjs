/**
 * Client-half checks for the session cost panel: `node test/client.test.mjs`.
 *
 * The bundle is a `window.__ModuleLoader__.load({ id, factory })` call, so the
 * test evaluates it against a fake window, renders the registered component
 * with a tiny hand-rolled element walker (no React install needed), and asserts
 * on the text the panel actually produces.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = readFileSync(fileURLToPath(new URL('../client.js', import.meta.url)), 'utf8')

const Fragment = Symbol('Fragment')

/** Minimal React stand-in: createElement, two preset states, no effects. */
function makeReact(states) {
  let stateIndex = 0
  return {
    createElement(type, props, ...children) {
      const next = { ...(props ?? {}) }
      if (children.length === 1) next.children = children[0]
      else if (children.length > 1) next.children = children
      return { type, props: next }
    },
    Fragment,
    useState() {
      const value = states[Math.min(stateIndex, states.length - 1)]
      stateIndex += 1
      return [value, () => {}]
    },
    useEffect() {},
    useRef() {
      return { current: null }
    },
  }
}

/** Depth-first text of a rendered tree, invoking function components. */
function textOf(node) {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (node.type === Fragment) return textOf(node.props.children)
  if (typeof node.type === 'function') return textOf(node.type(node.props))
  return textOf(node.props?.children)
}

const mounted = {}
const window = {
  __ModuleLoader__: {
    load(registration) {
      mounted.id = registration.id
      mounted.factory = registration.factory
    },
  },
}

new Function('window', source)(window)

const dict = {}
const registered = {}
const ctx = {
  effect(run) {
    run()
    return () => {}
  },
  locale: {
    register(ns, dictionaries) {
      registered.ns = ns
      for (const [locale, table] of Object.entries(dictionaries)) dict[locale] = table
      return () => {}
    },
  },
  slots: {
    inject(_name, run) {
      return run()
    },
    register(definition, component) {
      registered.slot = definition
      registered.component = component
      return () => {}
    },
  },
}

const plugin = mounted.factory((name) => {
  if (name !== 'react') throw new Error(`unexpected require: ${name}`)
  return makeReact([true, { left: 120, bottom: 90 }])
})
plugin.apply(ctx)

const t = (key, values) => {
  const template = dict.en?.[key] ?? key
  if (values === undefined) return template
  return template.replace(/\{(\w+)\}/g, (match, name) => (values[name] === undefined ? match : String(values[name])))
}

const buckets = (miss, hit, write, output) => ({ cacheMiss: miss, cacheHit: hit, cacheWrite: write, output })

const view = {
  baseCurrency: 'CNY',
  currency: 'RUB',
  symbol: '₽',
  rate: 12.0557,
  secondary: { currency: 'USD', symbol: '$', rate: 1 / 80.53 },
  provider: 'google',
  model: 'gemini-3.1-pro-preview',
  tokens: buckets(3000, 60000, 0, 2500),
  totals: buckets(0.48318, 0.96636, 0, 2.4159),
  unpricedTokens: 0,
  fallbackTokens: 0,
  tier: null,
  keys: [
    {
      id: 'google',
      label: 'Google · GOOGLE_API_KEY',
      model: 'gemini-3.1-pro-preview',
      currency: 'USD',
      rate: 80.53,
      tokens: buckets(2000, 50000, 0, 2000),
      totals: buckets(0.32212, 0.80530, 0, 1.93272),
      unpricedTokens: 0,
      fallbackTokens: 0,
    },
    {
      id: 'deepseek-official',
      label: 'DeepSeek · DEEPSEEK_API_KEY',
      model: 'deepseek-flash',
      currency: 'CNY',
      rate: 12.0557,
      tokens: buckets(1000, 10000, 0, 500),
      totals: buckets(0.02411, 0.00241, 0, 0.04822),
      unpricedTokens: 0,
      fallbackTokens: 0,
    },
  ],
}

view.delegates = 2
view.lifetime = {
  sessions: 6,
  periods: [
    {
      id: 'session',
      keys: [
        { id: 'google', label: 'Google · GOOGLE_API_KEY', currency: 'USD', rate: 80.53, tokens: buckets(2000, 50000, 0, 2000), totals: buckets(0.32212, 0.8053, 0, 1.93272), unpricedTokens: 0, fallbackTokens: 0 },
        { id: 'deepseek-official', label: 'DeepSeek · DEEPSEEK_API_KEY', currency: 'CNY', rate: 12.0557, tokens: buckets(1000, 10000, 0, 500), totals: buckets(0.02411, 0.00241, 0, 0.04822), unpricedTokens: 0, fallbackTokens: 0 },
      ],
    },
    {
      id: 'today',
      keys: [
        { id: 'google', label: 'Google · GOOGLE_API_KEY', currency: 'USD', rate: 80.53, tokens: buckets(20000, 0, 0, 1200), totals: buckets(3.2, 0, 0, 1.2), unpricedTokens: 0, fallbackTokens: 0 },
        { id: 'deepseek-official', label: 'DeepSeek · DEEPSEEK_API_KEY', currency: 'CNY', rate: 12.0557, tokens: buckets(200000, 8000000, 0, 150000), totals: buckets(4.8, 3.8, 0, 6.4), unpricedTokens: 0, fallbackTokens: 0 },
      ],
    },
    {
      id: 'week',
      keys: [
        { id: 'google', label: 'Google · GOOGLE_API_KEY', currency: 'USD', rate: 80.53, tokens: buckets(40000, 0, 0, 3000), totals: buckets(6.44, 0, 0, 2.42), unpricedTokens: 0, fallbackTokens: 0 },
        { id: 'deepseek-official', label: 'DeepSeek · DEEPSEEK_API_KEY', currency: 'CNY', rate: 12.0557, tokens: buckets(300000, 9000000, 0, 200000), totals: buckets(7.2, 4.3, 0, 9.8), unpricedTokens: 0, fallbackTokens: 0 },
      ],
    },
    {
      id: 'month',
      keys: [
        { id: 'google', label: 'Google · GOOGLE_API_KEY', currency: 'USD', rate: 80.53, tokens: buckets(40000, 0, 0, 3000), totals: buckets(6.44, 0, 0, 2.42), unpricedTokens: 0, fallbackTokens: 0 },
        { id: 'deepseek-official', label: 'DeepSeek · DEEPSEEK_API_KEY', currency: 'CNY', rate: 12.0557, tokens: buckets(300000, 9000000, 0, 200000), totals: buckets(7.2, 4.3, 0, 9.8), unpricedTokens: 0, fallbackTokens: 0 },
      ],
    },
    { id: 'all', keys: [] },
  ],
}

const results = []
const check = (name, ok, detail) => results.push({ name, ok, detail })

check('module id', mounted.id === '@local/session-cost', String(mounted.id))
check('slot registered', registered.slot?.name === 'conversation.composer.dock', JSON.stringify(registered.slot))

const html = textOf(
  registered.component({
    useProjection: (key) => (key === 'sessionCost' ? view : undefined),
    t,
  }),
)

check('panel title', html.includes('Session cost'), '')
check('per-key section', html.includes('By key'), '')
check('google key labelled', html.includes('Google · GOOGLE_API_KEY'), '')
check('deepseek key labelled', html.includes('DeepSeek · DEEPSEEK_API_KEY'), '')
check('key amounts formatted', html.includes('₽3.06') && html.includes('₽0.0747'), '')
check('rates line names USD', html.includes('Rates: 1 USD = 80.53 ₽'), '')
check('secondary reading', html.includes('≈ $0.048 USD'), '')
check('total shown', html.includes('Total ₽3.87'), '')
check('period section title', html.includes('Spending by period'), '')
check('period headers', ['This session', 'Today', '7 d', '30 d', 'All'].every((label) => html.includes(label)), '')
check('short key labels', html.includes('Google') && html.includes('DeepSeek'), '')
check('today google amount', html.includes('₽4.4'), '')
check('week deepseek amount', html.includes('₽21.3'), '')
check('total row starts with the session', html.includes('Total ₽3.13'), '')
check('total row covers the week', html.includes('₽30.16'), '')
check('empty period shows a dash', html.includes('—'), '')
check('period note counts sessions', html.includes('6 saved sessions'), '')
check('delegation note', html.includes('Includes 2 delegated sessions'), '')

// A session that used only one key still names it.
const single = { ...view, keys: [view.keys[1]], model: 'deepseek-flash', provider: 'deepseek-official', tier: 'peak' }
const singleHtml = textOf(
  registered.component({
    useProjection: () => single,
    t,
  }),
)
check('single key still labelled', singleHtml.includes('DeepSeek · DEEPSEEK_API_KEY'), '')
check('tier note renders', singleHtml.includes('peak-hour'), '')
check('CNY rate line for a CNY-only session', singleHtml.includes('Rates: 1 CNY = 12.06 ₽'), '')

// Nothing priced yet: the pill stays out of the dock.
const empty = { ...view, tokens: buckets(0, 0, 0, 0), totals: buckets(0, 0, 0, 0), keys: [] }
check(
  'empty session renders nothing',
  registered.component({ useProjection: () => empty, t }) === null,
  '',
)

// Forced Russian: same numbers, Russian copy, inside an English shell.
const ruHtml = textOf(
  registered.component({
    useProjection: () => ({ ...view, language: 'ru' }),
    t,
  }),
)
check('ru title', ruHtml.includes('Стоимость сессии'), '')
check('ru buckets', ruHtml.includes('Вход · мимо кэша') && ruHtml.includes('Выход'), '')
check('ru keys section', ruHtml.includes('По ключам'), '')
check('ru period table', ruHtml.includes('Расход по периодам') && ruHtml.includes('Сегодня'), '')
check('ru session column', ruHtml.includes('Эта сессия'), '')
check('ru delegation note', ruHtml.includes('Включая делегации: 2'), '')
check('ru total row', ruHtml.includes('Итого'), '')
check('ru keeps amounts', ruHtml.includes('₽3.87') && ruHtml.includes('₽4.4'), '')

const failed = results.filter((r) => !r.ok)
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  - ${r.detail}` : ''}`)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
// The style sheet is in the same tree as the panel; print only the copy.
const copy = html
  .split('\n')
  .filter((line) => !line.trim().startsWith('.dsc'))
  .join('\n')
  .replace(/\s+/g, ' ')
  .trim()
console.log(`\nrendered copy:\n${copy}`)
process.exit(failed.length === 0 ? 0 : 1)
