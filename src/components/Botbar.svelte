<script>
// The Bottom Bar. Information flow:
// Input: props, layout, (?events)
// Output: canvas, (?events)

// TODO: add support of overlays with
// drawBotbar() function

import { onMount, onDestroy } from 'svelte'
import Events from '../core/events'
import DataHub from '../core/dataHub'
import dpr from '../stuff/dprCanvas'
import Utils from '../stuff/utils'
import bb from '../core/primitives/botbar'

let { props = {}, layout = {} } = $props()

let bbUpdId = `botbar`
let bbId = $derived(`${props.id}-botbar`)
let canvasId = $derived(`${props.id}-botbar-canvas`)

let events = Events.instance(props.id)

let showPanel = $state(true)

// EVENT INTERFACE
$effect(() => {
    events.on(`${bbUpdId}:update-bb`, update)
    events.on(`${bbUpdId}:show-bb-panel`, f => showPanel = f)
    return () => {
        events.off(`${bbUpdId}`)
    }
})

let bbStyle = $derived(`
    background: ${props.colors.back};
    width: ${(layout.botbar || {}).width}px;
    height: ${(layout.botbar || {}).height}px;
`)

let canvas = $state(null) // Canvas ref
let ctx = $state(null) // Canvas context
let mc = $state(null) // Hammer manager for time-scale zoom
let dragState = $state(null) // { x } for horizontal pan
let rafPending = $state(null) // requestAnimationFrame id for throttled range-changed

let width = $derived((layout.botbar || {}).width)

// Watch for resize
$effect(() => {
    if (width) {
        resizeWatch()
    }
})

onMount(() => {
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => setup())
})
onDestroy(() => {
    if (rafPending != null) cancelAnimationFrame(rafPending)
    if (mc) mc.destroy()
})

function setup() {
    let botbar = layout.botbar
    if (!botbar) return
    let result = dpr.setup(canvasId, botbar.width, botbar.height)
    if (!result[0]) {
        // Canvas not ready, retry
        requestAnimationFrame(() => setup())
        return
    }
    [canvas, ctx] = result
    update()
    setupTimeScaleZoom()
}

// Time-scale zoom: vertical drag on botbar (same idea as price scale on sidebar)
async function setupTimeScaleZoom() {
    let hub = DataHub.instance(props.id)
    if (!canvas || !layout.botbar || !layout.main || !hub.mainOv) return
    const Hammer = await import('hammerjs')
    mc = new Hammer.Manager(canvas)
    mc.add(new Hammer.Pan({ direction: Hammer.DIRECTION_HORIZONTAL, threshold: 0 }))
    mc.add(new Hammer.Tap({ event: 'doubletap', taps: 2, posThreshold: 50 }))

    mc.on('panstart', (event) => {
        if (!props.range?.length) return
        dragState = {
            x: event.center.x
        }
    })

    function flushRangeChange() {
        rafPending = null
        events.emit('range-changed', props.range)
        update()
    }

    mc.on('panmove', (event) => {
        if (!dragState || !props.range?.length) return
        let hub = DataHub.instance(props.id)
        let data = hub.mainOv?.data
        if (!data || data.length < 2) return
        let mainLayout = layout.main
        if (!mainLayout?.ti) return
        let interval = props.interval || 1000
        let cfg = props.config || {}
        let minZoom = (cfg.MIN_ZOOM ?? 5) * (Utils.isMobile ? 0.5 : 1)
        let maxZoom = cfg.MAX_ZOOM ?? 5000
        let width = layout.botbar.width
        if (!width) return

        let dx = event.center.x - dragState.x
        dragState.x = event.center.x
        // TradingView-style: anchor on right edge (latest visible time), expand/shrink to the left
        // Inverted: drag right = zoom OUT (longer range), drag left = zoom IN (shorter range)
        let span = props.range[1] - props.range[0]
        let k = 1 + (dx / width) * 2
        let newSpan = span * k
        let minSpan = interval * minZoom
        let maxSpan = interval * maxZoom
        newSpan = Utils.clamp(newSpan, minSpan, maxSpan)

        let anchor = props.range[1]
        let r0 = anchor - newSpan
        let l = data.length - 1
        let tMin = mainLayout.ti(data[l][0], l) - interval * 5.5
        props.range[0] = Utils.clamp(r0, -Infinity, tMin)

        // Throttle: emit at most once per frame to avoid layout thrashing
        if (rafPending == null) {
            rafPending = requestAnimationFrame(flushRangeChange)
        }
    })

    mc.on('panend', () => {
        if (rafPending != null) {
            cancelAnimationFrame(rafPending)
            flushRangeChange()
        }
        dragState = null
    })

    mc.on('doubletap', () => {
        let hub = DataHub.instance(props.id)
        if (!props.range?.length || !hub.mainOv?.data?.length) return
        let cfg = props.config || {}
        let defaultLen = cfg.DEFAULT_LEN ?? 50
        let interval = props.interval || 1000
        let span = interval * defaultLen
        // Anchor right edge, reset zoom to default span
        props.range[0] = props.range[1] - span
        events.emit('range-changed', props.range)
        update()
    })
}

function update() {
    if (!layout.botbar || !ctx) return // If not exists or canvas not ready

    bb.body(props, layout, ctx)

    // applyShaders()

    if (props.cursor.x && props.cursor.ti !== undefined && showPanel) {
        bb.panel(props, layout, ctx)
    }
}

function resizeWatch() {
    let botbar = layout.botbar
    if (!canvas || !botbar) return
    dpr.resize(canvas, ctx, botbar.width, botbar.height)
    update()
}

/*function applyShaders() {
    let props = {
        layout: layout,
        cursor: props.cursor
    }
    for (var s of props.bb_shaders) {
        ctx.save()
        s.draw(ctx, props)
        ctx.restore()
    }
}*/

</script>
<style>
.nvjs-botbar {
    cursor: ew-resize;
}
</style>
<div class="nvjs-botbar" id={bbId} style={bbStyle}>
    <canvas id={canvasId}></canvas>
</div>
