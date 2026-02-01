<script>
// The Bottom Bar. Information flow:
// Input: props, layout, (?events)
// Output: canvas, (?events)

// TODO: add support of overlays with
// drawBotbar() function

import { onMount, onDestroy } from 'svelte'
import Events from '../core/events.js'
import Utils from '../stuff/utils.js'
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

onMount(() => { setup() })

function setup() {
    let botbar = layout.botbar;
    [canvas, ctx] = dpr.setup(
        canvasId, botbar.width, botbar.height)

    update()
}

function update($layout = layout) {
    if (!layout.botbar) return // If not exists

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
