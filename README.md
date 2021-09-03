# Node.js Notebooks
## Features
* Run & debug JavaScript, TypeScript code in node.js
* Built in support for typescript (ships with [TypeScript](https://www.typescriptlang.org/) & [ts-node](https://typestrong.org/ts-node/)).
* Built in support for [plotly](https://plotly.com/javascript/) (plotly.js is shipped with the extension)
* Rich (inline visualizations) using [@tensforflow/tfjs-vis](https://www.npmjs.com/package/@tensorflow/tfjs-vis) & [Tensorboards](https://www.tensorflow.org/tensorboard)
* Excellent support for [danfo.js](https://danfo.jsdata.org/) (rich HTML output and plots)
* Run shell scripts within the notebook cell.
* Quickly prototype and view HTML/JavaScript/CSS output

Packages such [plotly](https://plotly.com/javascript/), [tfjs-vis](https://www.npmjs.com/package/@tensorflow/tfjs-vis) & [danfo.js](https://danfo.jsdata.org/) support rich visualzation only in the browser,
wowever, this extension leverages the power of Notebooks to provide the same rich visualzations when targetting node.js.

Use the command [Open a sample node.js notebook](command:node.notebook.sample) to open a sample notebook to get started with plotly.js, danfo.js, tensorflow.js, etc.

## Getting started
* Create a file with the extension `*.nnb`, e.g. `sample.nnb`
* Or use the menu item [New File](command:welcome.showNewFileEntries) to create a Node.js notebook


![Demo](/images/demo.gif)

## Examples
* Use the command [Open a sample node.js notebook](command:node.notebook.sample) to open a sample notebook.
* Use the command [Welcome: Open Walkthrought...](command:workbench.action.openWalkthrough) to checkout the samples.

## Requirements
* node.js >= 12
* node.js needs to be in the current path

## Roadmap
* Support user input (node.js `readline` for basic input in scripts)
* Open a plain js/ts file as a notebook & vice versa.
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
