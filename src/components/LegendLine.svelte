<script>
    // Overlay's legend line
    // TODO: For legendHtml formatter - create web-components
    // and macros to make code easier & more compact
    // TODO: prevent trackpad events from scrolling the
    // browser page back
    // TODO: combining (& linking) several overlays. Will allow to
    // collapse several lines into one. Need to add 'group' field

    import { onMount, onDestroy } from 'svelte'
    import LegendControls from './LegendControls.svelte'
    import IndicatorSettings from './IndicatorSettings.svelte'
    import Events from '../core/events'
    import MetaHub from '../core/metaHub'
    import logo from '../assets/logo.json'
    import icons from '../assets/icons.json'

    let { gridId, ov, props, layout } = $props()

    let meta = MetaHub.instance(props.id)
    let events = Events.instance(props.id)

    let hover = $state(false)
    let ref = $state(null) // Reference to the legend-line div
    let nRef = $state(null) // Reference to the legend-name span
    let ctrlRef = $state(null) // Reference to the legend controls
    let selected = $state(false)
    let show = $state(true)
    let display = $state(ov.settings.display !== false)
    let showSettings = $state(false)

    let updId = $derived(`ll-${gridId}-${ov.id}`)

    onMount(() => {
        // EVENT INTEFACE
        events.on(`${updId}:update-ll`, update)
        events.on(`${updId}:grid-mousedown`, onDeselect)
        events.on(`${updId}:select-overlay`, onDeselect)
    })

    onDestroy(() => {
        events.off(updId)
    })

    let name = $derived(ov.name ?? `${ov.type || 'Overlay'}-${ov.id}`)
    let fontSz = $derived(parseInt(props.config.FONT.split('px').shift()))
    let styleBase = $derived(`
    font: ${props.config.FONT};
    font-size: ${fontSz + (ov.main ? 5 : 3)}px;
    font-weight: 300;
    color: ${props.colors.textLG};
    background: ${selected ? props.colors.back : props.colors.llBack};
    border: 1px solid transparent;
    margin-right: 30px;
    max-width: ${layout.width - 20}px;
    overflow-x: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    border-color: ${selected ? props.colors.llSelect : 'auto'} !important;
`)

    let styleHover = $derived(`
    background: ${props.colors.back};
    border: 1px solid ${props.colors.grid};

`)

    let dataStyle = $derived(`
    font-size: ${fontSz + (ov.main ? 3 : 2)}px;
    color: ${props.colors.llValue}
`)

    let logoStyle = $derived(`
    background-image: url(${logo[0]});
    background-size: contain;
    background-repeat: no-repeat;
`)

    let state = $derived(display ? 'open' : 'closed')

    let eyeStyle = $derived(`
    background-image: url(${icons[state + '-eye']});
    background-size: contain;
    background-repeat: no-repeat;
    margin-top: ${(boundary.height - 20) * 0.5 - 3}px;
    margin-bottom: -2px;
`)

    // let touchBoxStyle = $derived(`
    //     width: ${boundary.width}px;
    //     height: ${boundary.height}px;
    //     background: #55f9;
    //     top: -1px;
    //     left: -2px;
    // `)

    let kingStyle = $derived(`
    background-image: url(${icons['king3']});
    background-size: contain;
    background-repeat: no-repeat;
    margin-left: ${hover || !display || !data.length ? 7 : 3}px;
`)

    let boundary = $derived(ref ? ref.getBoundingClientRect() : {})
    let nBoundary = $derived(nRef ? nRef.getBoundingClientRect() : {})
    let style = $derived(styleBase + (hover ? styleHover : ''))
    let legendFns = $derived(meta.getLegendFns(gridId, ov.id) || {})
    let legend = $derived(legendFns.legend)
    let legendHtml = $derived(legendFns.legendHtml)
    let values = $derived(props.cursor.values || [])
    let data = $derived((values[gridId] || [])[ov.id] || [])
    let scale = $derived(findOverlayScale(layout.scales))
    let prec = $derived(scale.prec)

    // Check if this overlay is from a script (indicator)
    let isIndicator = $derived(!!ov.prod)

    // Disable legend if legend() returns null dynamically
    $effect(() => {
        if (legend && data && !legend(data, prec)) show = false
    })

    function update() {
        display = ov.settings.display !== false
        if (ctrlRef) ctrlRef.update()
    }

    function onMouseMove(e) {
        if (e.clientX < nBoundary.x + nBoundary.width + 35 && !hover) {
            setTimeout(() => {
                hover = true
            })
        }
    }

    function onMouseLeave() {
        setTimeout(() => {
            hover = false
        })
    }

    function onClick() {
        events.emit('select-overlay', {
            index: [gridId, ov.id]
        })
        selected = true
    }

    function onDeselect() {
        selected = false
    }

    function onSettingsClick() {
        showSettings = true
    }

    // Format legend value
    function formatter(x, $prec = prec) {
        if (x == undefined) return 'x'
        if (typeof x !== 'number') return x
        return x.toFixed($prec)
    }

    // Find overlay's scale (by searching in ovIdxs)
    function findOverlayScale(scales) {
        return (
            Object.values(scales).find(x => x.scaleSpecs.ovIdxs.includes(ov.id)) ||
            scales[layout.scaleIndex]
        )
    }

    // function disableLegend() {
    //     console.log('here')
    // }
</script>

{#if !legendFns.noLegend && ov.settings.showLegend !== false && show}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="nvjs-legend-line"
        {style}
        onmousemove={onMouseMove}
        onmouseleave={onMouseLeave}
        onclick={onClick}
        onkeypress={null}
        bind:this={ref}
    >
        {#if ov.main && props.showLogo}
            <div class="nvjs-logo" style={logoStyle}></div>
        {/if}
        <span class="nvjs-ll-name" bind:this={nRef}>
            {@html name}
            {#if ov.main}
                <span class="king-icon" style={kingStyle}> </span>
            {/if}
        </span>
        {#if display && !hover}
            <span class="nvjs-ll-data" style={dataStyle}>
                {#if ov.settings.legendHtml}
                    {@html ov.settings.legendHtml}
                {:else if !legend && !legendHtml}
                    {#each data as v, i}
                        {#if i > 0}
                            <!-- filter out time -->
                            {#if v != null}
                                <span class="nvjs-ll-value">
                                    {formatter(v)}
                                </span>
                            {:else}
                                <span class="nvjs-ll-x">x</span>
                            {/if}
                        {/if}
                    {/each}
                {:else if legendHtml && data.length}
                    {@html legendHtml(data, prec, formatter)}
                {:else if data.length}
                    {#each legend(data, prec) || [] as v}
                        <span class="nvjs-ll-value" style={`color: ${v[1]}`}>
                            {formatter(v[0])}
                        </span>
                    {/each}
                {/if}
            </span>
        {/if}
        {#if !display && !hover}
            <div class="nvjs-eye" style={eyeStyle}></div>
        {/if}
        {#if hover}
            <LegendControls
                bind:this={ctrlRef}
                {gridId}
                {ov}
                {props}
                height={boundary.height}
                onSettingsClick={isIndicator ? onSettingsClick : null}
            />
        {/if}
    </div>

    <!-- Settings Panel for Indicators -->
    {#if isIndicator}
        <IndicatorSettings {props} bind:isOpen={showSettings} overlay={ov} paneId={gridId} />
    {/if}
{/if}

<style>
    .nvjs-legend-line {
        pointer-events: all;
        position: relative;
        user-select: none;
        border-radius: 3px;
        padding: 2px 5px;
        margin-bottom: 2px;
        width: fit-content;
    }
    .nvjs-logo {
        width: 35px;
        height: 20px;
        float: left;
        margin-left: -5px;
        margin-right: 2px;
        opacity: 0.85;
    }
    .nvjs-ll-data {
        font-variant-numeric: tabular-nums;
    }
    :global(.nvjs-ll-value) {
        margin-left: 3px;
    }
    :global(.nvjs-ll-x) {
        margin-left: 3px;
    }
    .nvjs-eye {
        width: 20px;
        height: 20px;
        float: right;
        margin-right: 2px;
        margin-left: 7px;
    }
    .nvjs-eye:hover {
        filter: brightness(1.25);
    }
    .king-icon {
        padding-left: 8px;
        padding-right: 8px;
        /*padding-top: 3px;*/
        margin-right: 4px;
        filter: grayscale();
    }
    /*.king-icon:hover {
    filter: none;
}*/
</style>
