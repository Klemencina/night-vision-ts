
// Current data view (data subset)

export default class DataView$ {
    src: number[][]
    i1: number
    i2: number
    length: number

    constructor(src: number[][], i1: number, i2: number) {
        this.src = src
        // Expanding the RANGE (by one on each side)
        this.i1 = Math.max(0, i1 - 1)
        this.i2 = Math.min(i2, src.length - 1)
        this.length = this.i2 - this.i1 + 1
    }

    makeSubset(): number[][] {
        return this.src.slice(
            this.i1,
            this.i2 + 1
        )
    }
}
