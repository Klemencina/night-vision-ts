// Timeseries for scripts

export type TimeSeries = number[] & {
    __id__: string
    __len__?: number
    __tf__?: number
    __fn__?: (x: number, t?: number) => void
    __offset__?: number
    __t0__?: number
}

export default function TS(id: string, arr: number[], len?: number): TimeSeries {
    ;(arr as TimeSeries).__id__ = id
    if (len !== undefined) {
        ;(arr as TimeSeries).__len__ = len
    }
    return arr as TimeSeries
}
