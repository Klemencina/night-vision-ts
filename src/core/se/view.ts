
// Script representation of View

import * as u from './script_utils'
import type ScriptStd from './script_std'

interface ViewProps {
    $synth?: boolean
    tf?: number | string
    ib?: boolean
    [key: string]: any
}

interface ChartSettings {
    type?: string
    $synth?: boolean
    skipNaN?: boolean
    view?: string
    vprops?: ViewProps
    [key: string]: any
}

export default class View {
    std: ScriptStd
    name: string
    props: ViewProps
    tf?: number
    iter: {
        onchart: (x: any, n: string, s: ChartSettings, iter?: boolean) => void
        offchart: (x: any, n: string, s: ChartSettings, iter?: boolean) => void
    }

    constructor(std: ScriptStd, name: string, props: ViewProps = {}) {
        this.std = std
        this.name = name
        this.props = props
        this.props.$synth = true
        this.props.tf = u.tf_from_str(this.props.tf as string)
        this.tf = this.props.tf
        this.iter = {
            onchart: (x: any, n: string, s: ChartSettings) => this.onchart(x, n, s, true),
            offchart: (x: any, n: string, s: ChartSettings) => this.offchart(x, n, s, true)
        }
    }

    // Add chart point
    chart(x: any, sett: ChartSettings = {}): void {
        if (this.tf && !this.std.onclose(this.tf)) return
        sett.view = this.name
        sett.vprops = this.props
        if (x && x.aggtype) {
            let x0 = [
                x.open[0],
                x.high[0],
                x.low[0],
                x.close[0],
                x.vol[0]
            ]
            this.std.chart(x0, sett, `view-${this.name}`)
        } else {
            this.std.chart(x, sett, `view-${this.name}`)
        }
    }

    // Add onchart point
    onchart(x: any, name: string, sett: ChartSettings = {}, iter?: boolean): void {
        if (this.tf && !this.std.onclose(this.tf) && !iter) return
        sett.view = this.name
        sett.vprops = this.props
        name = sett.view + '/' + (name || 'OV')
        ;(this.std as any).onchart(x, name, sett)
    }

    // Add offchart point
    offchart(x: any, name: string, sett: ChartSettings = {}, iter?: boolean): void {
        if (this.tf && !this.std.onclose(this.tf) && !iter) return
        sett.view = this.name
        sett.vprops = this.props
        name = sett.view + '/' + (name || 'OV')
        ;(this.std as any).offchart(x, name, sett)
    }

    // Setters (set the entire overlay object)
    $chart(data: any[], sett: ChartSettings = {}): void {
        let type = sett.type
        sett.$synth = true
        sett.skipNaN = true
        ;(this.std.env as any).chart[this.name] = {
            type: type || 'Candles',
            data: data,
            settings: sett,
            view: this.name,
            vprops: this.props,
            indexBased: this.props.ib,
            tf: this.props.tf
        }
        delete sett.type
        delete sett.vprops
        delete sett.view
    }

    $onchart(data: any[], name: string, sett: ChartSettings = {}): void {
        let type = sett.type
        name = this.name + '/' + (name || 'OV')
        sett.$synth = true
        sett.skipNaN = true
        ;(this.std.env as any).onchart[name] = {
            name: name,
            type: type || 'Spline',
            data: data,
            settings: sett,
            scripts: false,
            grid: sett.grid || {},
            view: this.name,
            vprops: this.props
        }
        delete sett.type
        delete sett.grid
    }

    $offchart(data: any[], name: string, sett: ChartSettings = {}): void {
        let type = sett.type
        name = this.name + '/' + (name || 'OV')
        sett.$synth = true
        sett.skipNaN = true
        ;(this.std.env as any).offchart[name] = {
            name: name,
            type: type || 'Spline',
            data: data,
            settings: sett,
            scripts: false,
            grid: sett.grid || {},
            view: this.name,
            vprops: this.props
        }
        delete sett.type
        delete sett.grid
    }
}
