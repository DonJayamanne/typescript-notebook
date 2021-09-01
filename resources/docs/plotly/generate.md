# Generate and view Plotly plots in Notebooks

```javascript
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
// There is no HTML element named `myDiv`, hence the plot is displayed below.
Plotly.newPlot('myDiv', data, layout);
```

![Sample](https://raw.githubusercontent.com/DonJayamanne/typescript-notebook/main/resources/docs/plotly/generate.png)
