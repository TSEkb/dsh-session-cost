window.__ModuleLoader__.load({
  id: '@local/session-cost',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'session-cost'

    const DICT = {
      en: {
        'pill.label': 'Estimated session cost {value}',
        'pill.hint': 'Priced from this session’s token usage',
        'panel.title': 'Session cost',
        'panel.model': 'Model',
        'panel.cacheMiss': 'Input · cache miss',
        'panel.cacheHit': 'Input · cache hit',
        'panel.cacheWrite': 'Cache write',
        'panel.output': 'Output',
        'panel.total': 'Total',
        'panel.keys': 'By key',
        'panel.lifetime': 'Spending by period',
        'panel.period.session': 'This session',
        'panel.period.today': 'Today',
        'panel.period.week': '7 d',
        'panel.period.month': '30 d',
        'panel.period.all': 'All',
        'panel.period.total': 'Total',
        'panel.periodNote': 'The first column is this session; the rest count {count} saved sessions by the period they started in.',
        'panel.tier.peak': 'Priced at peak-hour rates.',
        'panel.tier.idle': 'Priced at off-peak rates.',
        'panel.unpriced': '{count} tokens had no configured price.',
        'panel.fallback': '{count} tokens used the fallback model’s price.',
        'panel.delegates': 'Includes {count} delegated sessions.',
        'panel.rates': 'Rates: {list}.',
        'panel.secondary': '≈ {value} {currency}',
        'panel.note': 'Estimate only: token usage at published per-million prices, not a billing statement.',
        'panel.unknown': '—',
      },
      ru: {
        'pill.label': 'Примерная стоимость сессии {value}',
        'pill.hint': 'Оценка по расходу токенов этой сессии',
        'panel.title': 'Стоимость сессии',
        'panel.model': 'Модель',
        'panel.cacheMiss': 'Вход · мимо кэша',
        'panel.cacheHit': 'Вход · из кэша',
        'panel.cacheWrite': 'Запись кэша',
        'panel.output': 'Выход',
        'panel.total': 'Итого',
        'panel.keys': 'По ключам',
        'panel.lifetime': 'Расход по периодам',
        'panel.period.session': 'Эта сессия',
        'panel.period.today': 'Сегодня',
        'panel.period.week': '7 дней',
        'panel.period.month': '30 дней',
        'panel.period.all': 'Всего',
        'panel.period.total': 'Итого',
        'panel.periodNote': 'Первая колонка — эта сессия; остальные считают {count} сохранённых сессий по периоду их начала.',
        'panel.tier.peak': 'Считано по пиковому тарифу.',
        'panel.tier.idle': 'Считано по ночному тарифу.',
        'panel.unpriced': '{count} токенов без настроенной цены.',
        'panel.fallback': '{count} токенов оценены по цене запасной модели.',
        'panel.delegates': 'Включая делегации: {count}.',
        'panel.rates': 'Курсы: {list}.',
        'panel.secondary': '≈ {value} {currency}',
        'panel.note': 'Только оценка: расход токенов по опубликованным ценам, а не счёт.',
        'panel.unknown': '—',
      },
      zh: {
        'pill.label': '会话预估费用 {value}',
        'pill.hint': '按本会话的 token 用量估算',
        'panel.title': '会话费用',
        'panel.model': '模型',
        'panel.cacheMiss': '输入 · 缓存未命中',
        'panel.cacheHit': '输入 · 缓存命中',
        'panel.cacheWrite': '缓存写入',
        'panel.output': '输出',
        'panel.total': '合计',
        'panel.keys': '按密钥',
        'panel.lifetime': '按时段费用',
        'panel.period.session': '本会话',
        'panel.period.today': '今天',
        'panel.period.week': '7 天',
        'panel.period.month': '30 天',
        'panel.period.all': '全部',
        'panel.period.total': '合计',
        'panel.periodNote': '第一列是本会话；其余按开始时间统计本机 {count} 个已保存会话。',
        'panel.tier.peak': '按高峰时段价格计算。',
        'panel.tier.idle': '按空闲时段价格计算。',
        'panel.unpriced': '{count} 个 token 没有可用价格。',
        'panel.fallback': '{count} 个 token 使用了备用模型的价格。',
        'panel.delegates': '包含 {count} 个委派会话。',
        'panel.rates': '汇率：{list}。',
        'panel.secondary': '≈ {value} {currency}',
        'panel.note': '仅为估算：按公布的每百万 token 单价计算，不是账单。',
        'panel.unknown': '—',
      },
    }

    const CSS = `
.dsc-root{min-width:0;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));display:inline-flex}
.dsc-pill{box-sizing:border-box;border-radius:var(--dsw-radius-sm);max-width:100%;color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;line-height:inherit;white-space:nowrap;background:0 0;border:none;align-items:center;gap:6px;padding:1px 8px;display:inline-flex;cursor:pointer}
.dsc-pill:hover,.dsc-pill[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.dsc-pill:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.dsc-pill svg{flex:none;width:14px;height:14px}
.dsc-panel{box-sizing:border-box;position:fixed;z-index:60;width:360px;padding:12px;border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);border:.5px solid var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-panel);backdrop-filter:var(--dsw-menu-backdrop-filter);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.dsc-head{align-items:baseline;gap:8px;display:flex;justify-content:space-between;margin-bottom:6px}
.dsc-title{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:20px}
.dsc-row{align-items:baseline;gap:8px;padding:2px 0;display:flex}
.dsc-label{min-width:0;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}
.dsc-count{margin-left:auto;color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums;white-space:nowrap}
.dsc-amount{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;white-space:nowrap;flex:none}
.dsc-sep{height:.5px;background:var(--dsw-alias-border-l1);margin:7px 0}
.dsc-section{margin:2px 0 3px;color:var(--dsw-alias-label-caption);font-size:11px;letter-spacing:.02em;text-transform:uppercase}
.dsc-note{margin-top:7px;color:var(--dsw-alias-label-caption);font-size:11px;line-height:15px}
.dsc-total .dsc-amount{font-weight:500}
.dsc-secondary{margin-top:2px;color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums;text-align:right;font-size:11px;line-height:15px}
.dsc-table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
.dsc-table th{padding:0 0 3px 8px;color:var(--dsw-alias-label-caption);font-weight:400;font-size:11px;text-align:right;white-space:nowrap}
.dsc-table th:first-child{padding-left:0;text-align:left}
.dsc-table td{padding:2px 0 2px 8px;color:var(--dsw-alias-label-primary);text-align:right;white-space:nowrap}
.dsc-table td:first-child{padding-left:0;color:var(--dsw-alias-label-tertiary);text-align:left;max-width:96px;overflow:hidden;text-overflow:ellipsis}
.dsc-table tr.dsc-sum td{border-top:.5px solid var(--dsw-alias-border-l1);padding-top:4px;font-weight:500}
`

    const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

    /**
     * Format a currency amount with enough precision to stay meaningful: a
     * whole session's estimate routinely sits below a cent.
     * @param value - amount in the configured currency.
     * @returns the amount without a symbol, no trailing zeros.
     */
    function formatMoney(value) {
      if (!Number.isFinite(value) || value <= 0) return '0'
      const digits = value >= 1 ? 2 : value >= 0.1 ? 3 : value >= 0.01 ? 4 : value >= 0.001 ? 5 : 6
      const fixed = value.toFixed(digits)
      return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed
    }

    /**
     * Format the conversion rate with just enough digits to be checkable.
     * @param value - display-currency units per one base unit.
     * @returns the rate without trailing zeros.
     */
    function formatRate(value) {
      if (!Number.isFinite(value) || value <= 0) return String(value)
      const digits = value >= 100 ? 0 : value >= 1 ? 2 : 4
      const fixed = value.toFixed(digits)
      return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed
    }

    /**
     * Build a translator over one dictionary, for the forced-language case.
     * @param dictionary - the chosen locale's table.
     * @returns a `t(key, values)` function like the locale seat provides.
     */
    function translator(dictionary) {
      return (key, values) => {
        const template = dictionary[key] ?? key
        if (values === undefined) return template
        return template.replace(/\{(\w+)\}/g, (match, name) => (values[name] === undefined ? match : String(values[name])))
      }
    }

    /** Sum one token or charge bucket set. */
    const sumBuckets = (buckets) =>
      buckets.cacheMiss + buckets.cacheHit + buckets.cacheWrite + buckets.output

    function Tokens({ children }) {
      return h('span', { className: 'dsc-count' }, compact.format(children))
    }

    function Row({ label, tokens, amount }) {
      return h(
        'div',
        { className: 'dsc-row' },
        h('span', { className: 'dsc-label' }, label),
        tokens === undefined ? null : h(Tokens, null, tokens),
        h('span', { className: 'dsc-amount' }, amount),
      )
    }

    /**
     * One dock pill: the session's estimated cost, with a click-open breakdown
     * priced from the `sessionCost` projection and split per API key.
     * @param props - session slot props (`useProjection`) plus the bound `t`.
     * @returns the pill, or nothing while the session has no priced usage.
     */
    function SessionCost({ useProjection, t: injectedT }) {
      const cost = useProjection('sessionCost')
      // A forced language keeps this panel readable inside an English shell.
      const t =
        cost !== undefined && cost !== null && typeof cost.language === 'string' && DICT[cost.language] !== undefined
          ? translator(DICT[cost.language])
          : injectedT
      const [open, setOpen] = React.useState(false)
      const [position, setPosition] = React.useState(null)
      const rootRef = React.useRef(null)
      const panelRef = React.useRef(null)

      React.useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
          const target = event.target
          if (rootRef.current !== null && rootRef.current.contains(target)) return
          if (panelRef.current !== null && panelRef.current.contains(target)) return
          setOpen(false)
        }
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        document.addEventListener('keydown', onKeyDown)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true)
          document.removeEventListener('keydown', onKeyDown)
        }
      }, [open])

      if (cost === undefined || cost === null) return null

      const tokens = cost.tokens
      const totals = cost.totals
      if (sumBuckets(tokens) === 0) return null

      const total = sumBuckets(totals)
      const display = cost.symbol + formatMoney(total)
      const keys = Array.isArray(cost.keys) ? cost.keys : []

      function toggle(event) {
        if (open) {
          setOpen(false)
          return
        }
        const rect = event.currentTarget.getBoundingClientRect()
        const width = 360
        setPosition({
          left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
          bottom: Math.max(8, window.innerHeight - rect.top + 8),
        })
        setOpen(true)
      }

      const rows = [
        h(Row, {
          key: 'model',
          label: t('panel.model'),
          amount: cost.model === null || cost.model === undefined ? t('panel.unknown') : cost.model,
        }),
        h('div', { className: 'dsc-sep', key: 'sep-1' }),
        h(Row, {
          key: 'miss',
          label: t('panel.cacheMiss'),
          tokens: tokens.cacheMiss,
          amount: cost.symbol + formatMoney(totals.cacheMiss),
        }),
        h(Row, {
          key: 'hit',
          label: t('panel.cacheHit'),
          tokens: tokens.cacheHit,
          amount: cost.symbol + formatMoney(totals.cacheHit),
        }),
        tokens.cacheWrite > 0
          ? h(Row, {
              key: 'write',
              label: t('panel.cacheWrite'),
              tokens: tokens.cacheWrite,
              amount: cost.symbol + formatMoney(totals.cacheWrite),
            })
          : null,
        h(Row, {
          key: 'output',
          label: t('panel.output'),
          tokens: tokens.output,
          amount: cost.symbol + formatMoney(totals.output),
        }),
        h('div', { className: 'dsc-sep', key: 'sep-2' }),
        h(
          'div',
          { className: 'dsc-row dsc-total', key: 'total' },
          h('span', { className: 'dsc-label' }, t('panel.total')),
          h('span', { className: 'dsc-amount' }, display),
        ),
      ]

      // Per-key split: one line per API key that actually billed tokens, so a
      // Gemini key's spend is readable next to DeepSeek's.
      if (keys.length > 0) {
        rows.push(h('div', { className: 'dsc-sep', key: 'sep-keys' }))
        rows.push(h('div', { className: 'dsc-section', key: 'keys-title' }, t('panel.keys')))
        for (const key of keys) {
          const label = typeof key.label === 'string' && key.label.length > 0 ? key.label : key.id
          rows.push(
            h(Row, {
              key: 'key-' + key.id,
              label,
              amount: cost.symbol + formatMoney(sumBuckets(key.totals)),
            }),
          )
        }
      }

      // Per-period totals: what each API key has cost today, over rolling
      // weeks and months, and in total, so a Gemini key billed in a subagent
      // session is visible from a DeepSeek-only session too.
      const lifetime = cost.lifetime
      const periods = lifetime !== undefined && lifetime !== null && Array.isArray(lifetime.periods) ? lifetime.periods : []
      if (periods.length > 0) {
        const shortLabel = (key) => {
          const label = typeof key.label === 'string' && key.label.length > 0 ? key.label : key.id
          const head = label.split(' · ')[0]
          return head.length > 0 ? head : label
        }
        const ids = []
        for (const period of periods) {
          for (const key of period.keys ?? []) {
            if (!ids.includes(key.id)) ids.push(key.id)
          }
        }
        const amountOf = (period, id) => {
          const found = (period.keys ?? []).find((key) => key.id === id)
          return found === undefined ? 0 : sumBuckets(found.totals)
        }
        const cells = []
        for (const id of ids) {
          const sample = periods
            .flatMap((period) => period.keys ?? [])
            .find((key) => key.id === id)
          cells.push({ id, label: sample === undefined ? id : shortLabel(sample) })
        }
        rows.push(h('div', { className: 'dsc-sep', key: 'sep-lifetime' }))
        rows.push(h('div', { className: 'dsc-section', key: 'lifetime-title' }, t('panel.lifetime')))
        rows.push(
          h(
            'table',
            { className: 'dsc-table', key: 'lifetime-table' },
            h(
              'thead',
              null,
              h(
                'tr',
                null,
                h('th', null, ''),
                periods.map((period) => h('th', { key: period.id }, t('panel.period.' + period.id))),
              ),
            ),
            h(
              'tbody',
              null,
              cells.map((cell) =>
                h(
                  'tr',
                  { key: cell.id },
                  h('td', { title: cell.label }, cell.label),
                  periods.map((period) => {
                    const amount = amountOf(period, cell.id)
                    return h('td', { key: period.id }, amount > 0 ? cost.symbol + formatMoney(amount) : '—')
                  }),
                ),
              ),
              h(
                'tr',
                { className: 'dsc-sum', key: 'sum' },
                h('td', null, t('panel.period.total')),
                periods.map((period) => {
                  const amount = (period.keys ?? []).reduce((acc, key) => acc + sumBuckets(key.totals), 0)
                  return h('td', { key: period.id }, amount > 0 ? cost.symbol + formatMoney(amount) : '—')
                }),
              ),
            ),
          ),
        )
        rows.push(
          h(
            'div',
            { className: 'dsc-note', key: 'lifetime-note' },
            t('panel.periodNote', { count: lifetime.sessions }),
          ),
        )
      }

      const secondary = cost.secondary
      if (secondary !== undefined && secondary !== null && typeof secondary.rate === 'number' && secondary.rate > 0) {
        const converted = total * secondary.rate
        rows.push(
          h(
            'div',
            { className: 'dsc-secondary', key: 'secondary' },
            t('panel.secondary', { value: secondary.symbol + formatMoney(converted), currency: secondary.currency }),
          ),
        )
      }

      if (cost.tier === 'peak' || cost.tier === 'idle') {
        rows.push(h('div', { className: 'dsc-note', key: 'tier' }, t('panel.tier.' + cost.tier)))
      }
      if (cost.unpricedTokens > 0) {
        rows.push(
          h('div', { className: 'dsc-note', key: 'unpriced' }, t('panel.unpriced', { count: compact.format(cost.unpricedTokens) })),
        )
      }
      if (cost.fallbackTokens > 0) {
        rows.push(
          h('div', { className: 'dsc-note', key: 'fallback' }, t('panel.fallback', { count: compact.format(cost.fallbackTokens) })),
        )
      }

      if (typeof cost.delegates === 'number' && cost.delegates > 0) {
        rows.push(h('div', { className: 'dsc-note', key: 'delegates' }, t('panel.delegates', { count: cost.delegates })))
      }

      // One rate line per base currency actually used, instead of one global
      // conversion: DeepSeek quotes CNY, Gemini quotes USD.
      const currencies = []
      for (const key of keys) {
        if (typeof key.currency !== 'string' || typeof key.rate !== 'number' || key.rate <= 0) continue
        if (key.currency === cost.currency) continue
        if (currencies.some((entry) => entry.currency === key.currency)) continue
        currencies.push({ currency: key.currency, rate: key.rate })
      }
      if (currencies.length > 0) {
        const list = currencies.map((entry) => '1 ' + entry.currency + ' = ' + formatRate(entry.rate) + ' ' + cost.symbol).join(' · ')
        rows.push(h('div', { className: 'dsc-note', key: 'rates' }, t('panel.rates', { list })))
      }

      rows.push(h('div', { className: 'dsc-note', key: 'note' }, t('panel.note')))

      return h(
        React.Fragment,
        null,
        h('style', { key: 'style' }, CSS),
        h(
          'span',
          { className: 'dsc-root', ref: rootRef, key: 'root' },
          h(
            'button',
            {
              type: 'button',
              className: 'dsc-pill',
              'aria-haspopup': 'dialog',
              'aria-expanded': open,
              'aria-label': t('pill.label', { value: display }),
              title: t('pill.hint'),
              onClick: toggle,
            },
            h(
              'svg',
              { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true },
              h('circle', { cx: 8, cy: 8, r: 6.4, fill: 'none', stroke: 'currentColor', strokeWidth: 1.2 }),
              h('path', {
                d: 'M5.6 5.1 8 8.1l2.4-3M8 8.1v3.2M6.1 9.2h3.8',
                fill: 'none',
                stroke: 'currentColor',
                strokeWidth: 1.2,
                strokeLinecap: 'round',
              }),
            ),
            h('span', null, display),
          ),
          open && position !== null
            ? h(
                'div',
                {
                  className: 'dsc-panel',
                  ref: panelRef,
                  role: 'dialog',
                  'aria-label': t('panel.title'),
                  style: { left: position.left + 'px', bottom: position.bottom + 'px' },
                  key: 'panel',
                },
                h(
                  'div',
                  { className: 'dsc-head' },
                  h('span', { className: 'dsc-title' }, t('panel.title')),
                  h('span', { className: 'dsc-amount' }, display),
                ),
                rows,
              )
            : null,
        ),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT), 'session-cost: dictionaries')
        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            {
              name: 'conversation.composer.dock',
              id: 'session-cost',
              order: 2,
              locale: NS,
            },
            SessionCost,
          ),
        )
      },
    }
  },
})
