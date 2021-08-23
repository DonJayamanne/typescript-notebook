# Node Notebook supports multiple rich output formats

You can display rich output as part of the execution of a cell. Traditionally in node.js environments you are limited to `console.log` which only supports plain text or JSON objects.

The node notebook supports a multitude of various output formats, and include:
* Text
* Json
* Html
* Markdown
* Images (in different formats, base64 encoded, file paths, bytes)
* Etc.

The following [notebook](https://raw.githubusercontent.com/DonJayamanne/typescript-notebook/main/resources/docs/basics/richOutput.nnb) includes various samples.

## Prerequisites

You need to import `node-kernel` into node.js.
This module `node-kernel` is built into the notebook. YOu do not need to install this.
You could install this to get code completion (i.e. intellisense).
```javascript
const {display} = require('node-kernel');
```

* 1. Create and run the a cell to import `node_kernel`

```javascript
const {display} = require('node-kernel');
```

* 2 Create cells to print plain text & markdown outputs.

```javascript
// Plain text outputs (boring, same as `console.log`)
display.text('Hello World');
```

```javascript
// Use javascript to generate a list of markdown bullet points.
const toc = ['Index', 'Getting Started', 'Help', 'Gloassary'];
const items = toc.map(item => `* ${item}`).join('\n');
display.markdown('# Markdown generated in js and displayed in notebooks\n' + items);
```

* 3. Create cells with HTML outputs generated in node.js

```javascript
// Rich HTML output.
const buttonText = 'Click me';
display.html(`
    <button id='myButton'>${buttonText}</button>
    <script type='text/javascript'>
        const btn = document.getElementById('myButton');
        btn.addEventListener("click", () => btn.innerText = 'You clicked the button');
    </script>
`)
```

* 3. Create cells with handcrafted HTML (in an html cell).
Note: You must ensure the language of the cell is `HTML`.

```html
<div>
    This is plain HTML with some divs and buttons, make note of the language of this cell, its `HTML`.
    <div id='myOutput' style='color:red; background-color: yellow; font-size: 2em;'></div><br>
    <button id='anotherButton'>This is yet another button</button>
</div>
```

* 4. Interactive HTML (with javascript)

```javascript
// In node.js we can generate some JavaScript  that will interact with the above HTML.
display.javascript(`
    document.getElementById('anotherButton').addEventListener("click", () => {
        console.log('Clicked another button');
        document.getElementById('myOutput').innerHTML = 'You clicked the button';
    });
`);

// Run this cell, and click the button in the previous cell.
```

* 5 Viewing images

```javascript
import * as fetch from 'node-fetch'
const svgImage = await fetch('https://nodejs.org/static/images/logo.svg').then(res => res.text());
console.log(`svgImage is of type '${typeof svgImage}`);
svgImage
```

```javascript
const res = await fetch('https://github.githubassets.com/images/modules/logos_page/Octocat.png');
const arrayBuffer = await res.arrayBuffer();
const buffer = Buffer.from(arrayBuffer)
buffer;

// The format of the image is detected automatically and displayed in the output.
```

```javascript
// Base64 encoded images are also understood and displayed as images instead of base64 string.
// If you wish to have a look at the base64 string, you can switch the mime types from the image to text.

const base64String = buffer.toString('base64');
const encodedImages = `data:image/png;base64,${base64String}`;
encodedImages
```
