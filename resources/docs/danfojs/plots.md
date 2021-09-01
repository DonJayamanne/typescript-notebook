# Generate plots using danfo.js in node.js

```js
const dfd = require('danfojs-node') as typeof import('danfojs-node');
const df = await dfd.read_csv("https://raw.githubusercontent.com/plotly/datasets/master/finance-charts-apple.csv")

const layout = {
    title: 'A financial charts',
    xaxis: {
        title: 'Date',
    },
    yaxis: {
        title: 'Count',
    }
}

const new_df = df.set_index({ key: "Date" })
new_df.plot("plot_div").line({ columns: ["AAPL.Open", "AAPL.High"], layout: layout })
```

![Sample](https://raw.githubusercontent.com/DonJayamanne/typescript-notebook/main/resources/docs/danfojs/plots.png)
