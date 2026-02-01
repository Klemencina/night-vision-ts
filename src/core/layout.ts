// Layout calculations (grid, scales, etc)

import GridMaker from './gridMaker.js'

interface Pane {
    id: number
    overlays: any[]
    settings: Record<string, any>
    uuid?: string
}

interface Hub {
    chart: Pane | null
    offchart: Pane[]
    panes: () => Pane[]
    mainPaneId: number
    indexBased: boolean
    mainOv: any
}

interface Meta {
    ohlc: (t: number) => [number, number, number, number] | undefined
}

interface Props {
    height: number
    width: number
    config: Record<string, any>
    interval: number
    timeFrame: number
    range: [number, number]
    timezone: number
}

interface Grid {
    height: number
    offset: number
    main: boolean
    xs: [number, number, number, number][]
}

interface LayoutResult {
    grids: Grid[]
    main: Grid | undefined
    indexBased: boolean
    botbar: {
        width: number
        height: number
        offset: number
        xs: [number, number, number, number][]
    }
}

function Layout(props: Props, hub: Hub, meta: Meta): LayoutResult | {} {
    let chart = hub.chart
    let offchart = hub.offchart
    let panes = hub.panes().filter((x: Pane) => x.settings)

    if (!chart) return {}

    // Splits space between main chart
    // and offchart indicator grids
    function gridHs(): number[] {

        const height = props.height - props.config.BOTBAR

        // When at least one height defined (default = 1),
        // Pxs calculated as: (sum of weights) / number
        if (panes.find((x: Pane) => x.settings.height)) {
            return weightedHs(height)
        }

        const n = offchart.length
        const off_h = (2 * Math.sqrt(n) / 7) / (n || 1)

        // Offchart pane height
        const px = Math.floor(height * off_h)

        // Main pane height
        const m = height - px * n

        let hs = Array(n+1).fill(px)
        hs[hub.mainPaneId] = m
        return hs

    }

    // Weighted grid heights
    function weightedHs(height: number): number[] {
        let hs = hub.panes().map((x: Pane) => x.settings.height ?? 1)
        let sum = hs.reduce((a: number, b: number) => a + b, 0)
        hs = hs.map((x: number) => Math.floor((x / sum) * height))

        // Refine the height if Math.floor decreased px sum
        sum = hs.reduce((a: number, b: number) => a + b, 0)
        for (var i = 0; i < height - sum; i++) hs[i % hs.length]++
        return hs
    }

    //  Place all grids in the right order
    const hs = gridHs()
    let specs = (i: number) => ({
        hub, meta, props, settings: panes[i].settings,
        height: hs[i]
    })
    let mainGm = (GridMaker as any)(
        hub.mainPaneId,
        specs(hub.mainPaneId)
    )
    let gms = [mainGm]
    for (var [i, pane] of panes.entries()) {
        if (i !== hub.mainPaneId) {
            gms.push((GridMaker as any)(
                i, specs(i), mainGm.getLayout())
            )
        }
    }

    // Max sidebar among all grinds
    // (for left & right side)
    let sb: [number, number] = [
        Math.max(...gms.map((x: any) => x.getSidebar()[0])),
        Math.max(...gms.map((x: any) => x.getSidebar()[1]))
    ]

    let grids: Grid[] = [], offset = 0

    // Create grids (first should be created the main grid)
    for (var i = 0; i < gms.length; i++) {
        let id = gms[i].id()
        gms[i].setMaxSidebar(sb)
        grids[id] = gms[i].create()
    }
    for (var i = 0; i < grids.length; i++) {
        grids[i].offset = offset
        offset += grids[i].height
    }

    return {
        grids: grids,
        main: grids.find((x: Grid) => x.main),
        indexBased: hub.indexBased,
        botbar: {
            width: props.width,
            height: props.config.BOTBAR,
            offset: offset,
            xs: grids[0] ? grids[0].xs : []
        }
    }
}

export default Layout
