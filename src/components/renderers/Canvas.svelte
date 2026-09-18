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
    // Limit the extra bitmap to 32 MiB of RGBA pixels per renderer.
    const maxCachePixels = 8 * 1024 * 1024
    let cacheCanvas = null
    let cacheContext = null
    let cachedLayers = null
    let cachedLayout = null
    let cachedStates = []

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
        events.on(`${subscriptionId}:update-cursor-rr`, updateCursor)
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
        document.addEventListener('visibilitychange', invalidateCache)
        scheduleSetup()
    })

    onDestroy(() => {
        disposed = true
        if (setupFrame !== null) cancelAnimationFrame(setupFrame)
        setupFrame = null
        document.removeEventListener('visibilitychange', invalidateCache)
        releaseCache()
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

    function updateCursor($layout = layout) {
        update($layout, true)
    }

    function update($layout = layout, cursorOnly = false) {
        if (disposed) return
        layout = $layout

        if (!ctx || !layout) return
        const resized = dpr.resize(canvas, ctx, layout.width, layout.height)
        if (!cursorOnly || resized) invalidateCache()
        const prefix = cacheablePrefix()
        if (!prefix) releaseCache()

        ctx.clearRect(0, 0, layout.width, layout.height)
        let start = 0
        if (prefix && cursorOnly && cacheMatches(prefix)) {
            ctx.save()
            ctx.setTransform(1, 0, 0, 1, 0, 0)
            ctx.drawImage(cacheCanvas, 0, 0)
            ctx.restore()
            start = prefix
        }
        let cacheable = true
        for (let i = start; i < rr.layers.length; i++) {
            cacheable = drawLayer(rr.layers[i]) && cacheable
            if (prefix && i + 1 === prefix) {
                if (cacheable) captureCache(prefix)
                else invalidateCache()
            }
        }

        // TODO: css thing didn't work, coz canvas draws
        // through the border somehow. See Pane.svelte
        if (id > 0) upperBorder()
    }

    function drawLayer(layer) {
        if (!layer.display) return true
        ctx.save()
        if (layer.opacity) ctx.globalAlpha = layer.opacity
        try {
            layer.overlay.draw(ctx)
            return true
        } catch (error) {
            console.warn(`Layer ${id}.${layer.id} draw error:`, error)
            return false
        } finally {
            ctx.globalAlpha = 1
            ctx.restore()
        }
    }

    function cacheablePrefix() {
        if (!canvas.width || !canvas.height || canvas.width * canvas.height > maxCachePixels) {
            return 0
        }
        let prefix = 0
        let dynamic = false
        let visibleData = false
        for (const layer of rr.layers) {
            if (layer.ovSrc) {
                if (layer.redrawOnCursor !== false) return 0
                visibleData = visibleData || layer.display
            }
            if (layer.redrawOnCursor === false) {
                if (dynamic) return 0
                prefix++
            } else {
                dynamic = true
            }
        }
        return visibleData ? prefix : 0
    }

    function cacheMatches(prefix) {
        if (!cacheCanvas || cachedLayers !== rr.layers || cachedLayout !== layout ||
            cacheCanvas.width !== canvas.width || cacheCanvas.height !== canvas.height ||
            cachedStates.length !== prefix) return false
        for (let i = 0; i < prefix; i++) {
            const layer = rr.layers[i]
            const state = cachedStates[i]
            if (state.layer !== layer || state.draw !== layer.overlay.draw ||
                state.display !== layer.display || state.opacity !== layer.opacity ||
                state.show !== layer.show) return false
        }
        return true
    }

    function captureCache(prefix) {
        if (!cacheCanvas) {
            cacheCanvas = document.createElement('canvas')
            cacheContext = cacheCanvas.getContext('2d')
        }
        if (!cacheContext) {
            releaseCache()
            return
        }
        if (cacheCanvas.width !== canvas.width) cacheCanvas.width = canvas.width
        if (cacheCanvas.height !== canvas.height) cacheCanvas.height = canvas.height
        cacheContext.clearRect(0, 0, cacheCanvas.width, cacheCanvas.height)
        cacheContext.drawImage(canvas, 0, 0)
        cachedLayers = rr.layers
        cachedLayout = layout
        cachedStates = rr.layers.slice(0, prefix).map(layer => ({
            layer,
            draw: layer.overlay.draw,
            display: layer.display,
            opacity: layer.opacity,
            show: layer.show
        }))
    }

    function invalidateCache() {
        cachedLayers = null
        cachedLayout = null
        cachedStates = []
    }

    function releaseCache() {
        invalidateCache()
        if (cacheCanvas) {
            cacheCanvas.width = 0
            cacheCanvas.height = 0
        }
        cacheCanvas = null
        cacheContext = null
    }

    // Perform various tasks
    function onTask(event) {
        if (disposed) return
        invalidateCache()
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
