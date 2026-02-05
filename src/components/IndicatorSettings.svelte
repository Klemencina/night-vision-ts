<script>
    // Floating panel for indicator settings
    // Styled to match project: uses props.colors.* and props.config.FONT

    // Component uses Svelte 5 runes, no lifecycle hooks needed
    import Events from '../core/events'
    import DataHub from '../core/dataHub'
    import Scripts from '../core/scripts'
    import SeClient from '../core/se/seClient'

    let { props, isOpen = $bindable(false), overlay = null, paneId = null } = $props()

    let events = Events.instance(props.id)
    let hub = DataHub.instance(props.id)
    let scripts = Scripts.instance(props.id)
    let seClient = SeClient.instance(props.id)

    // Script reference
    let script = $state(null)
    let scriptProps = $state({})
    let indicatorUi = $state({ enabled: false, allowedProps: [] })
    let propsMeta = $state([])

    // Initialize when panel opens or overlay changes
    $effect(() => {
        if (isOpen && overlay) {
            findScript()
        }
    })

    function findScript() {
        // Find the script that produced this overlay
        const pane = hub.panes()[paneId]
        if (!pane || !pane.scripts) return

        // overlay.prod contains the script uuid
        const scriptUuid = overlay.prod
        if (!scriptUuid) return

        // Find script in pane
        script = pane.scripts.find(s => s.uuid === scriptUuid)
        if (!script) return

        // Get props metadata from iScripts
        const scriptType = script.type
        const iScript = scripts.iScripts[scriptType]
        if (iScript?.propsMeta) {
            propsMeta = iScript.propsMeta
        }

        // Initialize script props with defaults from metadata if not set
        scriptProps = { ...script.props }

        // Ensure all props from metadata have values
        for (const meta of propsMeta) {
            if (!(meta.name in scriptProps)) {
                scriptProps[meta.name] = meta.def
            }
        }

        // Get indicator UI settings
        indicatorUi = script.settings?.indicatorUi || { enabled: false, allowedProps: [] }
    }

    function onClose() {
        isOpen = false
    }

    function onBackdropClick(e) {
        if (e.target === e.currentTarget) {
            onClose()
        }
    }

    function onToggleEnabled() {
        indicatorUi.enabled = !indicatorUi.enabled
        updateIndicatorUi()
    }

    function onToggleProp(propName) {
        const idx = indicatorUi.allowedProps.indexOf(propName)
        if (idx > -1) {
            indicatorUi.allowedProps.splice(idx, 1)
        } else {
            indicatorUi.allowedProps.push(propName)
        }
        indicatorUi.allowedProps = [...indicatorUi.allowedProps] // Trigger reactivity
        updateIndicatorUi()
    }

    function updateIndicatorUi() {
        if (!script) return
        script.settings = script.settings || {}
        script.settings.indicatorUi = { ...indicatorUi }

        // Emit event to update legend
        events.emit('update-legend')
    }

    async function onApply() {
        if (!script) return

        // Update script props
        script.props = { ...scriptProps }

        // Send update to worker
        const delta = {
            [script.uuid]: scriptProps
        }
        await seClient.updateScriptProps(delta)

        onClose()
    }

    // Styling
    let backdropStyle = $derived(`
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
`)

    let panelStyle = $derived(`
    background: ${props.colors.back};
    border: 1px solid ${props.colors.grid};
    border-radius: 6px;
    padding: 16px;
    min-width: 280px;
    max-width: 360px;
    max-height: 80vh;
    overflow-y: auto;
    font: ${props.config.FONT};
    color: ${props.colors.textLG};
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
`)

    let headerStyle = $derived(`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid ${props.colors.grid};
`)

    let titleStyle = $derived(`
    font-size: ${parseInt(props.config.FONT) + 2}px;
    font-weight: 500;
    color: ${props.colors.textLG};
`)

    let closeBtnStyle = $derived(`
    background: none;
    border: none;
    color: ${props.colors.textLG};
    font-size: 20px;
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
`)

    let sectionStyle = $derived(`
    margin-bottom: 16px;
`)

    let labelStyle = $derived(`
    display: block;
    font-size: ${parseInt(props.config.FONT)}px;
    color: ${props.colors.textLG};
    margin-bottom: 8px;
`)

    let checkboxStyle = $derived(`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    font-size: ${parseInt(props.config.FONT)}px;
    color: ${props.colors.textLG};
    cursor: pointer;
`)

    let inputStyle = $derived(`
    background: ${props.colors.back};
    border: 1px solid ${props.colors.grid};
    border-radius: 3px;
    padding: 6px 8px;
    font: ${props.config.FONT};
    color: ${props.colors.textLG};
    width: 100%;
    box-sizing: border-box;
`)

    let propRowStyle = $derived(`
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
    padding: 8px;
    background: ${props.colors.llBack};
    border-radius: 4px;
`)

    let propLabelStyle = $derived(`
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: ${parseInt(props.config.FONT)}px;
    color: ${props.colors.textLG};
`)

    let buttonsStyle = $derived(`
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid ${props.colors.grid};
`)

    let btnBaseStyle = $derived(`
    padding: 6px 12px;
    border: 1px solid ${props.colors.grid};
    border-radius: 3px;
    font: ${props.config.FONT};
    cursor: pointer;
    transition: opacity 0.15s ease;
`)

    let btnPrimaryStyle = $derived(`
    ${btnBaseStyle}
    background: ${props.colors.grid};
    color: ${props.colors.textLG};
`)

    let btnSecondaryStyle = $derived(`
    ${btnBaseStyle}
    background: transparent;
    color: ${props.colors.textLG};
`)
</script>

{#if isOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="nvjs-indicator-settings-backdrop" style={backdropStyle} onclick={onBackdropClick}>
        <div class="nvjs-indicator-settings-panel" style={panelStyle}>
            <div class="nvjs-indicator-settings-header" style={headerStyle}>
                <span class="nvjs-indicator-settings-title" style={titleStyle}>
                    {overlay?.name || 'Indicator Settings'}
                </span>
                <button
                    class="nvjs-indicator-settings-close"
                    style={closeBtnStyle}
                    onclick={onClose}
                    title="Close"
                >
                    ×
                </button>
            </div>

            {#if script}
                <!-- Enable Chart Editing Toggle -->
                <div class="nvjs-indicator-settings-section" style={sectionStyle}>
                    <label class="nvjs-indicator-settings-checkbox" style={checkboxStyle}>
                        <input
                            type="checkbox"
                            checked={indicatorUi.enabled}
                            onchange={onToggleEnabled}
                        />
                        <span>Enable chart editing</span>
                    </label>
                </div>

                <!-- Props Configuration -->
                {#if propsMeta.length > 0}
                    <div class="nvjs-indicator-settings-section" style={sectionStyle}>
                        <span class="nvjs-indicator-settings-label" style={labelStyle}>
                            Properties
                        </span>

                        {#each propsMeta as meta (meta.name)}
                            <div class="nvjs-indicator-settings-prop-row" style={propRowStyle}>
                                <label
                                    class="nvjs-indicator-settings-prop-label"
                                    style={propLabelStyle}
                                >
                                    <span>{meta.name}</span>
                                    <input
                                        type="checkbox"
                                        checked={indicatorUi.allowedProps.includes(meta.name)}
                                        onchange={() => onToggleProp(meta.name)}
                                        title="Allow editing on chart"
                                    />
                                </label>

                                {#if meta.type === 'color'}
                                    <div style="display: flex; gap: 8px; align-items: center;">
                                        <input
                                            type="color"
                                            value={scriptProps[meta.name] || meta.def}
                                            oninput={e => (scriptProps[meta.name] = e.target.value)}
                                            style="width: 40px; height: 28px; padding: 0; border: none; background: none; cursor: pointer;"
                                        />
                                        <input
                                            type="text"
                                            value={scriptProps[meta.name] || meta.def}
                                            oninput={e => (scriptProps[meta.name] = e.target.value)}
                                            style={inputStyle}
                                        />
                                    </div>
                                {:else if meta.type === 'integer' || meta.type === 'number'}
                                    <input
                                        type="number"
                                        value={scriptProps[meta.name] ?? meta.def}
                                        oninput={e =>
                                            (scriptProps[meta.name] =
                                                meta.type === 'integer'
                                                    ? parseInt(e.target.value)
                                                    : parseFloat(e.target.value))}
                                        style={inputStyle}
                                    />
                                {:else}
                                    <input
                                        type="text"
                                        value={scriptProps[meta.name] ?? meta.def}
                                        oninput={e => (scriptProps[meta.name] = e.target.value)}
                                        style={inputStyle}
                                    />
                                {/if}
                            </div>
                        {/each}
                    </div>
                {:else}
                    <div class="nvjs-indicator-settings-section" style={sectionStyle}>
                        <span
                            style="color: {props.colors.scale}; font-size: {parseInt(
                                props.config.FONT
                            )}px;"
                        >
                            No configurable properties
                        </span>
                    </div>
                {/if}

                <!-- Buttons -->
                <div class="nvjs-indicator-settings-buttons" style={buttonsStyle}>
                    <button
                        class="nvjs-indicator-settings-btn-secondary"
                        style={btnSecondaryStyle}
                        onclick={onClose}
                    >
                        Cancel
                    </button>
                    <button
                        class="nvjs-indicator-settings-btn-primary"
                        style={btnPrimaryStyle}
                        onclick={onApply}
                    >
                        Apply
                    </button>
                </div>
            {:else}
                <div
                    style="color: {props.colors.scale}; font-size: {parseInt(
                        props.config.FONT
                    )}px; text-align: center; padding: 20px;"
                >
                    No script found for this indicator
                </div>
            {/if}
        </div>
    </div>
{/if}

<style>
    .nvjs-indicator-settings-backdrop {
        animation: fadeIn 0.15s ease;
    }

    .nvjs-indicator-settings-panel {
        animation: slideIn 0.15s ease;
    }

    .nvjs-indicator-settings-close:hover {
        opacity: 0.7;
    }

    .nvjs-indicator-settings-btn-primary:hover,
    .nvjs-indicator-settings-btn-secondary:hover {
        opacity: 0.8;
    }

    input[type='checkbox'] {
        cursor: pointer;
    }

    input[type='color']::-webkit-color-swatch-wrapper {
        padding: 0;
    }

    input[type='color']::-webkit-color-swatch {
        border: 1px solid #666;
        border-radius: 3px;
    }

    @keyframes fadeIn {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }

    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateY(-10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
</style>
