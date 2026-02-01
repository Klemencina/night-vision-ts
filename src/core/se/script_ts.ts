
// Timeseries for scripts

export type TimeSeries = any[] & {
    __id__: string
    __len__?: number
    __tf__?: number
    __fn__?: Function
    __offset__?: number
    __t0__?: number
}

export default function TS(id: string, arr: any[], len?: number): TimeSeries {
    (arr as TimeSeries).__id__ = id
    if (len !== undefined) {
        (arr as TimeSeries).__len__ = len
    }
    return arr as TimeSeries
}
