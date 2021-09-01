# Run tensorflow within a notebook and use the [tensorflow visualizations](https://www.npmjs.com/package/@tensorflow/tfjs-vis) within node.js

### Simple scatter plot

```javascript
const tf = require('@tensorflow/tfjs-node') as typeof import('@tensorflow/tfjs-node');
const tfvis = require('@tensorflow/tfjs-vis') as typeof import('@tensorflow/tfjs-vis');
const fetch = require('node-fetch') as typeof import('node-fetch');
```

```javascript
/**
 * Get the car data reduced to just the variables we are interested
 * and cleaned of missing data.
 */
async function getData() {
  const carsDataResponse = await fetch('https://storage.googleapis.com/tfjs-tutorials/carsData.json');
  const carsData = await carsDataResponse.json();
  const cleaned = carsData.map(car => ({
    mpg: car.Miles_per_Gallon,
    horsepower: car.Horsepower,
  }))
    .filter(car => (car.mpg != null && car.horsepower != null));

  return cleaned;
}
```

```javascript
async function run() {
  const values = data.map(d => ({
    x: d.horsepower,
    y: d.mpg,
  }));

  tfvis.render.scatterplot(
    { name: 'Horsepower v MPG' },
    { values },
    {
      xLabel: 'Horsepower',
      yLabel: 'MPG',
      height: 300,
      width: 500
    }
  );

  // More code will be added below
}
// Load and plot the original input data that we are going to train on.
const data = await getData();
await run()
```

![First Scatter Plot](https://raw.githubusercontent.com/DonJayamanne/typescript-notebook/main/resources/docs/tensorflow/scatterPlot.png)


3. Next create the model and view the model summary.
Create 2 cells as follows:

```javascript
function createModel() {
  // Create a sequential model
  const model = tf.sequential();

  // Add a single input layer
  model.add(tf.layers.dense({ inputShape: [1], units: 1, useBias: true }));

  // Add an output layer
  model.add(tf.layers.dense({ units: 1, useBias: true }));

  return model;
}
```

```javascript
// Create the model
const model = createModel();
tfvis.show.modelSummary({ name: 'Model Summary' }, model);
```

4. Run the two cells and view the model summary
![First Scatter Plot](https://raw.githubusercontent.com/DonJayamanne/typescript-notebook/main/resources/docs/tensorflow/modelSummary.png)
