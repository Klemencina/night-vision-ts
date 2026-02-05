<script>
    // Floating panel for indicator settings
    // Styled to match project: uses props.colors.* and props.config.FONT

    import { onMount } from 'svelte'
    import DataHub from '../core/dataHub'
    import Scripts from '../core/scripts'
    import SeClient from '../core/se/seClient'

    let { props, overlay = null, paneId = null, onClose } = $props()

    let hub = DataHub.instance(props.id)
    let scripts = Scripts.instance(props.id)
    let seClient = SeClient.instance(props.id)

    // Script reference
    let script = $state(null)
    let scriptProps = $state({})
    let propsMeta = $state([])
    let showFixedRangeHint = $derived(scriptProps.fixedMin != null && scriptProps.fixedMax != null)

    onMount(() => {
        if (!overlay) return
        // Reset state
        script = null
        scriptProps = {}
        propsMeta = []

        // Try to find script immediately
        const found = findScript()

        // If not found, retry after a short delay (scripts might still be loading)
        if (!found) {
            setTimeout(() => {
                findScript()
            }, 100)
        }
    })

    function findScript() {
        // Find the script that produced this overlay
        const panes = hub.panes() || []

        // overlay.prod contains the script uuid
        const scriptUuid = overlay.prod
        if (!scriptUuid) {
            return false
        }

        // Find script across all panes (script can live on a different pane)
        script = null
        for (const pane of panes) {
            if (!pane?.scripts) continue
            script = pane.scripts.find(s => s.uuid === scriptUuid)
            if (script) break
        }

        if (!script) {
            // Try to find by type as fallback
            for (const pane of panes) {
                if (!pane?.scripts) continue
                script = pane.scripts.find(s => s.type === overlay.type)
                if (script) break
            }

            if (!script) {
                // Last resort: try to get metadata from iScripts directly using overlay type
                if (overlay.type && scripts.iScripts[overlay.type]) {
                    script = {
                        uuid: overlay.prod || 'virtual-' + overlay.type,
                        type: overlay.type,
                        props: overlay.props || {},
                        settings: overlay.settings || {}
                    }
                } else {
                    return false
                }
            }
        }

        // Get props metadata from iScripts
        const scriptType = script.type
        const iScript = scripts.iScripts[scriptType]
        if (iScript?.propsMeta) {
            propsMeta = iScript.propsMeta
        }

        // Initialize script props with defaults from metadata if not set
        const storedProps =
            script.settings?.indicatorProps || overlay?.settings?.indicatorProps || {}
        const baseProps = {
            ...(overlay?.props || {}),
            ...(script.props || {}),
            ...storedProps
        }
        scriptProps = { ...baseProps }

        // Ensure all props from metadata have values
        for (const meta of propsMeta) {
            if (!(meta.name in scriptProps)) {
                scriptProps[meta.name] = meta.def
            }
        }

        return true
    }

    function onCloseClick() {
        if (onClose) onClose()
    }

    function onBackdropClick(e) {
        if (e.target === e.currentTarget) {
            onCloseClick()
        }
    }

    async function onApply() {
        if (!script) return

        // Update script props
        script.props = { ...scriptProps }
        script.settings = script.settings || {}
        script.settings.indicatorProps = { ...scriptProps }
        if (overlay) {
            overlay.props = overlay.props || {}
            Object.assign(overlay.props, scriptProps)
            overlay.settings = overlay.settings || {}
            overlay.settings.indicatorProps = { ...scriptProps }
        }

        // Send update to worker
        const delta = {
            [script.uuid]: scriptProps
        }
        await seClient.updateScriptProps(delta)

        onCloseClick()
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
    z-index: 9999;
    pointer-events: auto;
`)

    let panelStyle = $derived(`
    background: ${props.colors.back};
    border: 1px solid ${props.colors.grid};
    border-radius: 6px;
    padding: 16px;
    min-width: 280px;
    max-width: 360px;
    max-height: 80vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    font: ${props.config.FONT};
    color: ${props.colors.textLG};
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    pointer-events: auto;
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

    let hintStyle = $derived(`
    font-size: ${parseInt(props.config.FONT) - 1}px;
    color: ${props.colors.scale};
    margin-bottom: 10px;
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

    let bodyStyle = $derived(`
    overflow-y: auto;
    padding-right: 4px;
    margin-right: -4px;
    flex: 1 1 auto;
    --nvjs-scroll-track: ${props.colors.back};
    --nvjs-scroll-thumb: ${props.colors.grid};
`)

    let labelStyle = $derived(`
    display: block;
    font-size: ${parseInt(props.config.FONT)}px;
    color: ${props.colors.textLG};
    margin-bottom: 8px;
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
                onclick={onCloseClick}
                title="Close"
            >
                ×
            </button>
        </div>

        {#if script}
            <div class="nvjs-indicator-settings-body" style={bodyStyle}>
                <!-- Props Configuration -->
                {#if propsMeta.length > 0}
                    <div class="nvjs-indicator-settings-section" style={sectionStyle}>
                        <span class="nvjs-indicator-settings-label" style={labelStyle}>
                            Properties
                        </span>

                        {#if showFixedRangeHint}
                            <div style={hintStyle}>
                                Scale locked to fixed range (manual zoom overrides)
                            </div>
                        {/if}

                        {#each propsMeta.filter(meta => meta.name !== 'prec' && meta.name !== 'zIndex' && meta.name !== 'fixedMin' && meta.name !== 'fixedMax') as meta (meta.name)}
                            <div class="nvjs-indicator-settings-prop-row" style={propRowStyle}>
                                <div
                                    class="nvjs-indicator-settings-prop-label"
                                    style={propLabelStyle}
                                >
                                    <span>{meta.name}</span>
                                </div>

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
            </div>

            <!-- Buttons -->
            <div class="nvjs-indicator-settings-buttons" style={buttonsStyle}>
                <button
                    class="nvjs-indicator-settings-btn-secondary"
                    style={btnSecondaryStyle}
                    onclick={onCloseClick}
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
            <div class="nvjs-indicator-settings-body" style={bodyStyle}>
                <div
                    style="color: {props.colors.scale}; font-size: {parseInt(
                        props.config.FONT
                    )}px; text-align: center; padding: 20px;"
                >
                    No script found for this indicator
                </div>
            </div>
        {/if}
    </div>
</div>

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

    input[type='color']::-webkit-color-swatch-wrapper {
        padding: 0;
    }

    input[type='color']::-webkit-color-swatch {
        border: 1px solid #666;
        border-radius: 3px;
    }

    :global(.nvjs-indicator-settings-body) {
        scrollbar-color: var(--nvjs-scroll-thumb) var(--nvjs-scroll-track);
        scrollbar-width: thin;
    }

    :global(.nvjs-indicator-settings-body::-webkit-scrollbar) {
        width: 8px;
    }

    :global(.nvjs-indicator-settings-body::-webkit-scrollbar-track) {
        background: var(--nvjs-scroll-track);
        border-radius: 6px;
    }

    :global(.nvjs-indicator-settings-body::-webkit-scrollbar-thumb) {
        background: var(--nvjs-scroll-thumb);
        border-radius: 6px;
        border: 2px solid var(--nvjs-scroll-track);
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
