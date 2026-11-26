
# Cursor <img src="/el.png" style="display: inline-block; margin: 0; width: 32px;" />

**Cursor** keeps current XY-position of the crosshair, time, current scale values and the selected values of overlays (you can see them in the legend).

```js
let chart = new NightVision()
console.log(chart.cursor)  
```  

```js
// Example of a cursor object
{
    visible: true,
    gridId: 0,
    values: [
        [
            [
                1663434000000,
                4.9385
            ]
        ]
    ],
    x: 473.5,
    y: 213,
    scales: {
        A: 5.067736096938775
    },
    time: 1663434000000
}
```

## Sync crosshairs by timestamp

The `$cursor-update` event includes `timestampMs`, the selected main series row's timestamp in milliseconds. The event supplies `null` when the cursor is hidden or its position is outside the source series. On a time-based source, a position between candles uses the nearest visible row. TypeScript infers the `CursorUpdateEvent` type for this subscription.

Call `setCrosshairAtTime(timestampMs)` on the receiving chart to draw a vertical guide through its panes. This preserves the receiving chart's local cursor, price readout, lock, and viewport. The method does not emit `$cursor-update`, so the same wiring works in both directions.

```ts
// exchangeA and exchangeB are existing NightVision instances.
exchangeA.events.on('sync:$cursor-update', ({ timestampMs }) => {
    exchangeB.setCrosshairAtTime(timestampMs)
})
exchangeB.events.on('sync:$cursor-update', ({ timestampMs }) => {
    exchangeA.setCrosshairAtTime(timestampMs)
})
```

Index-based charts snap to the nearest timestamp in their own main series. An exact match uses that candle's local index. Midpoint ties go to the earlier timestamp, and duplicate timestamps use the first row. Time-based charts position the guide at the supplied timestamp on the time axis.

The guide is hidden when the receiving series is empty, the timestamp is outside its first and last timestamps, or the resolved position is outside the viewport. The chart keeps the requested time and resolves it again as the viewport or data changes. Pass `null` to clear the request and its guide. Forwarding the event's `null` clears the peer on pointer leave.

To disconnect the charts, call `events.off('sync', '$cursor-update')` and `setCrosshairAtTime(null)` on each chart.

## cursor.getValue(paneId, ovId)

- **Type:** `function`
- **Arguments**
    - `paneId`: `number` Pane id
    - `ovId`: `number` Overlay id
- **Returns** `Array` Data element `[<time>, <value1>, ...]`

Returns a specific data value by **Pane id** and **Overlay id**. This is a short-cut for accessing `values`. You can also access them directly:

```js
let value = chart.cursor.values[paneId][overlayId]
```
