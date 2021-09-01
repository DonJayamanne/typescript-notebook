# Generate and view Plotly plots in Notebooks

The extension ships with the latest version of Plotly, making it unnecessary to install plotly.js.

```javascript
const { Plotly } = require('node-kernel');
const data = [{
    values: [19, 26, 55],
    labels: ['Residential', 'Non-Residential', 'Utility'],
    type: 'pie'
}];
const layout = {
    height: 400,
    width: 500
};
// There is no HTML element named `myDiv`, hence the plot is displayed below.
Plotly.newPlot('myDiv', data, layout);
```

![Sample](https://raw.githubusercontent.com/DonJayamanne/typescript-notebook/main/resources/docs/plotly/generate.png)
