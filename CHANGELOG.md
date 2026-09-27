## Unreleased

* Removed empty documentation placeholders and the unused sidebar entry.
* Added typed `addIndicator()`, `updateIndicator()`, and `removeIndicator()` methods
  with stable script UUIDs, registered-type validation, and automatic recalculation.
* Added `updateOverlayPoint()` for incremental overlay rows. Auxiliary series retain
  their history arrays and update without rerunning indicators.
* Aligned newly streamed series in index-based charts from one or two matching
  timestamps instead of requiring three points before finding their bar offset.
* Matched worker-generated overlays by their producing indicator and output type,
  preventing stale ownership when indicators are removed or replaced.

* Added typed pane and overlay add, update, and remove methods with UUID targets,
  copied inputs, and the shared candle update queue. Structural updates preserve
  the visible range by default and recalculate indicators.
* Rebuilt rendered panes when the pane list changes, keeping the DOM and layout
  in sync after additions and removals.
* Cleared the worker source dataset when the final source overlay is removed.
* Added local unit and packed-browser coverage for pane and overlay operations,
  stable identities, input validation, and recovery from an empty chart. Pane input
  validation rejects overlay arrays with empty slots.
* Documented the OHLCV source requirement for candle-based indicators when changing
  the main overlay.

* Excluded JavaScript-wrapped candle datasets, the bundled TradingVue dependency,
  and the generated documentation cache from GitHub language statistics.
* Backfilled release notes for 0.5.4 and the live-overlay fixes in 0.6.0.

## 0.6.0 (2026-09-27)

* Added typed `setSeries()` and `updateCandle()` methods for the main candle series,
  with timestamp validation, ordered async updates, and automatic indicator updates.
* Clearing a candle series now clears the worker dataset and calculated indicators.
* Refreshed cursor and legend values when overlay data changes, and applied
  incremental indicator updates when the latest source candle is revised.
* Fixed sparse-data ranges and zero-volume layouts.
* Added local Chromium and Firefox coverage for series replacement, live updates,
  chart cleanup, large datasets, and timeframe changes. Tests load the packed ESM
  and UMD builds in both time-based and index-based modes.
* Repaired a corrupt legend icon that Firefox could not decode.
* Fixed index-based charts remaining blank when the series contains a single candle.
* Updated Vite, Vitest, ws, and transitive dependencies to resolve all 11 root-package
  npm audit findings. Added the dependency lockfile for reproducible local installs.

## 0.5.4 (2026-09-19)

* Generated package declarations from TypeScript sources for ESM and CommonJS
  consumers, and added TypeScript and Svelte checks to the local validation script.
* Minified release bundles while preserving worker parameter names, bundled the
  script worker inline, and propagated failed worker requests to callers.
* Queued worker commands, waited for script uploads before full updates, preserved
  pending script changes and shared indicator series, and corrected revised volume
  in automatic samplers.
* Isolated chart IDs, rejected duplicate IDs, and released chart registries,
  subscriptions, pending work, and overlay resources on destruction.
* Kept grid and crosshair subscriptions independent between panes, shared countdown
  updates, and preserved extracted chart metadata.
* Reduced timestamp lookup memory use, bounded indicator history to the requested
  lookback, and reused static candle drawings during cursor updates.
* Refreshed inferred overlay offsets after data changes and corrected flat, zero,
  and negative price ranges.
* Preserved chart defaults when merging configuration and used the merged toolbar
  offset. Updated RangeTool colors and measurements, LineTool documentation, and
  package license metadata.

## 0.4.0 (2023-10-23)

* Fixed glitches on chart start-up/reset
* Navy static functions, Navy v0.2
* New overlays: AppleArea, RangeTool
* Inline webworker (didn't work in some cases)
* Better control over legend, sidebar & botbar 
* Log-scale improvements 

## 0.3.0 (2022-12-20)

* Script engine (ported & improved)
* 27 Built-in indicators
* Fixed meta.store() algo
* Improved global chart events
* Added new type descriptions
* Mouse & keyboard events   

## 0.2.0 (2022-11-14)

* Index-based mode (display stocks/renko)
* Typescript: initial support
* Wobbly zoom-in bug fix
