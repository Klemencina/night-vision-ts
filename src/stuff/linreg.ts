/**
 * Simple linear regression
 *
 * @param data - Array of numbers
 * @param len - Length of data to use
 * @param offset - Offset for prediction
 * @return Predicted value
 */
export default function regression(
    data: number[],
    len: number,
    offset: number
): number {

    const sliced = data.slice(0, len).reverse().map((x, i) => [i, x])

    let sum_x = 0,
        sum_y = 0,
        sum_xy = 0,
        sum_xx = 0,
        count = 0,
        m: number, b: number

    // calculate sums
    for (var i = 0, l = sliced.length; i < l; i++) {
        if (!sliced[i]) return NaN
        const point = sliced[i]
        sum_x += point[0]
        sum_y += point[1]
        sum_xx += point[0] * point[0]
        sum_xy += point[0] * point[1]
        count++
    }

    // calculate slope (m) and y-intercept (b) for f(x) = m * x + b
    m = (count * sum_xy - sum_x * sum_y) / (count * sum_xx - sum_x * sum_x)
    b = (sum_y / count) - (m * sum_x) / count

    return m * (sliced.length - 1 - offset) + b

}
