# MFI

Money Flow Index	

## Data Format

The indicator requires main overlay in the following format:

```js
[<timestamp>, <open>, <high>, <low>, <close>, <volume>]
```

## How to use

Add a new object with type `MFI` to `scripts` array of a selected pane:
```js
// Pane object:
{
    overlays: [], // Non-generated overlays
    scripts: [{
        type: 'MFI',
        props: {}, // Script props
        settings: {} // Script settings
    }]
}
```

::: tip
If you don't see the overlay, try to call `chart.se.uploadAndExec()`. This will upload the data to the script engine and execute all scripts.
:::

## MFI.length
- **Type:** `integer`
- **Default:** `14`

## MFI.upperBand
- **Type:** `number`
- **Default:** `80`

## MFI.lowerBand
- **Type:** `number`
- **Default:** `20`

## MFI.color
- **Type:** `color`
- **Default:** `'#85c427ee'`

## MFI.backColor
- **Type:** `color`
- **Default:** `'#85c42711'`

## MFI.bandColor
- **Type:** `color`
- **Default:** `'#999999'`

## MFI.fixedMin
- **Type:** `number`
- **Default:** `0`

Minimum value for the fixed Y-range. When both `fixedMin` and `fixedMax` are set, the indicator's scale will be locked to this range.

## MFI.fixedMax
- **Type:** `number`
- **Default:** `100`

Maximum value for the fixed Y-range. When both `fixedMin` and `fixedMax` are set, the indicator's scale will be locked to this range.

## MFI.prec
- **Type:** `integer`
- **Default:** `2`

## MFI.zIndex
- **Type:** `integer`
- **Default:** `0`


