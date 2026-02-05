# CMO

Chande Momentum Oscillator

## Data Format

The indicator requires main overlay in the following format:

```js
[<timestamp>, <open>, <high>, <low>, <close>, <volume>]
```

## How to use

Add a new object with type `CMO` to `scripts` array of a selected pane:
```js
// Pane object:
{
    overlays: [], // Non-generated overlays
    scripts: [{
        type: 'CMO',
        props: {}, // Script props
        settings: {} // Script settings
    }]
}
```

::: tip
If you don't see the overlay, try to call `chart.se.uploadAndExec()`. This will upload the data to the script engine and execute all scripts.
:::

## CMO.length
- **Type:** `integer`
- **Default:** `10`

## CMO.color
- **Type:** `color`
- **Default:** `'#559de0'`

## CMO.fixedMin
- **Type:** `number`
- **Default:** `-100`

Minimum value for the fixed Y-range. When both `fixedMin` and `fixedMax` are set, the indicator's scale will be locked to this range.

## CMO.fixedMax
- **Type:** `number`
- **Default:** `100`

Maximum value for the fixed Y-range. When both `fixedMin` and `fixedMax` are set, the indicator's scale will be locked to this range.

## CMO.prec
- **Type:** `integer`
- **Default:** `autoPrec()`

## CMO.zIndex
- **Type:** `integer`
- **Default:** `0`


