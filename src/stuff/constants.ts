export const SECOND = 1000
export const MINUTE = SECOND * 60
export const MINUTE3 = MINUTE * 3
export const MINUTE5 = MINUTE * 5
export const MINUTE15 = MINUTE * 15
export const MINUTE30 = MINUTE * 30
export const HOUR = MINUTE * 60
export const HOUR4 = HOUR * 4
export const HOUR12 = HOUR * 12
export const DAY = HOUR * 24
export const WEEK = DAY * 7
export const MONTH = WEEK * 4
export const YEAR = DAY * 365

export const MONTHMAP: readonly string[] = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec'
]

// Grid time steps
export const TIMESCALES: readonly number[] = [
    YEAR * 10,
    YEAR * 5,
    YEAR * 3,
    YEAR * 2,
    YEAR,
    MONTH * 6,
    MONTH * 4,
    MONTH * 3,
    MONTH * 2,
    MONTH,
    DAY * 15,
    DAY * 10,
    DAY * 7,
    DAY * 5,
    DAY * 3,
    DAY * 2,
    DAY,
    HOUR * 12,
    HOUR * 6,
    HOUR * 3,
    HOUR * 1.5,
    HOUR,
    MINUTE30,
    MINUTE15,
    MINUTE * 10,
    MINUTE5,
    MINUTE * 2,
    MINUTE
]

// Grid $ steps
export const $SCALES: readonly number[] = [0.05, 0.1, 0.2, 0.25, 0.5, 0.8, 1, 2, 5]

// Color scheme interface
export interface ColorScheme {
    back: string // Background color
    grid: string // Grid color
    text: string // Regular text color
    textHL: string // Highlighted text color
    textLG: string // Legend text color
    llValue: string // Legend value color
    llBack: string // Legend bar background
    llSelect: string // Legend select border
    scale: string // Scale edge color
    cross: string // Crosshair color
    candleUp: string // "Green" candle color
    candleDw: string // "Red" candle color
    wickUp: string // "Green" wick color
    wickDw: string // "Red" wick color
    volUp: string // "Green" volume color
    volDw: string // "Red" volume color
    panel: string // Scale panel color
    tbBack?: string // Toolbar background
    tbBorder: string // Toolbar border color
}

// Default colors
export const COLORS: ColorScheme = {
    back: '#14151c', // Background color
    grid: '#252732', // Grid color
    text: '#adadad', // Regular text color
    textHL: '#dedddd', // Highlighted text color
    textLG: '#c4c4c4', // Legend text color
    llValue: '#818989', // Legend value color
    llBack: '#14151c77', // Legend bar background
    llSelect: '#2d7b2f', // Legend select border
    scale: '#606060', // Scale edge color
    cross: '#8091a0', // Crosshair color
    candleUp: '#41a376', // "Green" candle color
    candleDw: '#de4646', // "Red" candle color
    wickUp: '#23a77688', // "Green" wick color
    wickDw: '#e5415088', // "Red" wick color
    volUp: '#41a37682', // "Green" volume color
    volDw: '#de464682', // "Red" volume color
    panel: '#2a2f38', // Scale panel color
    tbBack: undefined, // Toolbar background
    tbBorder: '#8282827d' // Toolbar border color
}

// Chart configuration interface
export interface ChartConfigType {
    SBMIN: number // Minimal sidebar, px
    SBMAX: number // Max sidebar, px
    TOOLBAR: number // Toolbar width, px
    TB_ICON: number // Toolbar icon size, px
    TB_ITEM_M: number // Toolbar item margin, px
    TB_ICON_BRI: number // Toolbar icon brightness
    TB_ICON_HOLD: number // Wait to expand, ms
    TB_BORDER: number // Toolbar border, px
    TB_B_STYLE: string // Toolbar border style
    TOOL_COLL: number // Tool collision threshold
    PIN_RADIUS: number // Tool pin radius
    EXPAND: number // Expand y-range, %/100 of range
    CANDLEW: number // Candle width, %/100 of step
    GRIDX: number // Grid x-step target, px
    GRIDY: number // Grid y-step target, px
    BOTBAR: number // Bottom bar height, px
    PANHEIGHT: number // Scale panel height, px
    DEFAULT_LEN: number // Starting range, candles
    MINIMUM_LEN: number // Minimal starting range, candles
    MIN_ZOOM: number // Minimal zoom, candles
    MAX_ZOOM: number // Maximal zoom, candles
    VOLSCALE: number // Volume bars height, %/100 of layout.height
    UX_OPACITY: number // Ux background opacity
    ZOOM_MODE: string // Zoom mode, 'tv' or 'tl'
    L_BTN_SIZE: number // Legend Button size, px
    L_BTN_MARGIN: string // css margin
    SCROLL_WHEEL: string // Scroll wheel morde, 'prevent', 'pass', 'click'
    QUANTIZE_AFTER: number // Quantize cursor after, ms
    AUTO_PRE_SAMPLE: number // Sample size for auto-precision
    CANDLE_TIME: boolean // Show remaining candle time
    LEGEND_COLLAPSED: boolean // Collapse legend by default
    FONT: string // Font string (added dynamically)
}

export const ChartConfig: ChartConfigType = {
    SBMIN: 60, // Minimal sidebar, px
    SBMAX: Infinity, // Max sidebar, px
    TOOLBAR: 57, // Toolbar width, px
    TB_ICON: 25, // Toolbar icon size, px
    TB_ITEM_M: 6, // Toolbar item margin, px
    TB_ICON_BRI: 1, // Toolbar icon brightness
    TB_ICON_HOLD: 420, // Wait to expand, ms
    TB_BORDER: 1, // Toolbar border, px
    TB_B_STYLE: 'dotted', // Toolbar border style
    TOOL_COLL: 7, // Tool collision threshold
    PIN_RADIUS: 5.5, // Tool pin radius
    EXPAND: 0.15, // Expand y-range, %/100 of range
    CANDLEW: 0.7, // Candle width, %/100 of step
    GRIDX: 100, // Grid x-step target, px
    GRIDY: 47, // Grid y-step target, px
    BOTBAR: 28, // Bottom bar height, px
    PANHEIGHT: 22, // Scale panel height, px
    DEFAULT_LEN: 50, // Starting range, candles
    MINIMUM_LEN: 5, // Minimal starting range, candles
    MIN_ZOOM: 5, // Minimal zoom, candles
    MAX_ZOOM: 5000, // Maximal zoom, candles
    VOLSCALE: 0.15, // Volume bars height, %/100 of layout.height
    UX_OPACITY: 0.9, // Ux background opacity
    ZOOM_MODE: 'tv', // Zoom mode, 'tv' or 'tl'
    L_BTN_SIZE: 21, // Legend Button size, px
    L_BTN_MARGIN: '-6px 0 -6px 0', // css margin
    SCROLL_WHEEL: 'prevent', // Scroll wheel morde, 'prevent', 'pass', 'click'
    QUANTIZE_AFTER: 0, // Quantize cursor after, ms
    AUTO_PRE_SAMPLE: 10, // Sample size for auto-precision
    CANDLE_TIME: true, // Show remaining candle time
    LEGEND_COLLAPSED: false, // Collapse legend by default
    FONT: '' // Will be set below
}

ChartConfig.FONT = `11px -apple-system,BlinkMacSystemFont,
    Segoe UI,Roboto,Oxygen,Ubuntu,Cantarell,
    Fira Sans,Droid Sans,Helvetica Neue,
    sans-serif`

export const IB_TF_WARN =
    `When using IB mode you should specify ` +
    `timeframe ('tf' filed in 'chart' object),` +
    `otherwise you can get an unexpected behaviour`

// Time unit mapping
export const MAP_UNIT: Record<string, number> = {
    '1s': SECOND,
    '5s': SECOND * 5,
    '10s': SECOND * 10,
    '20s': SECOND * 20,
    '30s': SECOND * 30,
    '1m': MINUTE,
    '3m': MINUTE3,
    '5m': MINUTE5,
    '15m': MINUTE15,
    '30m': MINUTE30,
    '1H': HOUR,
    '2H': HOUR * 2,
    '3H': HOUR * 3,
    '4H': HOUR4,
    '12H': HOUR12,
    '1D': DAY,
    '1W': WEEK,
    '1M': MONTH,
    '1Y': YEAR,
    // Lower case variants
    '1h': HOUR,
    '2h': HOUR * 2,
    '3h': HOUR * 3,
    '4h': HOUR4,
    '12h': HOUR12,
    '1d': DAY,
    '1w': WEEK,
    '1y': YEAR
}

// Half-pixel adjustment to the canvas
export const HPX = -0.5

// Default export for backwards compatibility
export default {
    SECOND,
    MINUTE,
    MINUTE5,
    MINUTE15,
    MINUTE30,
    HOUR,
    HOUR4,
    DAY,
    WEEK,
    MONTH,
    YEAR,
    MONTHMAP,
    TIMESCALES,
    $SCALES,
    ChartConfig,
    MAP_UNIT,
    IB_TF_WARN,
    COLORS,
    HPX
}
