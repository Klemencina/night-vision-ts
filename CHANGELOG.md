
## 0.6.0 (2026-09-27)

* Added typed `setSeries()` and `updateCandle()` methods for the main candle series,
  with timestamp validation, ordered async updates, and automatic indicator updates.
* Clearing a candle series now clears the worker dataset and calculated indicators.
* Added local Chromium and Firefox coverage for series replacement, live updates,
  chart cleanup, large datasets, and timeframe changes.
* Repaired a corrupt legend icon that Firefox could not decode.
* Fixed index-based charts remaining blank when the series contains a single candle.
* Updated Vite, Vitest, ws, and transitive dependencies to resolve all 11 root-package
  npm audit findings. Added the dependency lockfile for reproducible local installs.

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
