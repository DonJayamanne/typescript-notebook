# Node.js Notebooks
## Features
* Enhanced REPL experience for Node.js in Notebooks (with top level awaits)
* Run & debug JavaScript, TypeScript code in node.js
* Built in support for typescript (ships with [TypeScript](https://www.typescriptlang.org/) & [ts-node](https://typestrong.org/ts-node/)).
* Built in support for [plotly](https://plotly.com/javascript/) (plotly.js is shipped with the extension)
* Rich (inline visualizations) using [@tensforflow/tfjs-vis](https://www.npmjs.com/package/@tensorflow/tfjs-vis) & [Tensorboards](https://www.tensorflow.org/tensorboard)
* Excellent support for [danfo.js](https://danfo.jsdata.org/) (rich HTML output and plots)
* Excellent support for [arquero](https://uwdata.github.io/arquero/) (rich HTML output)
* Run shell scripts within the notebook cell.
* Quickly prototype and view HTML/JavaScript/CSS output
* Support for user input using [readline](https://nodejs.org/api/readline.html#readline_readline_createinterface_options)


Packages such [plotly](https://plotly.com/javascript/), [tfjs-vis](https://www.npmjs.com/package/@tensorflow/tfjs-vis) & [danfo.js](https://danfo.jsdata.org/) support rich visualzation only in the browser,
wowever, this extension leverages the power of Notebooks to provide the same rich visualzations when targetting node.js.

Use the command `Open a sample node.js notebook` to open a sample notebook to get started with plotly.js, danfo.js, tensorflow.js, etc.

## Getting started
* For a REPL experience use the command `Open Node.js REPL`
    * Consider installing the [Jupyter](https://marketplace.visualstudio.com/items?itemName=ms-toolsai.jupyter) extension for an enhance user interface (toolbars).
* For a notebook experience, create a file with the extension `*.nnb`, e.g. `sample.nnb`
    * Or use the menu item `New File...` to create a Node.js notebook


![Demo](https://raw.githubusercontent.com/DonJayamanne/typescript-notebook/main/images/demo.gif)


## Examples
* Use the command `Open a sample node.js notebook` to open a sample notebook.
* Use the command `Welcome: Open Walkthrought...` to checkout the samples.

## Requirements
* node.js >= 12
* node.js needs to be in the current path

## Roadmap
* Open a plain js/ts file as a notebook & vice versa.
* Better renderers for tabular data (arquero, danfo.js, etc)
* [Vega](https://vega.github.io/vega/) plots without having to install vega
* Custom node arguments


### Known issues, workarounds and technical details
* See [here](https://github.com/DonJayamanne/typescript-notebook/wiki/Kernel-behaviour-(known-issues-&-workarounds)) for more details


## Thanks
Thanks to the various packages we provide integrations with which help make this extension useful:
* [ts-node](https://typestrong.org/ts-node/)
* [Tensorflow.js](https://www.tensorflow.org/js)
* [plotly](https://plotly.com/javascript/)
* [danfo.js](https://danfo.jsdata.org/)
* [node-pty](https://github.com/microsoft/node-pty)
* [arquero](https://uwdata.github.io/arquero/)
