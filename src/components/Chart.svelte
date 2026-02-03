<script>
    // Main component combining all grids, scales, etc.
    // Also, main event router, root of 'update' events

    import { onMount } from 'svelte'
    import Cursor from '../core/cursor'
    import DataHub from '../core/dataHub'
    import MetaHub from '../core/metaHub'
    import Scan from '../core/dataScanner'
    import Events from '../core/events'
    import Utils from '../stuff/utils'
    import Layout from '../core/layout'
    import Context from '../stuff/context'
    import Pane from './Pane.svelte'
    import Botbar from './Botbar.svelte'
    import NoDataStub from './NoDataStub.svelte'

    let { props = {} } = $props()

    // Getters
    export function getLayout() {
        return layout
    }
    export function getRange() {
        return range
    }
    export function getCursor() {
        return cursor
    }

    // Setters
    export function setRange(val) {
        let emit = !(val.preventDefault ?? true)
        delete val.preventDefault
        Object.assign(range, val) // keeping the same ref
        onRangeChanged(range, emit)
    }

    export function setCursor(val) {
        let emit = !(val.preventDefault ?? true)
        delete val.preventDefault
        Object.assign(cursor, val)
        onCursorChanged(cursor, emit)
    }

    // Singleton instances
    let hub = DataHub.instance(props.id)
    let meta = MetaHub.instance(props.id)
    let events = Events.instance(props.id)
    let scan = Scan.instance(props.id)

    scan.init(props)

    let interval = $state(scan.detectInterval())
    let timeFrame = $state(scan.getTimeframe())
    let range = $state(scan.defaultRange())
    let cursor = $state(new Cursor(meta))
    let storage = {} // Storage for helper variables
    let ctx = new Context(props) // For measuring text
    let chartRR = $state(0)
    let layout = $state(null)

    let updateRaf = null
    let pendingUpdate = {
        layout: false,
        emit: false,
        updateHash: false
    }

    scan.calcIndexOffsets()

    let chartProps = $derived(Object.assign({ interval, timeFrame, range, ctx, cursor }, props))

    // EVENT INTEFACE
    $effect(() => {
        events.on('chart:cursor-changed', onCursorChanged)
        events.on('chart:cursor-locked', onCursorLocked)
        events.on('chart:range-changed', onRangeChanged)
        events.on('chart:update-layout', update)
        events.on('chart:full-update', fullUpdate)
        return () => {
            // Clean-up event listeners on 'chart' component
            events.off('chart')
        }
    })

    onMount(async () => {
        hub.calcSubset(range)
        hub.detectMain()
        hub.legendCollapsed = !!props.config.LEGEND_COLLAPSED

        if (!hub.chart) {
            const panes = hub.data?.panes
            console.warn(
                '[Chart] No main chart detected. id=%s panes=%s overlays=%s',
                props.id,
                panes?.length ?? 0,
                panes?.map(p => p?.overlays?.length ?? 0)
            )
        }

        // MetaHub must be inited before Layout (Layout reads meta.preSamplers etc.)
        meta.init(props)

        // Set layout immediately so chart shows even if loadScripts hangs/fails
        scan.updatePanesHash()
        layout = new Layout(chartProps, hub, meta)

        try {
            if (props.scriptsReady) await props.scriptsReady
            await hub.loadScripts(true)
            meta.init(props)
            scan.updatePanesHash()
            layout = new Layout(chartProps, hub, meta)
        } catch (e) {
            console.warn('Chart loadScripts failed, showing chart without scripts:', e)
            meta.init(props)
        }
    })

    function onCursorChanged($cursor, emit = true) {
        // Emit a global event (hook)
        if ($cursor.mode) cursor.mode = $cursor.mode
        if (cursor.mode !== 'explore') {
            cursor.xSync(hub, layout, chartProps, $cursor)
            if ($cursor.visible === false) {
                // One more update to hide the cursor
                setTimeout(() => update({ layout: false }))
            }
        }
        if (emit) events.emit('$cursor-update', Utils.makeCursorEvent($cursor, cursor, layout))
        //if (cursor.locked) return // filter double updates (*)
        update({ layout: false }, emit)
    }

    function onCursorLocked(state) {
        if (cursor.scrollLock && state) return
        cursor.locked = state
    }

    // TODO: init cursor when trackpad scrolling
    // is the first input (no mousemove yet)
    function onRangeChanged($range, emit = true) {
        // Emit a global event (hook)
        if (emit) events.emit('$range-update', $range)
        rangeUpdate($range)
        hub.updateRange(range)
        // TODO: Shoud be enabled (*), but it creates cursor lag
        if (cursor.locked) {
            if (layout?.main && cursor.x !== undefined) {
                cursor.ti = layout.main.x2ti(cursor.x)
                if (!layout.indexBased) {
                    cursor.time = interval ? Math.round(cursor.ti / interval) * interval : cursor.ti
                } else {
                    const mainOv = hub.mainOv
                    const off = mainOv?.indexOffset ?? 0
                    const idx = Math.floor(cursor.ti - off) + 1
                    const src = mainOv?.data || mainOv?.dataSubset
                    cursor.time = src?.[idx]?.[0]
                }
            }
            update({}, emit)
            return
        }
        cursor.xValues(hub, layout, chartProps)
        cursor.yValues(layout)
        update({}, emit)
        // Quantize cursor after events stop coming in
        let Q = props.config.QUANTIZE_AFTER
        if (Q) Utils.afterAll(storage, quantizeCursor, Q)
    }

    function quantizeCursor() {
        cursor.xSync(hub, layout, chartProps, cursor)
        update({ layout: false })
    }

    function update(opt = {}, emit = true) {
        if (!opt || typeof opt !== 'object') opt = {}
        let needsLayout = opt.layout !== false || opt.updateHash
        pendingUpdate.layout = pendingUpdate.layout || needsLayout
        pendingUpdate.emit = pendingUpdate.emit || emit
        pendingUpdate.updateHash = pendingUpdate.updateHash || !!opt.updateHash

        if (opt.immediate) {
            if (updateRaf != null) {
                cancelAnimationFrame(updateRaf)
                updateRaf = null
            }
            flushUpdate()
            return
        }

        if (updateRaf == null) {
            updateRaf = requestAnimationFrame(flushUpdate)
        }
    }

    function flushUpdate() {
        updateRaf = null
        let { layout: needsLayout, emit, updateHash } = pendingUpdate
        pendingUpdate = { layout: false, emit: false, updateHash: false }

        // Emit a global event (hook)
        if (emit) events.emit('$chart-pre-update')
        // If we changed UUIDs of but don't want to trigger
        // the full update, we need to set updateHash:true
        if (updateHash) scan.updatePanesHash()

        if (needsLayout) {
            // When only panes/overlays changed (e.g. script-produced overlays),
            // update layout and remake grid without re-running fullUpdate (loadScripts).
            if (scan.panesChanged()) {
                scan.updatePanesHash()
                cursor = cursor
                layout = new Layout(chartProps, hub, meta)
                events.emit('update-pane', layout)
                events.emitSpec('botbar', 'update-bb', layout)
                events.emit('remake-grid')
                if (emit) events.emit('$chart-update')
                return
            }
            cursor = cursor // Trigger Svelte update
            layout = new Layout(chartProps, hub, meta)
            events.emit('update-pane', layout) // Update all panes
            events.emitSpec('botbar', 'update-bb', layout)
            if (emit) events.emit('$chart-update')
            return
        }

        if (!layout) return
        cursor = cursor // Trigger Svelte update
        events.emit('update-pane', layout) // Update all panes
        events.emitSpec('botbar', 'update-bb', layout)
        if (emit) events.emit('$chart-update')
    }

    // Full update when the dataset changed completely
    // or the list of panes/overlays is changed
    // TODO: we can update only panes with
    // overlay changes. But it requires more work
    async function fullUpdate(opt = {}) {
        let prevIbMode = scan.ibMode
        interval = scan.detectInterval()
        timeFrame = scan.getTimeframe()
        let ibc = scan.ibMode !== prevIbMode
        if (!range.length || opt.resetRange || ibc) {
            rangeUpdate(scan.defaultRange())
        }
        scan.calcIndexOffsets()
        hub.calcSubset(range)
        hub.init(hub.data)
        hub.detectMain()
        // TODO: exec only if scripts changed
        await hub.loadScripts(true)
        meta.init(props)
        meta.restore()
        scan.updatePanesHash()
        update({ immediate: true })
        events.emit('remake-grid')
    }

    // Instant range update
    function rangeUpdate($range) {
        range = $range
        chartProps.range = range // Instant update
    }
</script>

{#key chartRR}
    <!-- Full chart re-render -->
    <div class="nvjs-chart">
        {#if layout && layout.main}
            {#each hub.panes() as pane, i}
                <Pane
                    id={i}
                    layout={layout.grids[i]}
                    props={chartProps}
                    main={pane === hub.chart}
                />
            {/each}
            <Botbar props={chartProps} {layout} />
        {:else}
            <NoDataStub {props} />
        {/if}
    </div>
{/key}

<style>
</style>
