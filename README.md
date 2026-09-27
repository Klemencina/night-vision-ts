

![PepeNV](https://github.com/Klemencina/night-vision-ts/blob/main/docs/docs/public/nv-banner.jpeg?raw=true)

<div align="center">

![npm](https://img.shields.io/npm/v/night-vision-ts.svg?color=brightgreen&label=version) ![license](https://img.shields.io/badge/license-MIT-blue.svg) ![build](https://img.shields.io/badge/build-passing-brightgreen.svg)

</div>

# <center> Night Vision Charts™ </center>

**NightVision** is a highly customizable charting library, created for professional traders. It is a continuation of [TradingVueJS](https://github.com/tvjsx/trading-vue-js) project, borrowing its core ideas, but applying better design decisions and improving performance. Built with Svelte.   

Upstream: this repository is a maintained TypeScript fork of [project-nv/night-vision](https://github.com/project-nv/night-vision), which is currently unmaintained.

Start your charting journey with our interactive [**[DOCS]**](https://nightvision.dev/guide/intro/night-vision-charts.html).

![Screen](https://raw.githubusercontent.com/Klemencina/night-vision-ts/main/docs/docs/public/screen.png)

## Installation

```sh
npm i night-vision-ts
```

Charts run in the browser. In server-rendered apps, initialize them on the client.
The CommonJS bundle also requires `window` when imported, so load it on the client.

## CDN

ESM import:

```js
import { NightVision } from "https://unpkg.com/night-vision-ts@latest/dist/night-vision.js"
```

Script tag (global `window.NightVision`):

```html
<script src="https://unpkg.com/night-vision-ts@latest"></script>
<script>
  const { NightVision } = window.NightVision
  const chart = new NightVision('<root-element-id>')
</script>
```

## Usage

```js

import { NightVision } from 'night-vision-ts'

let chart = new NightVision('<root-element-id>')

// Generate some random data
function data() {
    return Array(30).fill(1).map((x, i) => [
        new Date(`${i+1} Nov 2022 GMT+0000`).getTime(),
        i * Math.random()
    ])
}

// Set the dataset
chart.data = {
    panes: [{
        overlays: [{
            name: 'APE Stock',
            type: 'Spline',
            data: data(),
            settings: {
                precision: 2
            }
        }]
    }]
}
```

## Data API

Replace the main candle series or apply a live candle update:

```js
await chart.setSeries(candles, { resetRange: true })
await chart.updateCandle([timestamp, open, high, low, close, volume])
```

An equal timestamp replaces the latest candle; a newer timestamp appends one.
Both methods update indicators and redraw automatically. See the
[Data API guide](docs/docs/guide/api/data-api.md) for validation and range behavior.

Manage panes and overlays without editing `chart.data`:

```js
const paneId = await chart.addPane({ settings: { height: 1 } })
const overlayId = await chart.addOverlay(paneId, {
    type: 'Spline', name: 'Reference', data: referenceRows
})
await chart.updateOverlay(paneId, overlayId, { props: { color: '#38bdf8' } })
await chart.updatePane(paneId, { settings: { height: 2 } })
await chart.removeOverlay(paneId, overlayId)
await chart.removePane(paneId)
```

The returned UUIDs remain stable when positions change. These methods share the
candle update queue and preserve the visible range by default.

Add indicators and stream other overlay series through the same queue:

```js
const smaId = await chart.addIndicator(0, { type: 'SMA', props: { length: 20 } })
await chart.updateIndicator(0, smaId, { props: { length: 50 } })
await chart.removeIndicator(0, smaId)

const lineId = await chart.addOverlay(0, { type: 'Spline', data: [] })
await chart.updateOverlayPoint(0, lineId, [timestamp, value])
```

Point updates replace the latest row at an equal timestamp or append a newer row.
Updates to auxiliary series do not rerun indicators.

## Local tests

Run all checks on your machine:

```sh
npm ci
npm run test:local
```

This runs lint, TypeScript and Svelte checks, unit tests, the production build,
and browser tests. To run only the build and browser tests:

```sh
npm run test:browser
```

The browser tests use headless Chromium at `/usr/bin/chromium` when available.
Set `CHROMIUM_PATH` to use another executable, or run `npx playwright install chromium`
to install Playwright's browser when system Chromium is unavailable.

To run the same checks in Firefox:

```sh
npx playwright install firefox
NIGHT_VISION_BROWSER=firefox npm run test:browser
```

`NIGHT_VISION_BROWSER=webkit` selects Playwright's WebKit build, which requires
its browser download and system libraries.

Tests load an `npm pack` tarball through a temporary localhost server. They check
ESM and script-tag builds in time-based and index-based modes, including candle
pixels, worker-calculated SMA values, live updates, resizing, and chart destruction
and recreation. Temporary package files, the server, and the browser are cleaned
up when the run ends. No GitHub Actions setup is required.

## Roadmap

- ~~Add stocks support (Index-Based mode)~~
- ~~Improve the layout: x/y axis calculation~~
- ~~Expand the built-in overlay collection~~
- ~~Add keyboard & mouse events~~
- ~~Port the script system from TVJS~~
- ~~Create a built-in indicator collection~~
- ~~Add tool overlays (LineTool, RangeTool)~~
- NavyJS tutorial
- ~~Extend the Data API to pane and overlay operations~~
- *Toolbar* ???
- Mobile support


<div align="center">

Happy charting!

<img src="https://raw.githubusercontent.com/Klemencina/night-vision-ts/main/docs/docs/public/wink.gif" alt="wink" width="64"/>

</div>
