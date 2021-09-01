# Run tensorflow within a notebook and view the [Tensborboard](https://www.tensorflow.org/tensorboard) within in VS Code

1. Install the [Python extension](https://marketplace.visualstudio.com/items?itemName=ms-python.python)
2. Train the model
2. Launch the tensorboard using the command `Python: Launch TensorBoard`

```javascript
const tf = require('@tensorflow/tfjs-node') as typeof import('@tensorflow/tfjs-node');
const path = require('path');
```

```javascript
// Constructor a toy multilayer-perceptron regressor for demo purpose.
const model = tf.sequential();
model.add(
    tf.layers.dense({ units: 100, activation: 'relu', inputShape: [200] }));
model.add(tf.layers.dense({ units: 1 }));
model.compile({
    loss: 'meanSquaredError',
    optimizer: 'sgd',
    metrics: ['MAE']
});

// Generate some random fake data for demo purpose.
const xs = tf.randomUniform([10000, 200]);
const ys = tf.randomUniform([10000, 1]);
const valXs = tf.randomUniform([1000, 200]);
const valYs = tf.randomUniform([1000, 1]);

// Start model training process.
await model.fit(xs, ys, {
    epochs: 10,
    validationData: [valXs, valYs],
    // Add the tensorBoard callback here.
    callbacks: tf.node.tensorBoard(path.join(__dirname, 'tmp/fit_logs_1'))
});
```

![Tensorboard](https://raw.githubusercontent.com/DonJayamanne/typescript-notebook/main/resources/docs/tensorflow/tensorboard.png)
