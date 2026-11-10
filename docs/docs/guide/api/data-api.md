
# Data API

Use `setSeries()` and `updateCandle()` to manage the main candle series. Both methods
update indicators and schedule a redraw automatically.

```ts
import { NightVision, type Candle } from 'night-vision-ts'

const chart = new NightVision('chart')
const candles: Candle[] = [
    [1704067200000, 100, 105, 98, 103, 1200],
    [1704067260000, 103, 108, 101, 106, 1500]
]

await chart.setSeries(candles)

// Same timestamp replaces the latest candle.
await chart.updateCandle([1704067260000, 103, 109, 101, 108, 1600])

// A newer timestamp appends a candle.
await chart.updateCandle([1704067320000, 108, 112, 107, 110, 900])
```

## Candle format

`Candle` is a readonly tuple of `[timestamp, open, high, low, close]`, with an optional
sixth value for volume. Timestamps are Unix milliseconds, including in index-based
charts. All supplied values must be finite numbers. High and low must contain both
open and close. Volume cannot be negative.

These methods work with a main `Candles` or `CandlesPlus` overlay. If the chart has
no overlays, the first call creates a main `Candles` overlay. Existing panes,
indicator definitions, overlay settings, and chart configuration stay in place.
Use the pane and overlay methods below for other overlay types and structural changes.

## chart.setSeries(rows, options?)

```ts
setSeries(rows: readonly Candle[], options?: SetSeriesOptions): Promise<void>
```

Replaces the main candle data and recalculates indicators over the entire series.
Rows must have strictly increasing timestamps. Duplicate or out-of-order timestamps
reject the request before any data changes. The method copies the array and each
row when called, so later changes to the supplied arrays do not affect the chart.

`resetRange` defaults to `true`, which selects the default visible range for the new
data. Set it to `false` to preserve the current range:

```ts
await chart.setSeries(candles, { resetRange: false })
```

Preserving the range can leave replacement data offscreen if its timestamps do not
overlap the current view. In index-based mode, the preserved range refers to bar
indices. If the chart has no range yet, it calculates a default range once enough
data is available.

Pass `[]` to clear the candle series and its calculated indicators. Indicator
definitions remain available when you supply new candles.

## chart.updateCandle(row)

```ts
updateCandle(row: Candle): Promise<void>
```

Compares the timestamp with the latest candle:

- An equal timestamp replaces the complete latest row.
- A newer timestamp appends the row.
- An older timestamp rejects with `RangeError`. Use `setSeries()` to correct history.

The method copies the row when called. It updates indicators incrementally after
the series has enough data to establish its timeframe. An empty series accepts its
first candle, then establishes the timeframe when the second arrives. To display
a single time-based candle immediately, configure the main overlay's
`settings.timeFrame`.

Updates preserve the current view. Call `chart.scroll()` after an update if you want
the existing follow-latest behavior.

## Batched updates

Use `chart.batch()` to apply related edits with one refresh. Its callback receives a
scoped editor with synchronous versions of the candle, pane, overlay, and indicator
methods. Newly added objects return their UUID immediately, so later edits in the
same batch can refer to them.

```ts
const paneId = await chart.batch(batch => {
    batch.updateCandle(firstCandle)
    batch.updateCandle(secondCandle)
    const paneId = batch.addPane({ settings: { height: 1 } })
    batch.addIndicator(paneId, { type: 'RSI', props: { length: 14 } })
    return paneId
})
```

The callback's return value becomes the result of `batch()`. You can also return a
Promise, but use the scoped editor for edits inside the callback. Awaiting an edit
on the enclosing `chart` would wait behind the batch itself. Fetch external data
before opening a batch when possible.

Edits stay in a private draft until the callback succeeds. Invalid input or a thrown
callback discards the draft. Arrays are copied only when an edit changes their rows;
unchanged series retain their arrays. Once the draft is applied, worker failures
reject the batch and leave the edited data available for inspection or retry.

Candle or structural edits cause one full indicator recalculation. Presentation and
auxiliary-point edits refresh once without running indicators. Empty batches do not
refresh. Batches share the normal data queue, so other API edits run before or after
the entire batch. The scoped editor cannot be used after its callback finishes.

The visible range is preserved by default, including index shifts for prepended
history. Pass `{ resetRange: true }` as the second argument to reset it. Scoped
methods do not accept per-edit range options. Market-data replacement through
`chart.data` during an asynchronous callback cancels the batch.

`ChartBatch` is exported as a TypeScript type.

## Saved chart state

`exportState()` returns a detached JSON-compatible object after preceding queued
edits finish. `importState()` validates and copies a state when called, then restores
it through the data queue.

```ts
const state = await chart.exportState()
localStorage.setItem('chart-layout', JSON.stringify(state))

const saved = localStorage.getItem('chart-layout')
if (saved) await chart.importState(JSON.parse(saved))
```

Version `1` includes pane order and settings, authored overlay definitions,
indicator definitions and properties, persistent drawing data in `overlay.dataExt`,
manual price-scale ranges, the visible range, and time-based or index-based mode.
It also includes color overrides, chart configuration, timezone, logo visibility,
and the collapsed-legend setting. Pane, overlay, and indicator UUIDs remain stable.
Indicator-generated overlays are recalculated when the state is restored.
Shared source arrays, such as candles and volume, retain their relationship through
UUID references in the saved format.

Market data is omitted by default. On import, overlays retain current data with the
same UUID. A saved main overlay without a matching UUID can reuse the destination
chart's main series. Other unmatched overlays start empty. This lets a layout be
restored without replacing candles that arrived after it was saved.

To restore into an empty chart with its data, include authored overlay rows:

```ts
const snapshot = await chart.exportState({ includeData: true })
await otherChart.importState(JSON.parse(JSON.stringify(snapshot)))
```

Explicitly included rows replace the corresponding series, including an empty
array. Retained data must fit the saved overlay type. Without included rows or a
matching destination series, supply candles with `setSeries()` after import.
Stored ranges use timestamps in time-based mode and bar indices in index-based
mode. Apply a data-free layout to data with matching timestamps or bar positions
when you want drawings and ranges to retain their meaning.

Register custom overlay and indicator scripts on the destination chart before
importing their state. State files contain definitions and properties, while script
code and callbacks stay with the application. Container IDs, dimensions, resize
observers, event subscriptions, and history loader callbacks stay with the destination
chart. Transient tool state is saved only if its overlay writes it to `dataExt`.

Unknown versions, duplicate UUIDs, invalid rows or ranges, and unavailable overlay
or indicator types reject before the current chart changes. UUIDs and scale IDs
cannot contain colons. State properties must contain JSON values; functions,
cycles, non-finite numbers, and non-plain objects reject instead of being silently
lost. Undefined object fields are omitted and undefined array entries become null,
matching JSON serialization.

Both methods wait for chart readiness and reject after destruction. Import aborts
pending history requests and recreates the view using the saved settings. Existing
history loaders remain registered; update their callback when changing symbols.

The package exports `ChartState`, `ChartStateOptions`, `SavedPane`, `SavedOverlay`,
`SavedIndicator`, and `SavedScale` types.

## History loading

### chart.prependSeries(rows)

```ts
prependSeries(rows: readonly Candle[]): Promise<number>
```

Adds candles older than the first loaded candle and returns the number added.
Input validation and copying follow `setSeries()`. Input timestamps must be strictly
increasing. Rows at or after the first loaded timestamp are ignored, so overlapping
pages keep the existing candles. Use `setSeries()` to correct history and
`updateCandle()` to append newer candles.

```ts
const added = await chart.prependSeries(olderCandles)
```

The method preserves the visible candles. Time-based ranges stay unchanged;
index-based ranges shift by the number of added rows. It keeps the source array
identity, including arrays shared with volume overlays, and recalculates indicators
over the extended history. Empty or overlap-only input returns `0` without a redraw.
On an empty chart, the method creates a main Candles overlay and selects an initial
range. It uses the same queue as live candles, panes, and indicators.

### chart.setHistoryLoader(loader, options?)

Registers a callback for loading older pages and returns a disconnect function.
The chart checks the initial visible range and loads when its left edge is within
`threshold` bars of the oldest candle. `threshold` defaults to `20` and must be a
finite nonnegative number. Programmatic range changes also trigger checks.

```ts
const disconnect = chart.setHistoryLoader(async ({ before, signal }) => {
    const query = new URLSearchParams({ limit: '500' })
    if (before !== null) query.set('before', String(before))
    const response = await fetch(`/api/candles?${query}`, { signal })
    if (!response.ok) throw new Error(`History request failed: ${response.status}`)
    // The endpoint returns { rows: Candle[], hasMore?: boolean }.
    return await response.json()
}, { threshold: 30 })

// Fetch a page explicitly, including retry after a failed request.
const added = await chart.loadHistory()

// Abort pending work and remove the automatic range subscription.
disconnect()
```

`before` is an exclusive Unix timestamp in milliseconds in both chart modes. It is
`null` for an empty chart, so the callback can supply the initial page. Fetches run
outside the mutation queue, allowing live candle updates while a page is pending.
Results pass through `prependSeries()` validation and the mutation queue.

Only one request runs per loader. Repeated range changes and `loadHistory()` calls
share it. After a successful page, the chart checks whether it needs another page
to fill the history margin. Loading stops when `hasMore` is `false` or a page adds
no older candles. Calling `loadHistory()` then returns `0`.

Disconnecting, replacing the loader, replacing the series, or destroying the chart
aborts pending requests. Late results cannot overwrite the replacement data, even
if the callback ignores its abort signal. Cancelled requests resolve to `0`.
`setSeries()` and assignment to `chart.data` reset history exhaustion. When changing
symbols, register the loader for the new symbol as well. Disconnect functions only
affect the loader that returned them.

Failures emit `$history-error`. An explicit `loadHistory()` call also rejects with
the error. The chart does not automatically retry a failed request until another
range change; call `loadHistory()` to retry immediately.

| Event | Payload |
| --- | --- |
| `$history-loading` | `{ before }` |
| `$history-loaded` | `{ before, added, hasMore }` |
| `$history-error` | `{ before, error }` |

Subscribe through `chart.events.on('app:$history-error', handler)` and remove the
subscription with `chart.events.off('app', '$history-error')`. Without a registered
loader, `loadHistory()` returns `0`. Both history methods reject after destruction.
The package exports `HistoryLoader`, `HistoryRequest`, `HistoryPage`, and
`HistoryLoadingOptions` types.

## Panes and overlays

These methods add, update, and remove panes and user-supplied overlays. Each method
waits for the full chart update and indicator recalculation. They preserve the
visible range by default; pass `{ resetRange: true }` as the final argument to
select the default range instead.

```ts
const paneId = await chart.addPane({ settings: { height: 1 } })
const overlayId = await chart.addOverlay(paneId, {
    type: 'Spline',
    name: 'Price reference',
    data: [[1704067200000, 103], [1704067260000, 106]],
    props: { color: '#f59e0b', lineWidth: 2 }
})

await chart.updatePane(paneId, { settings: { height: 2 } })
await chart.updateOverlay(paneId, overlayId, {
    name: 'Updated reference',
    data: [[1704067200000, 104], [1704067260000, 107]],
    props: { color: '#38bdf8' }
})
await chart.removeOverlay(paneId, overlayId)
await chart.removePane(paneId)
```

| Method | Result | Behavior |
| --- | --- | --- |
| `addPane(input?, options?)` | `Promise<string>` | Appends a pane and returns its UUID. Input accepts `settings` and an `overlays` array. |
| `updatePane(pane, patch, options?)` | `Promise<void>` | Shallow-merges `patch.settings`. Keeps the pane's overlays and scripts. |
| `removePane(pane, options?)` | `Promise<void>` | Removes the pane, its overlays, and its indicator scripts. |
| `addOverlay(pane, input, options?)` | `Promise<string>` | Appends an overlay and returns its UUID. `type` is required. |
| `updateOverlay(pane, overlay, patch, options?)` | `Promise<void>` | Replaces supplied fields and shallow-merges `settings` and `props`. |
| `removeOverlay(pane, overlay, options?)` | `Promise<void>` | Removes the overlay and keeps its pane. |

Targets use `DataTarget`: a UUID string or a zero-based numeric position. Existing
panes and overlays expose UUIDs through `chart.data` and `chart.hub`. Prefer UUIDs
when removing items because positions change. Numeric positions are resolved when
the queued operation runs. Names are display labels, not identifiers. Missing
targets reject with `RangeError`.

`OverlayInput` accepts `type`, `name`, `main`, `data`, `settings`, and `props`.
`OverlayPatch` accepts any subset of those fields. Internal fields such as `id`,
`uuid`, `dataSubset`, and `prod` are rejected. Pane settings and overlay settings
and props must be plain objects. Supplied objects and rows are copied when the
method is called, including nested values, using `structuredClone`. Functions and
other values that cannot be cloned reject with `DataCloneError`.

Overlay rows use `OverlayRow`, a readonly tuple starting with a finite Unix
millisecond timestamp. Timestamps must increase strictly. The remaining values
may include numbers, strings, arrays, objects, or null, as required by the overlay.
`Candles` and `CandlesPlus` data must also pass the candle validation rules above.
Updating `data` replaces the entire series; use `updateCandle()` for incremental
main candle updates or `updateOverlayPoint()` for a user-supplied overlay. A settings or props patch merges one level, so supplying a
nested object replaces that whole nested value.

Setting `main: true` selects that overlay as the chart's source and clears the flag
on other overlays. Removing the main overlay promotes the first remaining
user-supplied overlay. If none remain, the chart clears its derived overlays and
worker source data. Removing the final pane is supported; `addPane()` or
`setSeries()` can populate the chart again. The first overlay also becomes main
when none is flagged, including after setting `main: false` on the only main.

Indicators read the main overlay's raw rows as OHLCV data. Promoting a two-column
`Spline` works for chart rendering, but indicators that read candle fields, such as
SMA's default close source, can return `NaN`. Keep a candle-shaped main source when
using those indicators, or remove incompatible indicator definitions before
switching to a different row format. Selecting a candle source again recalculates
the indicators.

Worker-produced overlays cannot be updated or removed through the overlay methods.
Use the indicator methods below to manage their definitions and generated output.

The package exports `DataTarget`, `DataUpdateOptions`, `OverlayInput`,
`OverlayPatch`, `OverlayRow`, `PaneInput`, and `PanePatch` for TypeScript consumers.

## Streaming overlay points

```ts
updateOverlayPoint(pane: DataTarget, overlay: DataTarget, row: OverlayRow): Promise<void>
```

Updates a single row in a user-supplied overlay. An equal timestamp replaces the
latest row; a newer timestamp appends one. An older timestamp rejects with
`RangeError`. Use `updateOverlay()` with `data` to replace historical values.

```ts
const openInterest = await chart.addOverlay(0, {
    type: 'Spline', name: 'Open interest', data: [], settings: { scale: 'B' }
})
await chart.updateOverlayPoint(0, openInterest, [1704067200000, 12000])
await chart.updateOverlayPoint(0, openInterest, [1704067200000, 12050])
await chart.updateOverlayPoint(0, openInterest, [1704067260000, 12100])
```

The method copies the row and nested values when called. It keeps the existing
history array, refreshes visible subsets and redraws, and preserves the visible
range. Auxiliary overlays do not rerun the indicator worker. Updating the main
overlay updates the worker too; an initially empty main series rebuilds its
interval and range as data arrives. The OHLCV source requirement described above
still applies to candle-based indicators. `Candles` and `CandlesPlus` points use
the same price and volume validation as `updateCandle()`.

Script-produced overlays reject direct point updates. Send their source candles
through `updateCandle()` or change their indicator definition instead.

## Indicators

Use a registered built-in or custom indicator type. Register custom Navy source
through the existing `scripts` constructor option or property before adding an
instance. Unknown indicator types reject with `RangeError` before changing data.

```ts
const smaId = await chart.addIndicator(0, {
    type: 'SMA', props: { length: 20, color: '#f59e0b' }
})
await chart.updateIndicator(0, smaId, { props: { length: 50 } })

const rsiPane = await chart.addPane({ settings: { height: 1 } })
const rsiId = await chart.addIndicator(rsiPane, {
    type: 'RSI', props: { length: 14 }
})
await chart.removeIndicator(rsiPane, rsiId)
await chart.removePane(rsiPane)
await chart.removeIndicator(0, smaId)
```

| Method | Result | Behavior |
| --- | --- | --- |
| `addIndicator(pane, input, options?)` | `Promise<string>` | Adds a script instance and returns its stable UUID. `type` is required. |
| `updateIndicator(pane, indicator, patch, options?)` | `Promise<void>` | Replaces supplied `type` and `name`; shallow-merges `props` and `settings`. Keeps the script UUID. |
| `removeIndicator(pane, indicator, options?)` | `Promise<void>` | Removes the definition and its generated overlays from every pane. Keeps the panes and other indicators. |

The indicator target is its script UUID or its position in the pane's `scripts`
array. It is not an overlay UUID. One indicator can produce multiple overlays;
those overlays' UUIDs can change during recalculation. Their `prod` field points
to the owning script UUID.

`IndicatorInput` accepts `type`, `name`, `props`, and `settings`; `IndicatorPatch`
accepts a subset. Inputs are copied with `structuredClone` when called. `name`
is script metadata; the indicator code determines its output legend labels.
Property meanings and valid parameter ranges are defined by each indicator.
These methods validate the definition structure and registered type, not each
indicator's parameter rules.

Indicator operations run a full indicator recalculation and resolve when the
worker finishes. They preserve the visible range by default; pass
`{ resetRange: true }` as the final argument to select the default range. An
indicator added before candle data exists remains registered and calculates when
a source series arrives. `IndicatorInput` and `IndicatorPatch` are exported types.

## Completion and errors

All data methods can be called immediately after construction. Calls run in order on
each chart and wait for chart initialization and worker calculations. Their promises
resolve after the data and indicator updates; the browser may paint on the next
animation frame. You do not need to call `chart.update()` or `chart.se.updateData()`.

Malformed rows reject with `TypeError`. Invalid price bounds, negative volume, and
invalid timestamp ordering reject with `RangeError`. Rejected input does not prevent
the next valid call from running. Calls on an unmounted or destroyed chart reject
with `AbortError`.

Await these methods before directly changing `chart.data`, indicator definitions, or other
properties that rebuild the chart. Those existing operations do not use the data
update queue. Worker failures reject the promise; they do not roll back data already
assigned to the chart. After resolving a worker failure, repeat the appropriate update to recalculate
the chart. A failed operation may already have added or removed its target, so
inspect `chart.data` before retrying an add or remove.
