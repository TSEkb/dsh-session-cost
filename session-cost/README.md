---
description: "Estimated session cost beside the composer: per-model pricing for the DeepSeek and Gemini routes, converted to rubles, split by API key."
---

# @local/session-cost

A local DSH bundle in two halves:

- **Host** (`index.js`) registers the `sessionCost` session projection: a replay-derived fold over the
  route recorded by `request/context` / `request/header` and the provider-reported usage carried by
  `assistant/message` / `assistant/attempt`. No model call is made to price anything, so replay and
  resume rebuild the same figure.
- **Client** (`client.js`) renders the pill beside the composer; clicking it opens the breakdown.

## What the panel shows

| Row | Meaning |
|---|---|
| Model | the route model of the latest request |
| Input · cache miss / hit, Cache write, Output | tokens and their charge |
| Total | the session estimate in the display currency |
| By key | one line per API key that billed tokens, most expensive first |
| ≈ $ | the same total in the secondary currency |
| Spending by period | a table of every key against This session, Today, 7 d, 30 d and All |
| Rates | one conversion line per base currency actually used |

A key line only appears once that key has billed tokens, so a DeepSeek-only session shows one line and
a session that switched to a Gemini model shows both.

The **Spending by period** table reads the session projection cache
(`$DSH_HOME/storages/session_projcache/sessions`), so a Gemini key billed in a subagent session is
still visible from a DeepSeek session. Columns are Today (local calendar day), 7 d and 30 d (rolling
back from now) and All. A session is attributed whole to the period its start falls in, because the
cache keeps one total per session rather than per request; a period with no spend shows —. The table
catches up with the next checkpoint of whichever session is active, so a live turn can lag by a few
seconds.

## Prices

`models` maps a model id to a price entry. An entry names its own `currency` and either flat rates or
the clock-split fields:

```yaml
- id: session-cost
  name: "@local/session-cost"
  config:
    rates:            # display units per one unit of the base currency
      CNY: 12.0557
      USD: 80.53
    secondary:
      currency: USD
      symbol: "$"
    language: ru      # panel copy: auto (app locale), en, zh or ru
    providers:        # labels for the per-key rows, by route name
      deepseek-official:
        label: DeepSeek · DEEPSEEK_API_KEY
      google:
        label: Google · GOOGLE_API_KEY
    models:
      deepseek-flash:                       # clock tiers: idle / peak
        currency: CNY
        miss:   { idle: 1, peak: 2 }
        hit:    { idle: 0.02, peak: 0.04 }
        output: { idle: 4, peak: 8 }
      gemini-3.1-pro-preview:               # flat, with a long-context tier
        currency: USD
        input: 2
        output: 12
        cacheRead: 0.2
        cacheWrite: 0
        tiers:
          - { inputTokensAbove: 200000, input: 4, output: 18, cacheRead: 0.4, cacheWrite: 0 }
```

Defaults ship DeepSeek's published CNY list (with its Beijing-time peak window) and Google's Gemini
list in USD, snapshotted from the pi-ai catalog the `dsh-llm-pi-ai` route prices against
(`@earendil-works/pi-ai` → `providers/data/google.json`), so the estimate cannot drift from the
adapter's own idea of the price. Override `models` when a newer catalog lands.

A **delegated session** (a subagent spawned from this session) has its own log, so its cost lands in
its own `sessionCost`. The panel follows the parent link recorded in the parent's subagent catalog and
adds every descendant's tokens and charges to this session's column and total, noting how many were
folded in — a Gemini call made by a subagent therefore counts toward the session that asked for it,
while the period table still counts each session exactly once.

Behaviour worth knowing:

- A model that is in no table is reported **unpriced** rather than billed at another route's rates; the
  fallback model stands in only for its own provider.
- A base currency with no configured rate leaves its tokens unpriced instead of mis-scaled.
- A retried settlement follows `tokenUsage`: `llm/retry-started` closes the replacement slot, so the
  retried attempt adds to the session. Re-settling the same turn/step without a retry replaces.
- The secondary reading is derived from `rates`, not configured twice.

## Tests

```bash
node test/cost.test.mjs    # host fold: pricing, tiers, retries, per-key split, determinism
node test/client.test.mjs  # client panel: labels, amounts, rate lines, empty state
```

Both run on plain Node with no dependencies.

## Applying changes

Profile **configuration** reloads live (the `hmr` entry in the base bundle). Plugin **source** changes
need a restart of the app — `dsh web` — because the base bundle enables HMR with `root: []` (no module
watching). A page reload is not enough for the host half; the client bundle is refetched on reload.
