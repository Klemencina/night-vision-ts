# RangeTool

A Shift+click tool for measuring price, percentage, candle count, and elapsed time ranges.
Just add this to your `overlays` array:

```js 
{
    name: 'RangeTool',
    type: 'RangeTool',
    data: [],
    props: {},
    settings: {
        zIndex: 1000
    }
}
```

Hold `Shift` and click the chart to start drawing a transparent measurement rectangle.
Move the mouse to resize it, then click again to finish the measurement. Click once more
to clear it.

The label shows:

- price move from the bottom of the rectangle to the top
- percentage move from the bottom of the rectangle to the top
- number of candles inside the selected horizontal span
- elapsed time between the start and end candles

You can customize the colors and opacity:

```js
{
    name: 'RangeTool',
    type: 'RangeTool',
    data: [],
    props: {
        colorUp: '#3355ff',
        colorDown: '#ff3333',
        fillOpacity: 0.2,
        labelOpacity: 0.85
    },
    settings: {
        zIndex: 1000
    }
}
```
