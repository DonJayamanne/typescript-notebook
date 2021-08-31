## node-kernel

This module contains helper functions for [node.js notebooks in Visual Studio Code](https://marketplace.visualstudio.com/items?itemName=donjayamanne.typescript-notebook).

This module unlocks the power of Notebooks in `Visual Studio Code` to provide rich outputs in node.js (i.e. you are no longer limited to plain text (`console.log`) outputs in node.js).

Tip: This npm package should be installed only if you require code completion within the node notebooks in Visual Studio Code (i.e. get intellisense for `node-kernel` when using [node.js notebooks in Visual Studio Code]((https://marketplace.visualstudio.com/items?itemName=donjayamanne.typescript-notebook))).

## Usage

### Plain text, markdown, json output

```typescript
const { display } = require('node-kernel');

// display plain text.
display.text('Plain text');

// display markdown.
display.markdown('Plain text');

// display markdown.
display.json({ data: 'some json' });
```

### Html, Javascript output

```javascript
// display html.
display.html('<h1>Hello</h1>');

// Or even more some interactive HTML.
const {display} = require('node-kernel');
const buttonText = 'Click me';
display.html(`
    <button id='myButton'>${buttonText}</button>
    <script type='text/javascript'>
    (() => {
        const btn = document.getElementById('myButton');
        btn.addEventListener("click", () => btn.innerText = 'You clicked the button');
    })();
    </script>
`);

// Include styles in HTML
const {display} = require('node-kernel');
display.html(`
    <style>
    #btn {
        color:red;
        background-color: yellow;
    }
    </style>
    <button id='btn'>Hello World</button>
`);

// Render output that will result in execution of javascript in the output.
dipslay.javascript(`
    document.getElementById('myButton').innerHTML = 'Updated button';
`);
```

### Images output

```javascript
const {display} = require('node-kernel');

// Render a base64 encoded string as an image
display.image('data:image/png;base64,iVBORw0KGgoAAAANSUhEU...');
// Render an svg string as an image
display.image('<svg width="250" height="15" ...');
// Render contents of a file as an image
display.image('/Users/..../sample.png');
// Render bytes as image
display.image(fs.readFileSync('/Users/..../sample.png'));
```

### Plots (plotly): Generate & render
Built in support for plotly.

```typescript
/**
 * Renders a plotly plot.
 * See detailed documentation here https://plotly.com/javascript/plotlyjs-function-reference/#plotlynewplot
 */
export function newPlot(
    root: plotly.Root,
    data: plotly.Data[],
    layout?: Partial<plotly.Layout>,
    config?: Partial<plotly.Config>
): Promise<void>;
```

```javascript
// Generate Plots
const { Plotly } = require('node-kernel');
var data = [{
        values: [19, 26, 55],
        labels: ['Residential', 'Non-Residential', 'Utility'],
        type: 'pie'
    }];
var layout = {
    height: 400,
    width: 500
};
// If an HTML element named `myDiv` does not exist, the plot will be generated immdiately below the cell.
Plotly.newPlot('myDiv', data, layout);
```


### Plots (plotly): Generate base64 string of the plot (useful if you want to embed this somewhere)

```typescript
/**
 * Returns a base64 encoded string representation of the generated plot.
 * @param {plotly.Data[]} data See detailed documentation here https://plotly.com/javascript/plotlyjs-function-reference/#plotlynewplot
 * @param {plotly.Layout} layout See detailed documentation here https://plotly.com/javascript/plotlyjs-function-reference/#plotlynewplot
 * @param {('png' | 'svg' | 'jpeg')} [format] Defaults to 'png' if not specified.
 */
export function toBase64(
    data: plotly.Data[],
    layout: plotly.Layout,
    format?: 'png' | 'svg' | 'jpeg'
): Promise<string>;
```


### Plots (plotly): Generate plot and save to a file.

```typescript
/**
 * Saves the generated plot into a file.
 * Return the path to the file name (if a file path is not provided a temporary image file is created and returned).
 * @param {plotly.Data[]} data See detailed documentation here https://plotly.com/javascript/plotlyjs-function-reference/#plotlynewplot
 * @param {plotly.Layout} layout See detailed documentation here https://plotly.com/javascript/plotlyjs-function-reference/#plotlynewplot
 * @param {('png' | 'svg' | 'jpeg')} [format] Defaults to 'png' if not specified.
 * @param {string} [file] Destination file path for the image to be downloaded.
 * If not specified, the image is downloaded into a temporary file and that path is returned.
 * @return {*}  {Promise<string>}
 */
export function toFile(
    data: plotly.Data[],
    layout: plotly.Layout,
    format?: 'png' | 'svg' | 'jpeg',
    file?: string
): Promise<string>;
```
