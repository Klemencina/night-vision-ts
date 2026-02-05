# Range

Ranging indicator, e.g. RSI

## Data Format

```js
[<timestamp>, <value>]
```

## Range.color
- **Type:** `Color`
- **Default:** `'#ec206e'`

## Range.backColor
- **Type:** `Color`
- **Default:** `'#381e9c16'`

## Range.bandColor
- **Type:** `Color`
- **Default:** `'#535559'`

## Range.lineWidth
- **Type:** `number`
- **Default:** `1`

## Range.upperBand
- **Type:** `number`
- **Default:** `70`

## Range.lowerBand
- **Type:** `number`
- **Default:** `30`

## Range.fixedMin
- **Type:** `number`
- **Default:** `undefined`

Minimum value for the fixed Y-range. When both `fixedMin` and `fixedMax` are set, the overlay's scale will be locked to this range.

## Range.fixedMax
- **Type:** `number`
- **Default:** `undefined`

Maximum value for the fixed Y-range. When both `fixedMin` and `fixedMax` are set, the overlay's scale will be locked to this range.


