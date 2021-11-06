# Run javascript node.js

1. Add the following cell and run the cell

```javascript
function add(a, b){
    return a + b;
}
console.log(add(1, 2));
```


2. Import external javascript/typescript modules.
* Create a file named `sample.js` with the following contents:

```javascript
module.exports.add = function add(a, b){
    return a + b;
}
```

Optionally you could create a typescript file named `sample.ts` as follows:

```typescript
function add(a: number, b: number){
    return a + b;
}
```

* Import and execute the above module in a notebook.
* Create a cell in a notebook and run this cell

```javascript
const sample = require('./sample');
console.log(sample.add(1,2));
```

![Sample](https://raw.githubusercontent.com/DonJayamanne/typescript-notebook/main/resources/docs/basics/sample.png)
