<script>
// The Bottom Bar. Information flow:
// Input: props, layout, (?events)
// Output: canvas, (?events)

// TODO: add support of overlays with
// drawBotbar() function

import { onMount } from 'svelte'
import Events from '../core/events.js'
import dpr from '../stuff/dprCanvas.js'
import bb from '../core/primitives/botbar.js'

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

function setup() {
    let botbar = layout.botbar;
    if (!botbar) return
    let result = dpr.setup(canvasId, botbar.width, botbar.height)
    if (!result[0]) {
        // Canvas not ready, retry
        requestAnimationFrame(() => setup())
        return
    }
    [canvas, ctx] = result
    update()
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
.nvjs-botbar {}
</style>
<div class="nvjs-botbar" id={bbId} style={bbStyle}>
    <canvas id={canvasId}></canvas>
</div>
