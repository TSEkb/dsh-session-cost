/**
 * Session cost bundle — Host half.
 *
 * Registers the `sessionCost` session projection: a replay-derived fold over
 * the route the log recorded (`request/context`, then `request/header`) and the
 * provider-reported usage carried by `assistant/message` / `assistant/attempt`.
 * Prices come from the row config, defaulting to DeepSeek's published
 * per-million rates including its peak / off-peak split in Beijing time.
 *
 * The fold is deterministic: it reads only committed events, so replay and
 * resume rebuild the same figure, and no model call is made to price anything.
 * The Client half renders it beside the composer.
 */

export const inject = ['sessionProjections']

/** Published DeepSeek API rates, currency units per million tokens. */
const DEFAULT_MODELS = {
  'deepseek-flash': {
    miss: { idle: 1, peak: 2 },
    hit: { idle: 0.02, peak: 0.04 },
    output: { idle: 4, peak: 8 },
  },
  'deepseek-v4-pro': {
    miss: { idle: 4.5, peak: 9 },
    hit: { idle: 0.15, peak: 0.3 },
    output: { idle: 13.5, peak: 27 },
  },
}

const DEFAULTS = {
  // The table above is the provider's published list, quoted in CNY.
  baseCurrency: 'CNY',
  // What the pill reports. `rate` is display-currency units per one base unit,
  // so the default converts the published CNY list at the Central Bank rate.
  currency: 'RUB',
  symbol: '₽',
  rate: 12.0557,
  // A second reading in another currency, shown beside the primary total in
  // the opened panel. Its `rate` is also units per one base unit.
  secondary: { currency: 'USD', symbol: '$', rate: 0.1497 },
  timeZone: 'Asia/Shanghai',
  peakWeekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  peakHours: [[9, 12], [14, 18]],
  fallbackModel: 'deepseek-flash',
  models: DEFAULT_MODELS,
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
  return {
    baseCurrency: typeof raw.baseCurrency === 'string' ? raw.baseCurrency : DEFAULTS.baseCurrency,
    currency: typeof raw.currency === 'string' ? raw.currency : DEFAULTS.currency,
    symbol: typeof raw.symbol === 'string' ? raw.symbol : DEFAULTS.symbol,
    rate: typeof raw.rate === 'number' && Number.isFinite(raw.rate) && raw.rate > 0 ? raw.rate : DEFAULTS.rate,
    secondary: {
      currency: typeof raw.secondary?.currency === 'string' ? raw.secondary.currency : DEFAULTS.secondary.currency,
      symbol: typeof raw.secondary?.symbol === 'string' ? raw.secondary.symbol : DEFAULTS.secondary.symbol,
      rate:
        typeof raw.secondary?.rate === 'number' && Number.isFinite(raw.secondary.rate) && raw.secondary.rate > 0
          ? raw.secondary.rate
          : DEFAULTS.secondary.rate,
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

const costOf = (tokens, price, rate) => (price === undefined ? 0 : (tokens * price * rate) / 1_000_000)

/** One tier's price, falling back to the other tier when only one is configured. */
const tierPrice = (field, tier) => {
  if (typeof field === 'number' && Number.isFinite(field)) return field
  if (field === null || typeof field !== 'object') return undefined
  const preferred = field[tier]
  if (typeof preferred === 'number' && Number.isFinite(preferred)) return preferred
  const other = field[tier === 'peak' ? 'idle' : 'peak']
  return typeof other === 'number' && Number.isFinite(other) ? other : undefined
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
  left.tier === right.tier &&
  left.unpricedTokens === right.unpricedTokens &&
  left.fallbackTokens === right.fallbackTokens &&
  sameBuckets(left.tokens, right.tokens) &&
  sameBuckets(left.totals, right.totals)

/**
 * Mount the `sessionCost` projection for this deployment's price table.
 * @param ctx - plugin context carrying the session projection registry.
 * @param config - validated row config from {@link normalizeConfig}.
 */
export function apply(ctx, config) {
  const settings = config ?? normalizeConfig(undefined)
  const { baseCurrency, currency, symbol, rate, secondary, fallbackModel, peakHours } = settings
  const models = settings.models
  const peakWeekdays = new Set(settings.peakWeekdays)

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

  /** Resolve the price entry for a route model, falling back when it is unknown. */
  function resolvePrices(model) {
    const direct = typeof model === 'string' && Object.prototype.hasOwnProperty.call(models, model) ? models[model] : undefined
    if (direct !== undefined) return { entry: direct, fallback: false }
    const fallback = typeof fallbackModel === 'string' && Object.prototype.hasOwnProperty.call(models, fallbackModel) ? models[fallbackModel] : undefined
    return fallback === undefined ? undefined : { entry: fallback, fallback: true }
  }

  /**
   * Price one usage sample at its own instant.
   * @param usage - provider-reported token counts for the attempt.
   * @param time - the settlement's timestamp, selecting the tier.
   * @param model - the route model recorded before this attempt.
   * @returns the priced sample folded into the session state.
   */
  function sampleUsage(usage, time, model) {
    const tokens = {
      cacheMiss: countOf(usage.inputTokens),
      cacheHit: countOf(usage.cacheReadTokens),
      cacheWrite: countOf(usage.cacheWriteTokens),
      output: countOf(usage.outputTokens),
    }
    const tier = tierOf(time)
    const resolved = resolvePrices(model)
    if (resolved === undefined) {
      return { tokens, totals: zeroBuckets(), tier, unpricedTokens: totalOfBuckets(tokens), fallbackTokens: 0 }
    }
    const missPrice = tierPrice(resolved.entry.miss, tier)
    const hitPrice = tierPrice(resolved.entry.hit, tier)
    const writePrice = tierPrice(resolved.entry.write, tier) ?? missPrice
    const outputPrice = tierPrice(resolved.entry.output, tier)
    const totals = {
      cacheMiss: costOf(tokens.cacheMiss, missPrice, rate),
      cacheHit: costOf(tokens.cacheHit, hitPrice, rate),
      cacheWrite: costOf(tokens.cacheWrite, writePrice, rate),
      output: costOf(tokens.output, outputPrice, rate),
    }
    const unpricedTokens =
      (missPrice === undefined ? tokens.cacheMiss : 0) +
      (hitPrice === undefined ? tokens.cacheHit : 0) +
      (writePrice === undefined ? tokens.cacheWrite : 0) +
      (outputPrice === undefined ? tokens.output : 0)
    const pricedTokens = totalOfBuckets(tokens) - unpricedTokens
    return {
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
   * uses, so the two projections agree on the session's billed attempts.
   * @param state - current session cost state.
   * @param event - next committed session event.
   * @returns the same state for irrelevant events, an advanced copy otherwise.
   */
  function fold(state, event) {
    // A fork child inherits its parent's event prefix. Those events are already
    // billed to the parent, so this session's own cost starts after the cut.
    if (typeof event.seq === 'number' && event.seq < state.inheritedFrom) return state
    if (event.type === 'request/context') {
      const model = typeof event.data?.model === 'string' && event.data.model.length > 0 ? event.data.model : null
      return model === null || model === state.model ? state : { ...state, model }
    }
    if (event.type === 'request/header') {
      const model = event.data?.header?.config?.model
      return typeof model !== 'string' || model.length === 0 || model === state.model ? state : { ...state, model }
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

    const sample = sampleUsage(usage, event.time, state.model)
    const previous = state.last !== null && state.last.turn === turn && state.last.step === step ? state.last : null
    if (previous !== null && sameSample(previous, sample)) return state

    const baseTokens = previous === null ? state.tokens : subtractBuckets(state.tokens, previous.tokens)
    const baseTotals = previous === null ? state.totals : subtractBuckets(state.totals, previous.totals)

    return {
      model: state.model,
      tokens: addBuckets(baseTokens, sample.tokens),
      totals: addBuckets(baseTotals, sample.totals),
      unpricedTokens: state.unpricedTokens - (previous?.unpricedTokens ?? 0) + sample.unpricedTokens,
      fallbackTokens: state.fallbackTokens - (previous?.fallbackTokens ?? 0) + sample.fallbackTokens,
      tier: sample.tier,
      inheritedFrom: state.inheritedFrom,
      last: {
        turn,
        step,
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
    stateVersion: 2,
    stateSchema: { parse: (value) => value },
    init: (_header, inheritedEventCount) => ({
      model: null,
      tokens: zeroBuckets(),
      totals: zeroBuckets(),
      unpricedTokens: 0,
      fallbackTokens: 0,
      tier: null,
      last: null,
      inheritedFrom: Number.isFinite(inheritedEventCount) ? inheritedEventCount : 0,
    }),
    apply: fold,
    wire: {
      viewSchema: { parse: (value) => value },
      view(state) {
        let view = views.get(state)
        if (view === undefined) {
          view = {
            baseCurrency,
            currency,
            symbol,
            rate,
            secondary: { ...secondary },
            model: state.model,
            tokens: state.tokens,
            totals: state.totals,
            unpricedTokens: state.unpricedTokens,
            fallbackTokens: state.fallbackTokens,
            tier: state.tier,
          }
          views.set(state, view)
        }
        return view
      },
    },
  })
}
