
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
Use the existing `chart.data` API for other overlay types or structural changes.

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

## Completion and errors

Both methods can be called immediately after construction. Calls run in order on
each chart and wait for chart initialization and worker calculations. Their promises
resolve after the data and indicator updates; the browser may paint on the next
animation frame. You do not need to call `chart.update()` or `chart.se.updateData()`.

Malformed rows reject with `TypeError`. Invalid price bounds, negative volume, and
invalid timestamp ordering reject with `RangeError`. Rejected input does not prevent
the next valid call from running. Calls on an unmounted or destroyed chart reject
with `AbortError`.

Await these methods before changing `chart.data`, indicator definitions, or other
properties that rebuild the chart. Those existing operations do not use the candle
update queue. Worker failures reject the promise; they do not roll back data already
assigned to the chart. After resolving a worker failure, call `setSeries()` to
recalculate the series.
