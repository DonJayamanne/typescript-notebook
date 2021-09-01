# Get Html Output from [danfo.js](https://danfo.jsdata.org/)
[danfo.js](https://danfo.jsdata.org/) prints ASCII tables for console windows, however this extension changes that behavior to give you pretty HTML.

```js
const dfd = require('danfojs-node');
const df = await dfd.read_csv("https://web.stanford.edu/class/archive/cs/cs109/cs109.1166/stuff/titanic.csv");
df.head().print();
```

![Html Output](https://raw.githubusercontent.com/DonJayamanne/typescript-notebook/main/resources/docs/danfojs/htmlOutput.png)


```js
const dfd = require('danfojs-node');
s = new dfd.Series([1, 3, 5, undefined, 6, 8])
s.print()
```

![Series as HTML](https://raw.githubusercontent.com/DonJayamanne/typescript-notebook/main/resources/docs/danfojs/htmlOutputSeries.png)


