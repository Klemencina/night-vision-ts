<!-- App.svelte -->
<script>
import.meta.hot
import { NightVision } from './index.js'
import data from '../data/data-ohlcv-rsi.json?id=main'
import dataIndexed from '../data/data-ohlcv-rsi-indexed.json?id=main-indexed'
import TestStack from '../tests/testStack.js'


// Tests
import fullReset from '../tests/data-sync/fullReset.js'
import paneAddRem from '../tests/data-sync/paneAddRem.js'
import paneSettings from '../tests/data-sync/paneSettings.js'
import ovAddRem from '../tests/data-sync/ovAddRem.js'
import scaleChange from '../tests/data-sync/scaleChange.js'
import mainOverlay from '../tests/data-sync/mainOverlay.js'
import ovSettings from '../tests/data-sync/ovSettings.js'
import ovPropsChange from '../tests/data-sync/ovPropsChange.js'
import ovDataChange from '../tests/data-sync/ovDataChange.js'

// More tests
import realTime from '../tests/real-time/realTime.js'

// More tests
import timeBased from '../tests/tfs-test/allTimeBased.js'
import indexBasedTest from '../tests/tfs-test/allIndexBased.js'

// More tests
import indicators from '../tests/indicators/indicators.js'
import rangeTool from '../tests/tools/rangeTool.js'
import lineTool from '../tests/tools/lineTool.js'
import watchPropTest from '../tests/navy/watchPropTest.js'

// More tests
import logScaleTest from '../tests/scales/logScale.js'
import memoryTest from '../tests/memory/memoryTest.js'

/*
TODO: data-api interface:
.getPanes()
.getAllOverlays()
.pane('main').getRenderers()
.pane(0).getOverlay('<name>').getRenderer() // id
...
*/

// TODO: Memory leak tests

// Element references using Svelte 5 bind:this
let container1 = $state(null)
let container2 = $state(null)

let stack = new TestStack()
let chart = $state(null)

// Create second test stack for index-based chart
let stack2 = new TestStack()
let chart2 = $state(null)

// Track if charts are already initialized
let chartsInitialized = $state(false)

//data.indexBased = true

// Debug: Log which data files are loaded
const regularData = data?.panes?.[0]?.overlays?.[0]?.data
const indexedData = dataIndexed?.panes?.[0]?.overlays?.[0]?.data
console.log('=== DATA VERIFICATION ===')
console.log('Regular data first 3 timestamps:', regularData?.slice(0, 3).map(d => d[0]))
console.log('Indexed data first 3 timestamps:', indexedData?.slice(0, 3).map(d => d[0]))
console.log('Regular intervals:', regularData?.[1]?.[0] - regularData?.[0]?.[0], 'ms')
console.log('Indexed intervals:', indexedData?.[1]?.[0] - indexedData?.[0]?.[0], 'ms')

// Use $effect to create charts after DOM elements are ready
$effect(() => {
    if (!container1 || !container2 || chartsInitialized) return
    
    chartsInitialized = true
    
    console.log('Creating TOP chart (time-based) with regular data')
    // Time-based chart (top)
    chart = new NightVision('chart-container', {
        id: 'chart-time',
        data: data,
        autoResize: true,
    })
    
    console.log('Creating BOTTOM chart (index-based) with indexed data')
    // Index-based chart (bottom)
    chart2 = new NightVision('chart-container2', {
        id: 'chart-index',
        data: dataIndexed,
        autoResize: true,
        indexBased: true
    })
    
    window.chart = chart
    window.chart2 = chart2
    window.stack = stack
    window.stack2 = stack2

    // Setup tests for time-based chart
    setupTests(stack, chart)
    
    // Setup tests for index-based chart
    setupTests(stack2, chart2)

//  Type in the console: stack.execAll() or stack2.execAll()
    //  or: stack.exec('<group>') or stack2.exec('<group>')

})

// Helper function to setup all tests on a stack/chart pair
function setupTests(testStack, chartInstance) {
    testStack.setGroup('data-sync')

    fullReset(testStack, chartInstance)
    paneAddRem(testStack, chartInstance)
    paneSettings(testStack, chartInstance)
    ovAddRem(testStack, chartInstance)
    scaleChange(testStack, chartInstance)
    mainOverlay(testStack, chartInstance)
    ovSettings(testStack, chartInstance)
    ovPropsChange(testStack, chartInstance)
    ovDataChange(testStack, chartInstance)

    testStack.setGroup('real-time')

    realTime(testStack, chartInstance)

    testStack.setGroup('tfs-test')

    timeBased(testStack, chartInstance)
    indexBasedTest(testStack, chartInstance)

    testStack.setGroup('ind-test')

    indicators(testStack, chartInstance)

    testStack.setGroup('tools-test')

    //rangeTool(testStack, chartInstance)
    lineTool(testStack, chartInstance)

    testStack.setGroup('navy-test')

    watchPropTest(testStack, chartInstance)

    testStack.setGroup('scales-test')

    logScaleTest(testStack, chartInstance)

    testStack.setGroup('memory-test')

    memoryTest(testStack, chartInstance)
}

</script>
<style>
.app {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
}

#chart-container, #chart-container2 {
    position: relative;
    width: 100%;
    height: 50%;
}
</style>
<div class="app">
    <div id="chart-container" bind:this={container1}></div>
    <div id="chart-container2" bind:this={container2}></div>
</div>
