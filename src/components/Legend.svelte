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

    let toggleStyle = $derived(`
     border-left: 6px solid transparent;
     border-right: 6px solid transparent;
     ${
         collapsed
             ? `border-top: 6px solid ${props.colors.textLG};`
             : `border-bottom: 6px solid ${props.colors.textLG};`
     }
 `)
</script>

{#key legendRR}
    <!-- Full chart re-render -->
    {#if hub.panes()[id]}
        <div class="nvjs-legend" {style}>
            {#each getLegendOverlays() as ov}
                <LegendLine gridId={id} {props} {layout} {ov} />
            {/each}
            {#if main && hasIndicators()}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                    class="nvjs-legend-toggle"
                    style={toggleStyle}
                    onclick={onToggleClick}
                    onkeypress={null}
                ></div>
            {/if}
        </div>
    {/if}
{/key}

<style>
    .nvjs-legend {
        pointer-events: none;
    }
    .nvjs-legend-toggle {
        pointer-events: all;
        display: inline-block;
        width: 0;
        height: 0;
        margin-top: 4px;
        margin-left: 5px;
        cursor: pointer;
        opacity: 0.8;
        transition: opacity 0.15s ease;
        user-select: none;
    }
    .nvjs-legend-toggle:hover {
        opacity: 1;
    }
</style>
