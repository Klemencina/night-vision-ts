<script>
// Legend control buttons

import Events from '../core/events'
import icons from '../assets/icons.json'

let { gridId, ov, props, height } = $props()

let events = Events.instance(props.id)

let display = $state(ov.settings.display !== false)
let state = $derived(display ? 'open' : 'closed')

let eyeStyle = $derived(`
    background-image: url(${icons[state+'-eye']});
    background-size: contain;
    background-repeat: no-repeat;
    margin-top: ${(height - 20) * 0.5 - 3}px;
    /* FIX 'overflow: hidden' changes baseline */
    margin-bottom: -2px;
`)

export function update() {
    display = ov.settings.display !== false
}

function onDisplayClick() {
    events.emitSpec('hub', 'display-overlay', {
        paneId: gridId,
        ovId: ov.id,
        flag: ov.settings.display === undefined ?
            false : ! ov.settings.display
    })
}

</script>
<style>
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
</style>
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="nvjs-eye" style={eyeStyle}
    onclick={(e) => { e.stopPropagation(); onDisplayClick() }}>
</div>
