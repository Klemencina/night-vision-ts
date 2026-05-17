
# Chart Config

Various constants. You can overwrite this values by providing `config` object in the props:

```js
import { NightVision } from 'night-vision-ts'

let chart = new NightVision('<root>', {
    config: {
        MAX_ZOOM: 10000,
        // ...
    }
})
```

## config.SBMIN

- **Type:** `number`
- **Default:** `60`

Minimal sidebar, px


## config.SBMAX

- **Type:** `number`
- **Default:** `Infinity`

Max sidebar, px


## config.EXPAND

- **Type:** `number`
- **Default:** `0.15`

Expand y-range, %/100 of range


## config.CANDLEW

- **Type:** `number`
- **Default:** `0.7`

Candle width, %/100 of step


## config.GRIDX

- **Type:** `number`
- **Default:** `100`

Grid x-step target, px


## config.GRIDY

- **Type:** `number`
- **Default:** `47`

Grid y-step target, px


## config.BOTBAR

- **Type:** `number`
- **Default:** `28`

Bottom bar height, px


## config.PANHEIGHT

- **Type:** `number`
- **Default:** `22`

Scale panel height, px


## config.DEFAULT_LEN

- **Type:** `number`
- **Default:** `50`

Starting range, candles


## config.MINIMUM_LEN

- **Type:** `number`
- **Default:** `5`

Minimal starting range, candles


## config.MIN_ZOOM

- **Type:** `number`
- **Default:** `5`

Minimal zoom, candles


## config.MAX_ZOOM

- **Type:** `number`
- **Default:** `5000`

Maximal zoom, candles,


## config.VOLSCALE

- **Type:** `number`
- **Default:** `0.15`

Volume bars height, %/100 of layout.height


## config.ZOOM_MODE

- **Type:** `string`
- **Default:** `'tv'`

Zoom mode, 'tv' or 'tl'


## config.QUANTIZE_AFTER

- **Type:** `number`
- **Default:** `0`

Quantize cursor after, ms


## config.AUTO_PRE_SAMPLE

- **Type:** `number`
- **Default:** `10`

Sample size for auto-precision


## config.LEGEND_COLLAPSED

- **Type:** `boolean`
- **Default:** `false`

Collapse indicator legend lines by default


## config.TOOLBAR

- **Type:** `number`
- **Default:** `57`

Toolbar width, px


## config.TB_ICON

- **Type:** `number`
- **Default:** `25`

Toolbar icon size, px


## config.TB_ITEM_M

- **Type:** `number`
- **Default:** `6`

Toolbar item margin, px


## config.TB_ICON_BRI

- **Type:** `number`
- **Default:** `1`

Toolbar icon brightness


## config.TB_ICON_HOLD

- **Type:** `number`
- **Default:** `420`

Wait to expand, ms


## config.TB_BORDER

- **Type:** `number`
- **Default:** `1`

Toolbar border, px


## config.TB_B_STYLE

- **Type:** `string`
- **Default:** `'dotted'`

Toolbar border style


## config.TOOL_COLL

- **Type:** `number`
- **Default:** `7`

Tool collision threshold


## config.PIN_RADIUS

- **Type:** `number`
- **Default:** `5.5`

Tool pin radius


## config.UX_OPACITY

- **Type:** `number`
- **Default:** `0.9`

Ux background opacity


## config.SCROLL_WHEEL

- **Type:** `string`
- **Default:** `'prevent'`

Scroll wheel mode: `'prevent'`, `'pass'`, or `'click'`


## config.L_BTN_SIZE

- **Type:** `number`
- **Default:** `21`

Legend button size, px


## config.L_BTN_MARGIN

- **Type:** `string`
- **Default:** `'-6px 0 -6px 0'`

CSS margin for legend buttons


## config.CANDLE_TIME

- **Type:** `boolean`
- **Default:** `true`

Show remaining candle time


## config.FONT

- **Type:** `string`
- **Default:** _(see source)_

Font string for chart text elements
