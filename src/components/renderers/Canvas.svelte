
<script>

// CanvasJS renderer. Displays layers
// ~ Information flow ~
// Input: props, layout, layers (data+overlay), Input object
// Output: Graphix

import { onMount, onDestroy } from 'svelte'
import Events from '../../core/events.js'
import dpr from '../../stuff/dprCanvas.js'

let { id, props = {}, rr = {}, layout: initialLayout = {} } = $props()

let events = Events.instance(props.id)
let layout = $state(initialLayout)

let rrUpdId = $derived(`rr-${id}-${rr.id}`)
let gridUpdId = $derived(`grid-${id}`)
let rrId = $derived(`${props.id}-rr-${id}-${rr.id}`)
let canvasId = $derived(`${props.id}-canvas-${id}-${rr.id}`)

// TODO: separate renderer, meaning it's not bundled with
// other overlay and can be update separately
// EVENT INTERFACE
$effect(() => {
    events.on(`${rrUpdId}:update-rr`, update)
    events.on(`${rrUpdId}:run-rr-task`, onTask)
    return () => {
        events.off(`${rrUpdId}`)
        if (input) input.destroy()
    }
})

let rrStyle = $derived(`
    left: ${layout.sbMax[0]}px;
    top: ${layout.offset || 0}px;
    position: absolute;
    height: ${layout.height}px;
}`)
let width = $derived(layout.width)
let height = $derived(layout.height)

// Watch for resize
$effect(() => {
    if (width && height) {
        resizeWatch()
    }
})

let canvas = $state(null) // Canvas ref
let ctx = $state(null) // Canvas context
let input = $state(null) // Input attacher to the renderer

onMount(() => { 
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => setup())
})

// Attach an input object
// Remove input listeners on renderer dostroy() event
export function attach($input) {
    input = $input
    if (!canvas) {
        // Canvas not ready, defer attachment
        requestAnimationFrame(() => attach($input))
        return
    }
    input.setup({
        id, canvas, ctx, props, layout, rrUpdId, gridUpdId
    })
}

export function detach() {
    if (input) {
        input.destroy()
        input = null
    }
}

export function getInput() {
    return input
}

function setup() {
    if (!layout.width || !layout.height) return
    let result = dpr.setup(canvasId, layout.width, layout.height)
    if (!result[0]) {
        // Canvas not ready, retry
        requestAnimationFrame(() => setup())
        return
    }
    [canvas, ctx] = result
    //update()
}

function update($layout = layout) {

    layout = $layout

    if (!ctx || !layout) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    //if (this.$p.shaders.length) this.apply_shaders()
    rr.layers.forEach(l => {
        if (!l.display) return
        ctx.save()
        let r = l.overlay
        //if (r.preDraw) r.preDraw(ctx)
        if (l.opacity) ctx.globalAlpha = l.opacity
        try {
            r.draw(ctx)
        } catch(e) {
            console.log(`Layer ${id}.${l.id}`, e)
        }
        ctx.globalAlpha = 1
        //if (r.postDraw) r.postDraw(ctx)
        ctx.restore()
    })

    // TODO: css thing didn't work, coz canvas draws
    // through the border somehow. See Pane.svelte
    if (id > 0) upperBorder()

}

// Perform various tasks
function onTask(event) {
    event.handler(canvas, ctx, input)
}

// Upper grid splitter (line)
function upperBorder() {
    ctx.strokeStyle = props.colors.scale
    ctx.beginPath()
    ctx.moveTo(0, 0.5)
    ctx.lineTo(layout.width, 0.5)
    ctx.stroke()
}

// TODO: potential performance improvement
function resizeWatch() {
    if (!canvas) return
    dpr.resize(canvas, ctx, layout.width, layout.height)
    update()
}

</script>
<style>
.nvjs-canvas-rendrer {}
</style>
<div id={rrId} style={rrStyle}
    class="nvjs-canvas-rendrer">
    <canvas id={canvasId}></canvas>
</div>
