# Node.js Notebooks
## Features
* Run & debug JavaScript, TypeScript code in node.js
* Built in support for typescript (ships with [TypeScript](https://www.typescriptlang.org/) & [ts-node](https://typestrong.org/ts-node/)).
* Built in support for [plotly](https://plotly.com/javascript/) (plotly.js is shipped with the extension)
* Rich (inline visualizations) using [@tensforflow/tfjs-vis](https://www.npmjs.com/package/@tensorflow/tfjs-vis)
* Excellent support for [danfo.js](https://danfo.jsdata.org/) (rich HTML output and plots)
* Run shell commands within the notebook cell.
* Quickly prototype and view HTML/JavaScript/CSS output

**Note:**
HTML (rich) visualzation is only supported in the browser for [plotly](https://plotly.com/javascript/), [tfjs-vis](https://www.npmjs.com/package/@tensorflow/tfjs-vis) & [danfo.js](https://danfo.jsdata.org/).
However, this extension leverages the power of Notebooks to provide the same rich visualzations when targetting node.js.


## Getting started
* Create a file in VS Code with the extension `*.nnb`, e.g. `sample.nnb`
* Add a cell and run it

![Demo](https://user-images.githubusercontent.com/1948812/129159454-0fb4f7be-98be-4f69-a4f1-a0a7a9db634f.gif)

## Requirements
* node.js >= 12
* node.js needs to be in the current path

## Roadmap
* [Vega](https://vega.github.io/vega/) plots without having to install vega
* [See here for example](https://raw.githubusercontent.com/DonJayamanne/typescript-notebook/main/images/main.png)

### Known issues, workarounds and technical details
* See [here](https://github.com/DonJayamanne/typescript-notebook/wiki/Kernel-behaviour-(known-issues-&-workarounds)) for more details


## Thanks
Thanks to the various packages we provide integrations with which help make this extension useful:
* [ts-node](https://typestrong.org/ts-node/)
* [plotly](https://plotly.com/javascript/)
* [Tensorflow.js](https://www.tensorflow.org/js)
* [danfo.js](https://danfo.jsdata.org/)
