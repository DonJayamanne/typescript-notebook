# You can debug both javascript and typescript code in notbeooks

TypeScript code can be executed & debugged even without typescript being installed (this is made possible using [ts-node](https://typestrong.org/ts-node/)).

### How to enable debugging?
* First add a breakpoint.
* Next, either:
    * Click on the `Debug Cell` dropdown menu next to the `Run` icon.
    * Or click on the `Debug Notebook` icon found on the top right (Editor toolbar).

### Notes:
When debugging, the all of the kernel state is retained (the node.js environment is not started).

**Option 1**

![Option1](https://raw.githubusercontent.com/DonJayamanne/typescript-notebook/main/resources/docs/basics/debugCell.gif)

**Option 2**

![Option2](https://raw.githubusercontent.com/DonJayamanne/typescript-notebook/main/resources/docs/basics/debugToolbar.gif)
