<script>
    import { untrack } from 'svelte'
    import LegendLine from '../../../src/components/LegendLine.svelte'

    let { props, ov, layout } = $props()
    let currentProps = $state.raw(untrack(() => props))

    export function setValues(values) {
        currentProps = { ...currentProps, cursor: { values } }
    }
</script>

<LegendLine props={currentProps} gridId={0} {ov} {layout} />
