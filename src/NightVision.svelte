<script>
    import Chart from './components/Chart.svelte'
    import Const from './stuff/constants'

    let chart = $state(null) // Chart reference

    export function getChart() {
        return chart
    }

    // Title text
    let {
        showLogo = false,
        id = 'nvjs',
        width = 750,
        height = 420,
        colors = {},
        toolbar = false,
        scripts = [],
        config = {},
        // indexBased = false, // Currently unused
        timezone = 0,
        data = {},
        scriptsReady
        // autoResize = false // Currently unused
    } = $props()

    let configMerge = $derived(Object.assign(Const.ChartConfig, config))
    let offset = $derived(toolbar ? config.TOOLBAR : 0)
    let colorsUser = $derived(Object.assign(Const.COLORS, colors))
    let props = $derived({
        showLogo,
        id,
        width: width - offset,
        height,
        colors: colorsUser,
        //toolbar,
        scripts,
        data,
        config: configMerge,
        //legendButtons,
        //indexBased,
        //extensions,
        //xSettings,
        //skin,
        timezone,
        scriptsReady
    })
    let style = $derived(`
    width: ${props.width}px;
    height: ${props.height}px;
`)
</script>

<!-- Main component  -->
<div class="night-vision" {id} {style}>
    <Chart {props} bind:this={chart} />
</div>

<style>
    /* Anit-boostrap tactix */
    .night-vision *,
    ::after,
    ::before {
        box-sizing: content-box;
    }
    .night-vision img {
        vertical-align: initial;
    }
    .night-vision {
        position: relative;
        direction: ltr; /* TODO: Explore */
    }
</style>
