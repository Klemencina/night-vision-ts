
<script>

import Chart from './components/Chart.svelte'
import Const from './stuff/constants.js'

let chart = $state(null) // Chart reference

export function getChart() { return chart }

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
    indexBased = false,
    timezone = 0,
    data = {},
    autoResize = false
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
    config: configMerge,
    //legendButtons,
    //indexBased,
    //extensions,
    //xSettings,
    //skin,
    timezone
})
let style = $derived(`
    width: ${props.width}px;
    height: ${props.height}px;
`)

</script>
<style>
/* Anit-boostrap tactix */
.night-vision *, ::after, ::before {
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
<!-- Main component  -->
<div class="night-vision" id={id} {style}>
    <Chart props={props} bind:this={chart}/>
</div>
