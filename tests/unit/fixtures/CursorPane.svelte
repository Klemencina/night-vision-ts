<script>
    let { props } = $props()
    let values = $derived(props.cursor.values || [])
    let data = $derived((values[0] || [])[0])
</script>

<span data-cursor-value>{data?.[1]}</span>
