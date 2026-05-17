
# DataHub API

The API of [DataHub](/guide/main-comp/data-hub.html)

## dataHub.data

- **Type:** `Data`
- **Related:** [Data Structure](/guide/data-struct/the-top-level)

Full data object.

## dataHub.indexBased

- **Type:** `boolean`

Index-based mode flag.

## dataHub.chart

- **Type:** `Pane`
- **Related:** [Pane Object](/guide/data-struct/pane-object)

A pane that contains the main overlay.

## dataHub.offchart

- **Type:** `Pane []`
- **Related:** [Pane Object](/guide/data-struct/pane-object)

An array of non-main panes.

## dataHub.mainOv

- **Type:** `Overlay`
- **Related:** [Overlay Object](/guide/data-struct/overlay-object)

The main overlay object.

## dataHub.mainPaneId

- **Type:** `number`
- **Related:** [Overlay Object](/guide/data-struct/overlay-object)

Id of the main pane.

## dataHub.legendCollapsed

- **Type:** `boolean`

Legend collapsed state.

## dataHub.panes()

- **Type:** `function`
- **Returns** `Pane []`
- **Related:** [Pane Object](/guide/data-struct/pane-object)

Returns all active panes of the chart.

## dataHub.overlay(paneId, ovId)

- **Type:** `function`
- **Arguments**
    - `paneId`: `number` Pane id
    - `ovId`: `number` Overlay id
- **Returns** `Overlay`
- **Related:** [Overlay Object](/guide/data-struct/overlay-object)

Returns an overlay by specific Pane id and Overlay id.

## dataHub.ovData(paneId, ovId)

- **Type:** `function`
- **Arguments**
    - `paneId`: `number` Pane id
    - `ovId`: `number` Overlay id
- **Returns** `Array`
- **Related:** [Overlay Object](/guide/data-struct/overlay-object)

Return the data of a specific overlay.

## dataHub.ovDataExt(paneId, ovId)

- **Type:** `function`
- **Arguments**
    - `paneId`: `number` Pane id
    - `ovId`: `number` Overlay id
- **Returns** `Record<string, any> | undefined`
- **Related:** [Overlay Object](/guide/data-struct/overlay-object)

Return the extra data of a specific overlay.

## dataHub.ovDataSubset(paneId, ovId)

- **Type:** `function`
- **Arguments**
    - `paneId`: `number` Pane id
    - `ovId`: `number` Overlay id
- **Returns** `Array | undefined`
- **Related:** [Overlay Object](/guide/data-struct/overlay-object)

Return the visible data subset of a specific overlay.

## dataHub.allOverlays(type?)

- **Type:** `function`
- **Arguments**
    - `type?`: `string` Optional overlay type filter
- **Returns** `Overlay []`
- **Related:** [Overlay Object](/guide/data-struct/overlay-object)

Return all overlays (from all panes). Optionally filtered by type.

## dataHub.loadScripts(exec?)

- **Type:** `async function`
- **Arguments**
    - `exec?`: `boolean` Execute scripts after loading
- **Returns** `Promise<void>`

Load and optionally execute indicator scripts.

## dataHub.filter(data, range, offset?)

- **Type:** `function`
- **Arguments**
    - `data`: `any[]` The time-series data
    - `range`: `[number, number]` Time/index range [start, end]
    - `offset?`: `number` Index offset
- **Returns** `DataView`

Create a DataView subset for a timeseries.
