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
        'panel.tier.peak': 'Priced at peak-hour rates.',
        'panel.tier.idle': 'Priced at off-peak rates.',
        'panel.unpriced': '{count} tokens had no configured price.',
        'panel.fallback': '{count} tokens used the fallback model’s price.',
        'panel.converted': 'Converted from {from} at 1 {from} = {rate} {symbol}.',
        'panel.secondary': '≈ {value} {currency}',
        'panel.note': 'Estimate only: token usage at published per-million prices, not a billing statement.',
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
        'panel.tier.peak': '按高峰时段价格计算。',
        'panel.tier.idle': '按空闲时段价格计算。',
        'panel.unpriced': '{count} 个 token 没有可用价格。',
        'panel.fallback': '{count} 个 token 使用了备用模型的价格。',
        'panel.converted': '按 1 {from} = {rate} {symbol} 换算。',
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
.dsc-panel{box-sizing:border-box;position:fixed;z-index:60;width:280px;padding:12px;border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);border:.5px solid var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-panel);backdrop-filter:var(--dsw-menu-backdrop-filter);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.dsc-head{align-items:baseline;gap:8px;display:flex;justify-content:space-between;margin-bottom:6px}
.dsc-title{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:20px}
.dsc-row{align-items:baseline;gap:8px;padding:2px 0;display:flex}
.dsc-label{min-width:0;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}
.dsc-count{margin-left:auto;color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums;white-space:nowrap}
.dsc-amount{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;white-space:nowrap;flex:none}
.dsc-sep{height:.5px;background:var(--dsw-alias-border-l1);margin:7px 0}
.dsc-note{margin-top:7px;color:var(--dsw-alias-label-caption);font-size:11px;line-height:15px}
.dsc-total .dsc-amount{font-weight:500}
.dsc-secondary{margin-top:2px;color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums;text-align:right;font-size:11px;line-height:15px}
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
     * priced from the `sessionCost` projection.
     * @param props - session slot props (`useProjection`) plus the bound `t`.
     * @returns the pill, or nothing while the session has no priced usage.
     */
    function SessionCost({ useProjection, t }) {
      const cost = useProjection('sessionCost')
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
      if (tokens.cacheMiss + tokens.cacheHit + tokens.cacheWrite + tokens.output === 0) return null

      const total = totals.cacheMiss + totals.cacheHit + totals.cacheWrite + totals.output
      const display = cost.symbol + formatMoney(total)

      function toggle(event) {
        if (open) {
          setOpen(false)
          return
        }
        const rect = event.currentTarget.getBoundingClientRect()
        const width = 280
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

      const secondary = cost.secondary
      if (secondary !== undefined && secondary !== null && typeof secondary.rate === 'number' && cost.rate > 0) {
        const converted = total * (secondary.rate / cost.rate)
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
      if (typeof cost.rate === 'number' && cost.rate !== 1 && typeof cost.baseCurrency === 'string') {
        rows.push(
          h(
            'div',
            { className: 'dsc-note', key: 'converted' },
            t('panel.converted', { from: cost.baseCurrency, rate: formatRate(cost.rate), symbol: cost.symbol }),
          ),
        )
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
