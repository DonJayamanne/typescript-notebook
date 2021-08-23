# You can debug both javascript and typescript code in notbeooks

Notebooks leverages the existing node.js debugger found in VS Code to debug both javascript and typescript within a node.js environment.
Even though typescript isn't installed, typescript is transpiled into javascript on the fly using [ts-node](https://typestrong.org/ts-node/) and you are still able to debug such tyepscript code with source maps pointing back to the original typescript files.


### Notes:
Debugging is enabled per-notebook. I.e. if you have debugging turned on for a notebook, then you switch over to another notebook. That notebook will not have debugging enabled.
Each notebook ends up using its own node.js process, i.e. each notebook is running in a seprate isolated environment.


### Debugging mix of javascript + typescript cells in a notebook
In this sample we'll create a notebook with both javascript & typescript cells.

* Create a sample notebook
* Add a javascript cell as follows and run this cell:

```javascript
function add(a, b){
    return a + b;
}
```

* Add a typescript cell as follows:

```typescript
const result = add(1,2);
console.log(result);
```

* Add a breakpoint to the line `const result = add(1,2);`
* Click on the `Debug Notebook` icon found on the top right (Editor toolbar).
This will enable debugging (none of the state information is lost).
* Confirm you have added a break point to the second cell.
* Run the second cell & watch the debugger stop. Next use `Step In` to step into the `add` function and watch the debugger go into the first cell.

![DebugJsNb](https://raw.githubusercontent.com/DonJayamanne/typescript-notebook/main/resources/docs/basics/debug.gif)
