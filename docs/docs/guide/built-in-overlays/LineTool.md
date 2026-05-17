# LineTool

A tap-and-hold tool for drawing trend lines and measurements on the chart.
Add this to your `overlays` array:

```js
{
    name: 'LineTool',
    type: 'LineTool',
    data: [],
    props: {},
    settings: {
        zIndex: 1000
    }
}
```

Tap and hold on the chart for 1 second to place the first endpoint of a line.
Move the mouse to extend the line, then click to place the second endpoint.
Press `Backspace` to delete the currently selected line.

Lines are stored persistently in `chart.dataExt.lines` and survive re-renders.
Click an existing line to select it — the selected line is highlighted and can
be deleted. Click an empty area to deselect.

The tool locks scrolling while a line is being drawn, preventing accidental
chart movement during measurement.
