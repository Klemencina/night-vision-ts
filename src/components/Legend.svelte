<script>
    // Legend block (collection of LegendLines)

    import Events from '../core/events'
    import DataHub from '../core/dataHub'
    import LegendLine from './LegendLine.svelte'

    let { id, props, layout, main } = $props()

    let hub = DataHub.instance(props.id)
    let events = Events.instance(props.id)

    let legendRR = $state(0) // Re-render key
    let collapsed = $state(!!hub.legendCollapsed)

    let style = $derived(`
    left: ${layout.sbMax[0] + 5}px;
    top: ${(layout.offset || 0) + 5}px;
    position: absolute;
`)

    // EVENT INTEFACE
    $effect(() => {
        events.on(`legend-${id}:update-legend`, update)
        return () => {
            events.off(`legend-${id}`)
        }
    })

    function update() {
        collapsed = !!hub.legendCollapsed
        legendRR++
    }

    function onToggleClick(e) {
        e.stopPropagation()
        hub.legendCollapsed = !hub.legendCollapsed
        collapsed = !!hub.legendCollapsed
        events.emit('update-legend')
    }

    function getLegendOverlays() {
        let pane = hub.panes()[id]
        if (!pane) return []
        let overlays = pane.overlays || []
        if (!collapsed) return overlays
        if (!main) return []
        let mainOv = overlays.find(ov => ov.main)
        return mainOv ? [mainOv] : overlays[0] ? [overlays[0]] : []
    }

    function hasIndicators() {
        for (let pane of hub.panes() || []) {
            for (let ov of pane.overlays || []) {
                if (!ov.main) return true
            }
        }
        return false
    }
</script>

{#key legendRR}
    <!-- Full chart re-render -->
    {#if hub.panes()[id]}
        <div class="nvjs-legend" {style}>
            {#each getLegendOverlays() as ov}
                <LegendLine
                    gridId={id}
                    {props}
                    {layout}
                    {ov}
                    showToggle={main && ov.main}
                    {collapsed}
                    {onToggleClick}
                />
            {/each}
        </div>
    {/if}
{/key}

<style>
    .nvjs-legend {
        pointer-events: none;
    }
    .nvjs-legend-toggle {
        display: none;
    }
</style>
