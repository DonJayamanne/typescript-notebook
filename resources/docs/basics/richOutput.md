# Rich outputs

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
