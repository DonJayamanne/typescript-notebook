# Changelog

## 2.0.4 (12 Oct 2021)
* Support for a REPL (Interactive Window) experience (https://github.com/DonJayamanne/typescript-notebook/issues/37)
* Fix typescript compilation (https://github.com/DonJayamanne/typescript-notebook/issues/40)
* Updates to TypeScript 4.4.4

## 2.0.3 (12 Sept 2021)
* Support for user input in notebooks using [readline](https://nodejs.org/api/readline.html#readline_readline_createinterface_options)
* Update samples to use `isomorphic-fetch` instead of `node-fetch` (and pre-requisite `npm` packages).

## 2.0.2 (6 Sept 2021)
* Excellent support for [arquero](https://uwdata.github.io/arquero/) (rich HTML output)
* New notebooks default cells to `typescript`
* Displaying cell execution errors on Linux
* Display `Tensorflow Visualization` panel only when required.
* Ability to always hide `Tensorflow Visualization` panel via the setting `"node_notebook.disableTensorflowVis": true`

## 2.0.1 (2 Sept 2021)
* Updated readme

## 2.0.0 (2 Sept 2021)
* Run & debug JavaScript, TypeScript code in node.js
* Built in support for typescript (ships with [TypeScript](https://www.typescriptlang.org/) & [ts-node](https://typestrong.org/ts-node/)).
* Built in support for [plotly](https://plotly.com/javascript/) (plotly.js is shipped with the extension)
* Rich (inline visualizations) using [@tensorflow/tfjs-vis](https://www.npmjs.com/package/@tensorflow/tfjs-vis) & [Tensorboards](https://www.tensorflow.org/tensorboard)
* Excellent support for [danfo.js](https://danfo.jsdata.org/) (rich HTML output and plots)
* Run shell scripts within the notebook cell.
* Quickly prototype and view HTML/JavaScript/CSS output

