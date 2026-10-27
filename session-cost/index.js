/**
 * Session cost bundle — Host half.
 *
 * Registers the `sessionCost` session projection: a replay-derived fold over
 * the route the log recorded (`request/context`, then `request/header`) and the
 * provider-reported usage carried by `assistant/message` / `assistant/attempt`.
 * Prices come from the row config, defaulting to the published lists of the
 * routes this deployment serves: DeepSeek in CNY with its peak / off-peak split
 * and Google (Gemini) in USD, snapshotted from the installed pi-ai catalog.
 * Every sample is converted into the display currency at the rate configured
 * for its own base currency, and also kept per route, so the panel can show
 * what each API key spent.
 *
 * The fold is deterministic: it reads only committed events, so replay and
 * resume rebuild the same figure, and no model call is made to price anything.
 * The Client half renders it beside the composer.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const inject = ['sessionProjections']

const CNY = 'CNY'
const USD = 'USD'

/** Published DeepSeek API rates, in CNY per million tokens. */
const DEEPSEEK_MODELS = {
  'deepseek-flash': {
    provider: 'deepseek-official',
    currency: CNY,
    miss: { idle: 1, peak: 2 },
    hit: { idle: 0.02, peak: 0.04 },
    output: { idle: 4, peak: 8 },
  },
  'deepseek-v4-pro': {
    provider: 'deepseek-official',
    currency: CNY,
    miss: { idle: 4.5, peak: 9 },
    hit: { idle: 0.15, peak: 0.3 },
    output: { idle: 13.5, peak: 27 },
  },
}

/**
 * One Gemini price entry: USD per million tokens, flat unless the prompt
 * crosses a long-context tier.
 * @param input - prompt tokens without a cache hit.
 * @param output - completion tokens.
 * @param cacheRead - cached prompt tokens.
 * @param tiers - optional long-context replacements.
 * @returns the model price entry.
 */
function gemini(input, output, cacheRead, tiers) {
  return {
    provider: 'google',
    currency: USD,
    input,
    output,
    cacheRead,
    cacheWrite: 0,
    ...(tiers === undefined ? {} : { tiers }),
  }
}

/** The 200k-tier replacement Google publishes for its long-context models. */
const longContext = (input, output, cacheRead) => [{ inputTokensAbove: 200_000, input, output, cacheRead, cacheWrite: 0 }]

/**
 * Published Google (Gemini API) rates, in USD per million tokens, snapshotted
 * from the pi-ai catalog the `dsh-llm-pi-ai` route prices against
 * (`@earendil-works/pi-ai` → `providers/data/google.json`). Keeping the same
 * snapshot means a route's price here cannot drift from the adapter's own idea
 * of it; a newer catalog is picked up by overriding `models` in the row config.
 */
const GEMINI_MODELS = {
  'gemini-2.5-pro': gemini(1.25, 10, 0.125, longContext(2.5, 15, 0.25)),
  'gemini-2.5-flash': gemini(0.3, 2.5, 0.03),
  'gemini-2.5-flash-lite': gemini(0.1, 0.4, 0.01),
  'gemini-2.5-computer-use-preview-10-2025': gemini(1.25, 10, 0, longContext(2.5, 15, 0)),
  'gemini-3-flash-preview': gemini(0.5, 3, 0.05),
  'gemini-3.1-pro-preview': gemini(2, 12, 0.2, longContext(4, 18, 0.4)),
  'gemini-3.1-pro-preview-customtools': gemini(2, 12, 0.2, longContext(4, 18, 0.4)),
  'gemini-3.1-flash-lite': gemini(0.25, 1.5, 0.025),
  'gemini-3.1-flash-lite-preview': gemini(0.25, 1.5, 0.025),
  'gemini-3.1-flash-lite-image': gemini(0.25, 30, 0),
  'gemini-3.1-flash-live-preview': gemini(0.75, 4.5, 0),
  'gemini-3.5-flash': gemini(1.5, 9, 0.15),
  'gemini-3.5-flash-lite': gemini(0.3, 2.5, 0.03),
  'gemini-3.6-flash': gemini(0.75, 3.75, 0.075),
  'gemini-3.7-flash': gemini(0.75, 3.75, 0.075),
  'gemini-3.8-flash': gemini(0.75, 3.75, 0.075),
  'gemini-4-argon': gemini(2, 10, 0.1),
  'gemini-flash-latest': gemini(1.5, 9, 0.15),
  'gemini-flash-lite-latest': gemini(0.25, 1.5, 0.025),
  'gemini-pro-latest': gemini(2, 12, 0.2, longContext(4, 18, 0.4)),
  'deep-research-preview-04-2026': gemini(2, 12, 0.2, longContext(4, 18, 0.4)),
  'deep-research-max-preview-04-2026': gemini(2, 12, 0.2, longContext(4, 18, 0.4)),
}

const DEFAULT_MODELS = { ...DEEPSEEK_MODELS, ...GEMINI_MODELS }

const DEFAULTS = {
  // The DeepSeek table is quoted in CNY and the Gemini table in USD; each entry
  // names its own base currency, and `rates` converts it for display.
  baseCurrency: CNY,
  // What the pill reports, at Central Bank rates as of the last edit.
  currency: 'RUB',
  symbol: '₽',
  rates: { CNY: 12.0557, USD: 80.53 },
  // A second reading in another currency, shown beside the primary total in
  // the opened panel. Its rate is derived from `rates`, not configured twice.
  secondary: { currency: 'USD', symbol: '$' },
  timeZone: 'Asia/Shanghai',
  peakWeekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  peakHours: [[9, 12], [14, 18]],
  fallbackModel: 'deepseek-flash',
  // Labels for the per-key rows, by route name. A route the config does not
  // name still appears, labelled with its recorded id.
  providers: {
    'deepseek-official': { label: 'DeepSeek' },
    google: { label: 'Google' },
  },
  // Every saved session's per-key total, read from the projection cache, so the
  // panel can answer "what did this key cost in total" without a second store.
  lifetime: { enabled: true, root: null },
  // Which dictionary the panel reads: the app's locale by default, or a forced
  // one, so a Russian owner gets Russian numbers inside an English shell.
  language: 'auto',
  models: DEFAULT_MODELS,
}

const isRate = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0

/**
 * Merge the configured conversion table over the defaults. The legacy `rate`
 * field keeps its old meaning — display units per one CNY — and applies only
 * where `rates` does not name that currency.
 * @param raw - raw row config.
 * @returns display units per one unit of each base currency.
 */
function normalizeRates(raw) {
  const rates = { ...DEFAULTS.rates }
  if (isRate(raw.rate)) rates[typeof raw.baseCurrency === 'string' ? raw.baseCurrency : DEFAULTS.baseCurrency] = raw.rate
  if (raw.rates !== null && typeof raw.rates === 'object') {
    for (const [currency, value] of Object.entries(raw.rates)) {
      if (isRate(value)) rates[currency] = value
    }
  }
  return rates
}

/**
 * Merge the per-route labels over the defaults.
 * @param raw - raw row config.
 * @returns labels keyed by route name.
 */
function normalizeProviders(raw) {
  const providers = {}
  for (const [id, entry] of Object.entries(DEFAULTS.providers)) providers[id] = { ...entry }
  if (raw.providers !== null && typeof raw.providers === 'object') {
    for (const [id, entry] of Object.entries(raw.providers)) {
      if (entry === null || typeof entry !== 'object') continue
      providers[id] = { ...(providers[id] ?? {}), ...(typeof entry.label === 'string' ? { label: entry.label } : {}) }
    }
  }
  return providers
}

/**
 * Merge one row's raw config over the defaults. Kept hand-written so the
 * bundle needs no schema library; Cordis only calls the Standard Schema
 * `validate` face.
 * @param input - raw `config` value from the Loader row.
 * @returns the complete, typed settings object.
 */
function normalizeConfig(input) {
  const raw = input !== null && typeof input === 'object' ? input : {}
  const models = { ...DEFAULT_MODELS }
  if (raw.models !== null && typeof raw.models === 'object') {
    for (const [model, entry] of Object.entries(raw.models)) {
      if (entry === null || typeof entry !== 'object') continue
      models[model] = { ...(models[model] ?? {}), ...entry }
    }
  }
  const baseCurrency = typeof raw.baseCurrency === 'string' ? raw.baseCurrency : DEFAULTS.baseCurrency
  const rates = normalizeRates(raw)
  // The secondary reading is derived from the same table; a legacy
  // `secondary.rate` is quoted per one base-currency unit, as it always was.
  const secondaryCurrency = typeof raw.secondary?.currency === 'string' ? raw.secondary.currency : DEFAULTS.secondary.currency
  let secondaryRate
  if (isRate(rates[secondaryCurrency])) secondaryRate = 1 / rates[secondaryCurrency]
  else if (isRate(raw.secondary?.rate) && isRate(rates[baseCurrency])) secondaryRate = raw.secondary.rate / rates[baseCurrency]
  else secondaryRate = 0
  return {
    baseCurrency,
    currency: typeof raw.currency === 'string' ? raw.currency : DEFAULTS.currency,
    symbol: typeof raw.symbol === 'string' ? raw.symbol : DEFAULTS.symbol,
    rates,
    rate: rates[baseCurrency],
    secondary: {
      currency: secondaryCurrency,
      symbol: typeof raw.secondary?.symbol === 'string' ? raw.secondary.symbol : DEFAULTS.secondary.symbol,
      rate: secondaryRate,
    },
    timeZone: typeof raw.timeZone === 'string' ? raw.timeZone : DEFAULTS.timeZone,
    peakWeekdays: Array.isArray(raw.peakWeekdays)
      ? raw.peakWeekdays.filter((day) => typeof day === 'string')
      : DEFAULTS.peakWeekdays,
    peakHours: Array.isArray(raw.peakHours)
      ? raw.peakHours.filter(
          (range) => Array.isArray(range) && range.length === 2 && typeof range[0] === 'number' && typeof range[1] === 'number',
        )
      : DEFAULTS.peakHours,
    fallbackModel: typeof raw.fallbackModel === 'string' ? raw.fallbackModel : DEFAULTS.fallbackModel,
    providers: normalizeProviders(raw),
    lifetime: {
      enabled: raw.lifetime?.enabled === undefined ? DEFAULTS.lifetime.enabled : raw.lifetime.enabled !== false,
      root: typeof raw.lifetime?.root === 'string' && raw.lifetime.root.length > 0 ? raw.lifetime.root : null,
    },
    language: ['auto', 'en', 'zh', 'ru'].includes(raw.language) ? raw.language : DEFAULTS.language,
    models,
  }
}

/** Standard Schema face: Cordis validates a row's `config` through it. */
export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-session-cost',
    validate(value) {
      return { value: normalizeConfig(value) }
    },
  },
}

const zeroBuckets = () => ({ cacheMiss: 0, cacheHit: 0, cacheWrite: 0, output: 0 })

const countOf = (value) => (Number.isFinite(value) && value > 0 ? value : 0)

const addBuckets = (left, right) => ({
  cacheMiss: left.cacheMiss + right.cacheMiss,
  cacheHit: left.cacheHit + right.cacheHit,
  cacheWrite: left.cacheWrite + right.cacheWrite,
  output: left.output + right.output,
})

const subtractBuckets = (left, right) => ({
  cacheMiss: left.cacheMiss - right.cacheMiss,
  cacheHit: left.cacheHit - right.cacheHit,
  cacheWrite: left.cacheWrite - right.cacheWrite,
  output: left.output - right.output,
})

const sameBuckets = (left, right) =>
  left.cacheMiss === right.cacheMiss &&
  left.cacheHit === right.cacheHit &&
  left.cacheWrite === right.cacheWrite &&
  left.output === right.output

const totalOfBuckets = (buckets) => buckets.cacheMiss + buckets.cacheHit + buckets.cacheWrite + buckets.output

/** One route's running totals, so the panel can bill each key separately. */
const emptyKey = () => ({
  model: null,
  currency: null,
  rate: undefined,
  tokens: zeroBuckets(),
  totals: zeroBuckets(),
  unpricedTokens: 0,
  fallbackTokens: 0,
})

/**
 * Add (or, with a negative sign, remove) one sample's contribution to one
 * route's running totals. A retried settlement replaces its own contribution
 * instead of accumulating on top of it.
 * @param keys - per-route totals keyed by route name.
 * @param keyId - the route the sample belongs to.
 * @param sample - the priced sample.
 * @param sign - 1 to add, -1 to remove.
 * @returns a new per-route map.
 */
function shiftKey(keys, keyId, sample, sign) {
  const previous = keys[keyId] ?? emptyKey()
  return {
    ...keys,
    [keyId]: {
      model: sample.model,
      currency: sample.currency,
      rate: sample.rate,
      tokens: {
        cacheMiss: previous.tokens.cacheMiss + sign * sample.tokens.cacheMiss,
        cacheHit: previous.tokens.cacheHit + sign * sample.tokens.cacheHit,
        cacheWrite: previous.tokens.cacheWrite + sign * sample.tokens.cacheWrite,
        output: previous.tokens.output + sign * sample.tokens.output,
      },
      totals: {
        cacheMiss: previous.totals.cacheMiss + sign * sample.totals.cacheMiss,
        cacheHit: previous.totals.cacheHit + sign * sample.totals.cacheHit,
        cacheWrite: previous.totals.cacheWrite + sign * sample.totals.cacheWrite,
        output: previous.totals.output + sign * sample.totals.output,
      },
      unpricedTokens: previous.unpricedTokens + sign * sample.unpricedTokens,
      fallbackTokens: previous.fallbackTokens + sign * sample.fallbackTokens,
    },
  }
}

const numberOr = (value) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined)

/** One tier's price: a plain number is flat, `{ idle, peak }` follows the clock. */
const timePrice = (field, tier) => {
  if (typeof field === 'number' && Number.isFinite(field)) return field
  if (field === null || typeof field !== 'object') return undefined
  const preferred = field[tier]
  if (typeof preferred === 'number' && Number.isFinite(preferred)) return preferred
  const other = field[tier === 'peak' ? 'idle' : 'peak']
  return typeof other === 'number' && Number.isFinite(other) ? other : undefined
}

/** Whether a price entry splits its rates by wall-clock tier at all. */
const hasTimeTiers = (entry) =>
  ['miss', 'hit', 'write', 'input', 'cacheRead', 'cacheWrite', 'output'].some(
    (field) => entry[field] !== null && typeof entry[field] === 'object',
  )

/**
 * The entry's price set for one sample: the long-context tier replaces the flat
 * fields when the prompt crosses its threshold.
 * @param entry - model price entry.
 * @param promptTokens - the sample's full prompt size.
 * @returns the entry the prices are read from.
 */
function longContextEntry(entry, promptTokens) {
  if (!Array.isArray(entry.tiers) || entry.tiers.length === 0) return entry
  let chosen
  for (const tier of entry.tiers) {
    if (tier === null || typeof tier !== 'object') continue
    const above = numberOr(tier.inputTokensAbove)
    if (above === undefined || promptTokens <= above) continue
    if (chosen === undefined || above > chosen.inputTokensAbove) chosen = tier
  }
  return chosen === undefined ? entry : { ...entry, ...chosen }
}

/**
 * Read the usage one settlement reports: the message's own `usage`, else the
 * last `usage` chunk of its compacted stream (the retried-attempt case).
 * @param event - committed `assistant/message` or `assistant/attempt` event.
 * @returns the reported usage, or `undefined` when the adapter reported none.
 */
function usageOf(event) {
  if (event.type === 'assistant/message' && event.data !== undefined && event.data.usage !== undefined) return event.data.usage
  const stream = event.data?.stream
  if (!Array.isArray(stream)) return undefined
  for (let index = stream.length - 1; index >= 0; index -= 1) {
    const record = stream[index]
    if (record !== null && typeof record === 'object' && record.type === 'chunk' && record.chunk?.type === 'usage' && record.chunk.usage !== undefined) {
      return record.chunk.usage
    }
  }
  return undefined
}

const sameSample = (left, right) =>
  left.keyId === right.keyId &&
  left.model === right.model &&
  left.currency === right.currency &&
  left.rate === right.rate &&
  left.tier === right.tier &&
  left.unpricedTokens === right.unpricedTokens &&
  left.fallbackTokens === right.fallbackTokens &&
  sameBuckets(left.tokens, right.tokens) &&
  sameBuckets(left.totals, right.totals)

const totalCostOf = (totals) => totals.cacheMiss + totals.cacheHit + totals.cacheWrite + totals.output

const stringOrNull = (value) => (typeof value === 'string' && value.length > 0 ? value : null)

/**
 * Read every saved session's per-key totals out of the projection cache.
 *
 * The cache already checkpoints each session's `sessionCost` state, so a
 * cross-session total needs no second store: the same numbers the pill shows
 * for one session, summed over the sessions on this machine. Each entry keeps
 * the session's start time, which is how a session is attributed to a period.
 * The directory is re-read only when a file's name or modification time
 * changes.
 * @param root - directory holding one JSON document per session.
 * @returns a reader returning `{ sessions: [{ id, startedAt, keys }] }`, or
 *   `undefined` while the directory cannot be read.
 */
export function createLifetimeReader(root) {
  let signature
  let value
  return function read() {
    let names
    try {
      names = readdirSync(root).filter((name) => name.endsWith('.json'))
    } catch {
      return undefined
    }
    const stamps = []
    for (const name of names) {
      try {
        stamps.push(name + ':' + statSync(join(root, name)).mtimeMs)
      } catch {
        // A session being written right now simply misses this snapshot.
      }
    }
    stamps.sort()
    const next = stamps.join('|')
    if (next === signature) return value
    signature = next
    const sessions = []
    for (const name of names) {
      let doc
      try {
        doc = JSON.parse(readFileSync(join(root, name), 'utf8'))
      } catch {
        continue
      }
      const record = doc?.record
      const row = record?.rows?.sessionCost
      if (row === null || row === undefined || row.ver < 2) continue
      const buckets = row.val?.keys
      if (buckets === null || typeof buckets !== 'object') continue
      const startedAt = Number.isFinite(record?.identity?.createdAt) ? record.identity.createdAt : null
      // The parent's own catalog names the sessions it delegated to, which is
      // how a subagent's spend is attributed back to the run that asked for it.
      const head = record?.rows?.subagentCatalog?.val?.head?.values
      const children = Array.isArray(head)
        ? head.map((entry) => entry?.childId).filter((id) => typeof id === 'string' && id.length > 0)
        : []
      sessions.push({ id: name.replace(/\.json$/, ''), startedAt, keys: buckets, children })
    }
    const parentOf = new Map()
    for (const session of sessions) {
      for (const child of session.children) parentOf.set(child, session.id)
    }
    value = {
      sessions: sessions.map((session) => ({
        id: session.id,
        startedAt: session.startedAt,
        parentId: parentOf.get(session.id) ?? null,
        keys: session.keys,
      })),
    }
    return value
  }
}

/**
 * The sessions one run delegated to, recursively.
 * @param entries - sessions from {@link createLifetimeReader}.
 * @param sessionId - the run whose delegates are wanted.
 * @returns the descendant sessions, each once.
 */
export function descendantsOf(entries, sessionId) {
  const found = []
  if (typeof sessionId !== 'string' || sessionId.length === 0) return found
  const children = new Map()
  for (const entry of entries.sessions) {
    if (entry.parentId === null) continue
    const list = children.get(entry.parentId) ?? []
    list.push(entry)
    children.set(entry.parentId, list)
  }
  const seen = new Set([sessionId])
  const queue = [sessionId]
  while (queue.length > 0) {
    const id = queue.shift()
    for (const child of children.get(id) ?? []) {
      if (seen.has(child.id)) continue
      seen.add(child.id)
      found.push(child)
      queue.push(child.id)
    }
  }
  return found
}

/**
 * Sum the saved sessions into rolling periods, per key.
 *
 * A session is attributed whole to the period its start falls in, because the
 * projection cache keeps one total per session and not per request. "Today" is
 * the local calendar day; the other windows are rolling back from now.
 * @param entries - sessions from {@link createLifetimeReader}.
 * @param now - the instant the windows are measured back from.
 * @returns one bucket per period, each with its per-key totals.
 */
export function summarizeLifetime(entries, now) {
  const dayStart = new Date(now)
  dayStart.setHours(0, 0, 0, 0)
  const periods = [
    { id: 'today', from: dayStart.getTime() },
    { id: 'week', from: now - 7 * 86_400_000 },
    { id: 'month', from: now - 30 * 86_400_000 },
    { id: 'all', from: -Infinity },
  ]
  const sums = periods.map(() => new Map())
  for (const entry of entries.sessions) {
    const startedAt = entry.startedAt
    for (const [index, period] of periods.entries()) {
      if (startedAt === null || startedAt < period.from) continue
      const bucket = sums[index]
      for (const [id, key] of Object.entries(entry.keys)) {
        const previous =
          bucket.get(id) ?? {
            model: null,
            currency: null,
            rate: undefined,
            tokens: zeroBuckets(),
            totals: zeroBuckets(),
            unpricedTokens: 0,
            fallbackTokens: 0,
          }
        bucket.set(id, {
          model: key.model ?? previous.model,
          currency: key.currency ?? previous.currency,
          rate: key.rate ?? previous.rate,
          tokens: addBuckets(previous.tokens, key.tokens ?? zeroBuckets()),
          totals: addBuckets(previous.totals, key.totals ?? zeroBuckets()),
          unpricedTokens: previous.unpricedTokens + (key.unpricedTokens ?? 0),
          fallbackTokens: previous.fallbackTokens + (key.fallbackTokens ?? 0),
        })
      }
    }
  }
  return {
    periods: periods.map((period, index) => ({
      id: period.id,
      keys: [...sums[index]]
        .map(([id, entry]) => ({ id, ...entry }))
        .filter((entry) => totalOfBuckets(entry.tokens) > 0),
    })),
  }
}

/**
 * Mount the `sessionCost` projection for this deployment's price table.
 * @param ctx - plugin context carrying the session projection registry.
 * @param config - validated row config from {@link normalizeConfig}.
 */
export function apply(ctx, config) {
  const settings = config ?? normalizeConfig(undefined)
  const { baseCurrency, currency, symbol, rate, rates, secondary, fallbackModel, peakHours, providers } = settings
  const models = settings.models
  const peakWeekdays = new Set(settings.peakWeekdays)
  const lifetimeRoot =
    settings.lifetime.root ?? join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'storages', 'session_projcache', 'sessions')
  const readLifetime = settings.lifetime.enabled ? createLifetimeReader(lifetimeRoot) : undefined

  let clock
  try {
    clock = new Intl.DateTimeFormat('en-GB', {
      timeZone: settings.timeZone,
      weekday: 'short',
      hour: '2-digit',
      hourCycle: 'h23',
    })
  } catch {
    // An unknown zone must not fail activation; local peak hours still price.
    clock = new Intl.DateTimeFormat('en-GB', { weekday: 'short', hour: '2-digit', hourCycle: 'h23' })
  }

  /**
   * Classify one committed event's wall time as `peak` or `idle`, using the
   * provider's own window rather than the machine's local time.
   * @param time - event timestamp in epoch milliseconds.
   * @returns the billing tier that applies to that instant.
   */
  function tierOf(time) {
    if (!Number.isFinite(time)) return 'idle'
    const parts = clock.formatToParts(new Date(time))
    let weekday
    let hour
    for (const part of parts) {
      if (part.type === 'weekday') weekday = part.value
      else if (part.type === 'hour') hour = Number(part.value)
    }
    if (weekday === undefined || !Number.isFinite(hour)) return 'idle'
    if (!peakWeekdays.has(weekday)) return 'idle'
    return peakHours.some(([from, to]) => hour >= from && hour < to) ? 'peak' : 'idle'
  }

  /** The label a per-key row shows for a route. */
  function labelOf(keyId) {
    const label = providers[keyId]?.label
    return typeof label === 'string' && label.length > 0 ? label : keyId
  }

  /**
   * Resolve the price entry for a route model. The fallback model only stands in
   * for a route it actually belongs to: pricing a Gemini model at DeepSeek's
   * rates would be worse than reporting it unpriced.
   */
  function resolvePrices(model, provider) {
    const direct = typeof model === 'string' && Object.prototype.hasOwnProperty.call(models, model) ? models[model] : undefined
    if (direct !== undefined) return { entry: direct, fallback: false }
    const fallback = typeof fallbackModel === 'string' && Object.prototype.hasOwnProperty.call(models, fallbackModel) ? models[fallbackModel] : undefined
    if (fallback === undefined) return undefined
    if (typeof fallback.provider === 'string' && typeof provider === 'string' && fallback.provider !== provider) return undefined
    return { entry: fallback, fallback: true }
  }

  /**
   * Price one usage sample at its own instant, in its own base currency.
   * @param usage - provider-reported token counts for the attempt.
   * @param time - the settlement's timestamp, selecting the clock tier.
   * @param route - the recorded route (`provider`, `model`) before this attempt.
   * @returns the priced sample folded into the session state.
   */
  function sampleUsage(usage, time, route) {
    const tokens = {
      cacheMiss: countOf(usage.inputTokens),
      cacheHit: countOf(usage.cacheReadTokens),
      cacheWrite: countOf(usage.cacheWriteTokens),
      output: countOf(usage.outputTokens),
    }
    const resolved = resolvePrices(route.model, route.provider)
    const keyId = stringOrNull(route.provider) ?? stringOrNull(resolved?.entry.provider) ?? 'unknown'
    const model = stringOrNull(route.model)
    if (resolved === undefined) {
      return {
        keyId,
        model,
        currency: baseCurrency,
        rate: undefined,
        tokens,
        totals: zeroBuckets(),
        tier: null,
        unpricedTokens: totalOfBuckets(tokens),
        fallbackTokens: 0,
      }
    }
    const promptTokens = tokens.cacheMiss + tokens.cacheHit + tokens.cacheWrite
    const entry = longContextEntry(resolved.entry, promptTokens)
    const tier = hasTimeTiers(entry) ? tierOf(time) : null
    const entryCurrency = typeof entry.currency === 'string' ? entry.currency : baseCurrency
    // An unconfigured rate leaves the entry unpriced rather than mis-scaled.
    const conversion = isRate(rates[entryCurrency]) ? rates[entryCurrency] : undefined
    const prices = {
      input: timePrice(entry.input ?? entry.miss, tier ?? 'idle'),
      cacheRead: timePrice(entry.cacheRead ?? entry.hit, tier ?? 'idle'),
      cacheWrite: timePrice(entry.cacheWrite ?? entry.write, tier ?? 'idle'),
      output: timePrice(entry.output, tier ?? 'idle'),
    }
    // A route that bills cache writes at the prompt rate says so by omission.
    if (prices.cacheWrite === undefined) prices.cacheWrite = prices.input
    const costOf = (count, price) => (conversion === undefined || price === undefined ? 0 : (count * price * conversion) / 1_000_000)
    const totals = {
      cacheMiss: costOf(tokens.cacheMiss, prices.input),
      cacheHit: costOf(tokens.cacheHit, prices.cacheRead),
      cacheWrite: costOf(tokens.cacheWrite, prices.cacheWrite),
      output: costOf(tokens.output, prices.output),
    }
    const unpricedTokens =
      (conversion === undefined || prices.input === undefined ? tokens.cacheMiss : 0) +
      (conversion === undefined || prices.cacheRead === undefined ? tokens.cacheHit : 0) +
      (conversion === undefined || prices.cacheWrite === undefined ? tokens.cacheWrite : 0) +
      (conversion === undefined || prices.output === undefined ? tokens.output : 0)
    const pricedTokens = totalOfBuckets(tokens) - unpricedTokens
    return {
      keyId,
      model,
      currency: entryCurrency,
      rate: conversion,
      tokens,
      totals,
      tier,
      unpricedTokens,
      fallbackTokens: resolved.fallback ? pricedTokens : 0,
    }
  }

  /**
   * Advance the fold by one committed event.
   *
   * A repeated settlement for the same turn and step replaces the previous
   * sample instead of adding to it — the same replacement scope `tokenUsage`
   * uses, so the two projections agree on the session's billed attempts. The
   * replacement also moves the sample between per-route totals when the route
   * changed in between, so no key keeps a charge it no longer owns.
   * @param state - current session cost state.
   * @param event - next committed session event.
   * @returns the same state for irrelevant events, an advanced copy otherwise.
   */
  function fold(state, event) {
    if (typeof event.seq === 'number' && event.seq < (state.inheritedFrom ?? 0)) return state
    if (event.type === 'request/context') {
      const provider = stringOrNull(event.data?.provider)
      const model = stringOrNull(event.data?.model)
      if (provider === null && model === null) return state
      if (provider === state.provider && model === state.model) return state
      return { ...state, provider: provider ?? state.provider, model: model ?? state.model }
    }
    if (event.type === 'request/header') {
      const header = event.data?.header?.config
      const provider = stringOrNull(header?.provider)
      const model = stringOrNull(header?.model)
      if (provider === null && model === null) return state
      if (provider === state.provider && model === state.model) return state
      return { ...state, provider: provider ?? state.provider, model: model ?? state.model }
    }
    if (event.type === 'llm/retry-started') {
      const stale = state.last !== null && state.last.turn === event.data?.turn && state.last.step === event.data?.step
      return stale ? { ...state, last: null } : state
    }
    if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') return state
    const usage = usageOf(event)
    if (usage === undefined) return state
    const turn = event.data?.turn
    const step = event.data?.step
    if (typeof turn !== 'number' || typeof step !== 'number') return state

    const sample = sampleUsage(usage, event.time, { provider: state.provider, model: state.model })
    const previous = state.last !== null && state.last.turn === turn && state.last.step === step ? state.last : null
    if (previous !== null && sameSample(previous, sample)) return state

    const baseTokens = previous === null ? state.tokens : subtractBuckets(state.tokens, previous.tokens)
    const baseTotals = previous === null ? state.totals : subtractBuckets(state.totals, previous.totals)
    let keys = state.keys
    if (previous !== null) keys = shiftKey(keys, previous.keyId, previous, -1)
    keys = shiftKey(keys, sample.keyId, sample, 1)

    return {
      provider: state.provider,
      model: state.model,
      sessionId: state.sessionId,
      inheritedFrom: state.inheritedFrom,
      keys,
      tokens: addBuckets(baseTokens, sample.tokens),
      totals: addBuckets(baseTotals, sample.totals),
      unpricedTokens: state.unpricedTokens - (previous?.unpricedTokens ?? 0) + sample.unpricedTokens,
      fallbackTokens: state.fallbackTokens - (previous?.fallbackTokens ?? 0) + sample.fallbackTokens,
      tier: sample.tier,
      last: {
        turn,
        step,
        keyId: sample.keyId,
        model: sample.model,
        currency: sample.currency,
        rate: sample.rate,
        tokens: sample.tokens,
        totals: sample.totals,
        unpricedTokens: sample.unpricedTokens,
        fallbackTokens: sample.fallbackTokens,
        tier: sample.tier,
      },
    }
  }

  // One derived view per state object: the wire payload must keep its identity
  // while the fold state is unchanged, or every unrelated event republishes.
  const views = new WeakMap()

  ctx.sessionProjections.register({
    key: 'sessionCost',
    stateVersion: 4,
    stateSchema: { parse: (value) => value },
    init: (header, inheritedEventCount) => ({
      sessionId: typeof header?.id === 'string' ? header.id : null,
      // A forked child inherits its parent's event prefix, which the parent has
      // already paid for; the child counts only events after that cut.
      inheritedFrom: Number.isFinite(inheritedEventCount) ? inheritedEventCount : 0,
      provider: null,
      model: null,
      keys: {},
      tokens: zeroBuckets(),
      totals: zeroBuckets(),
      unpricedTokens: 0,
      fallbackTokens: 0,
      tier: null,
      last: null,
    }),
    apply: fold,
    wire: {
      viewSchema: { parse: (value) => value },
      view(state) {
        let view = views.get(state)
        if (view === undefined) {
          const lifetime = readLifetime === undefined ? undefined : readLifetime()
          // Delegated sessions are part of the run that asked for them: their
          // tokens and charges join this session's own, so a Gemini call made
          // by a subagent shows up in this session's column and total.
          const delegates = lifetime === undefined ? [] : descendantsOf(lifetime, state.sessionId)
          const mergedKeys = { ...state.keys }
          for (const delegate of delegates) {
            for (const [id, key] of Object.entries(delegate.keys)) {
              const previous =
                mergedKeys[id] ??
                {
                  model: null,
                  currency: null,
                  rate: undefined,
                  tokens: zeroBuckets(),
                  totals: zeroBuckets(),
                  unpricedTokens: 0,
                  fallbackTokens: 0,
                }
              mergedKeys[id] = {
                model: key.model ?? previous.model,
                currency: key.currency ?? previous.currency,
                rate: key.rate ?? previous.rate,
                tokens: addBuckets(previous.tokens, key.tokens ?? zeroBuckets()),
                totals: addBuckets(previous.totals, key.totals ?? zeroBuckets()),
                unpricedTokens: previous.unpricedTokens + (key.unpricedTokens ?? 0),
                fallbackTokens: previous.fallbackTokens + (key.fallbackTokens ?? 0),
              }
            }
          }
          // The session's own figure is the sum of the merged keys, so the
          // header, the key block and the first table column cannot disagree.
          let tokens = zeroBuckets()
          let totals = zeroBuckets()
          let unpricedTokens = 0
          let fallbackTokens = 0
          for (const key of Object.values(mergedKeys)) {
            tokens = addBuckets(tokens, key.tokens)
            totals = addBuckets(totals, key.totals)
            unpricedTokens += key.unpricedTokens
            fallbackTokens += key.fallbackTokens
          }
          const keys = []
          for (const [id, key] of Object.entries(mergedKeys)) {
            if (totalOfBuckets(key.tokens) <= 0) continue
            keys.push({
              id,
              label: labelOf(id),
              model: key.model,
              currency: key.currency,
              rate: key.rate,
              tokens: key.tokens,
              totals: key.totals,
              unpricedTokens: key.unpricedTokens,
              fallbackTokens: key.fallbackTokens,
            })
          }
          // Most expensive key first: the answer to "what did this one cost".
          keys.sort((left, right) => totalCostOf(right.totals) - totalCostOf(left.totals))
          const summary = lifetime === undefined ? undefined : summarizeLifetime(lifetime, Date.now())
          view = {
            language: settings.language,
            baseCurrency,
            currency,
            symbol,
            rate,
            secondary: { ...secondary },
            provider: state.provider,
            model: state.model,
            sessionId: state.sessionId,
            delegates: delegates.length,
            tokens,
            totals,
            unpricedTokens,
            fallbackTokens,
            tier: state.tier,
            keys,
            lifetime:
              summary === undefined
                ? undefined
                : {
                    sessions: lifetime.sessions.length,
                    // The live session opens the table, so the same column set
                    // answers "this run" and "everything else".
                    periods: [
                      { id: 'session', keys },
                      ...summary.periods.map((period) => ({
                        id: period.id,
                        keys: period.keys
                          .map((key) => ({ ...key, label: labelOf(key.id) }))
                          .sort((left, right) => totalCostOf(right.totals) - totalCostOf(left.totals)),
                      })),
                    ],
                  },
          }
          views.set(state, view)
        }
        return view
      },
    },
  })
}
