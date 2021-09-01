# Node Notebook supports multiple rich output formats

You are no longer limited to just plain text outputs via `console.log` in node.js environments.
The node notebook supports a multitude of various output formats, and include:
* Text
* Json
* Html
* Markdown
* Images (in different formats, base64 encoded, file paths, bytes)
* Plots & more

The following [notebook](https://raw.githubusercontent.com/DonJayamanne/typescript-notebook/main/resources/docs/basics/richOutput.nnb) includes various samples.

## Samples

`node-kernel` is built into the notebook runtime. You do not need to install this.
You could install this to get code completions (i.e. intellisense).
```javascript
const {display} = require('node-kernel');
display.text('Hello World');
```

```javascript
// Generate markdown outputs.
const {display} = require('node-kernel');
display.markdown('# Markdown in notebooks');
display.markdown('Click [here](https://github.com)');
```

```javascript
// Rich HTML output (with javascript).
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
```

```javascript
// View images.
import * as fetch from 'node-fetch'
const svgImage = await fetch('https://nodejs.org/static/images/logo.svg').then(res => res.text());
svgImage // Or use `display.image(svgImage);`
```
