<script>
    // CanvasJS renderer. Displays layers
    // ~ Information flow ~
    // Input: props, layout, layers (data+overlay), Input object
    // Output: Graphix

    import { onMount, onDestroy, untrack } from 'svelte'
    import Events from '../../core/events'
    import dpr from '../../stuff/dprCanvas'

    let { id, props = {}, rr = {}, layout: initialLayout = {} } = $props()

    let chartId = untrack(() => props.id)
    let events = Events.instance(chartId)
    let layout = $state(untrack(() => initialLayout))
    let disposed = false
    let setupFrame = null
    let attachFrame = null

    let rrUpdId = $derived(`rr-${id}-${rr.id}`)
    let gridUpdId = $derived(`grid-${id}`)
    let rrId = $derived(`${props.id}-rr-${id}-${rr.id}`)
    let canvasId = $derived(`${props.id}-canvas-${id}-${rr.id}`)

    // TODO: separate renderer, meaning it's not bundled with
    // other overlay and can be update separately
    // EVENT INTERFACE
    $effect(() => {
        const subscriptionId = rrUpdId
        events.on(`${subscriptionId}:update-rr`, update)
        events.on(`${subscriptionId}:run-rr-task`, onTask)
        return () => {
            events.off(subscriptionId)
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
        scheduleSetup()
    })

    onDestroy(() => {
        disposed = true
        if (setupFrame !== null) cancelAnimationFrame(setupFrame)
        setupFrame = null
        detach()
    })

    function scheduleSetup() {
        if (disposed || setupFrame !== null) return
        setupFrame = requestAnimationFrame(() => {
            setupFrame = null
            if (!disposed) setup()
        })
    }

    // Attach an input object
    // Remove input listeners on renderer dostroy() event
    export function attach($input) {
        if (disposed) {
            $input.destroy()
            return
        }
        if (input !== $input) detach()
        input = $input
        if (!canvas) {
            if (attachFrame !== null) return
            attachFrame = requestAnimationFrame(() => {
                attachFrame = null
                if (!disposed && input === $input) attach($input)
            })
            return
        }
        if (attachFrame !== null) cancelAnimationFrame(attachFrame)
        attachFrame = null
        $input.setup({
            id,
            canvas,
            ctx,
            props,
            layout,
            rrUpdId,
            gridUpdId
        }).catch(error => {
            if (!disposed && input === $input) {
                detach()
                console.warn('Pointer setup failed:', error)
            }
        })
    }

    export function detach() {
        if (attachFrame !== null) cancelAnimationFrame(attachFrame)
        attachFrame = null
        const previous = input
        input = null
        previous?.destroy()
    }

    export function getInput() {
        return input
    }

    function setup() {
        if (disposed) return
        if (!layout.width || !layout.height) return
        let result = dpr.setup(canvasId, layout.width, layout.height)
        if (!result[0]) {
            // Canvas not ready, retry
            scheduleSetup()
            return
        }
        ;[canvas, ctx] = result
        //update()
    }

    function update($layout = layout) {
        if (disposed) return
        layout = $layout

        if (!ctx || !layout) return

        ctx.clearRect(0, 0, layout.width, layout.height)
        //if (this.$p.shaders.length) this.apply_shaders()
        rr.layers.forEach(l => {
            if (!l.display) return
            ctx.save()
            let r = l.overlay
            //if (r.preDraw) r.preDraw(ctx)
            if (l.opacity) ctx.globalAlpha = l.opacity
            try {
                r.draw(ctx)
            } catch (e) {
                console.warn(`Layer ${id}.${l.id} draw error:`, e)
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
        if (disposed) return
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
        if (disposed || !canvas) return
        if (dpr.resize(canvas, ctx, layout.width, layout.height)) {
            update()
        }
    }
</script>

<div id={rrId} style={rrStyle} class="nvjs-canvas-rendrer">
    <canvas id={canvasId}></canvas>
</div>

<style>
    .nvjs-canvas-rendrer {
    }
</style>
