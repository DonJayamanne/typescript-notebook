* Update stack traces in error outputs
    * Ensure we fix the source maps (lines, columns should be updated)
    * Assume we have a function defined in cell 2 that invokes a function defined in cell 1
    If there are errors in cell 1 function, then when we run cell 2, the stack trace should include lines that point to cell 1 & cell 2
    When testing, ensure we have multiple lines from the same cell in the stack trace.
* Ensure we kill the shell process
* Source maps are all wrong
    Easy way to confirm is with debugging (& inline breakpoints)
* Ensure outputs
```javascript
console.log(1);
```
```javascript
setTimeout(() => console.log(1), 1000);
```
```javascript
await new Promise(resolve, setTimeout(resolve, 1000));
console.log(1);
```
```javascript
for (let i = 0; i < 10; i++){
    await new Promise(resolve, setTimeout(resolve, 1000));
    console.log(1);
}
```
```javascript
// Sometimes we loose output (VSC bug)
for (let i = 0; i < 10; i++){
    await new Promise(resolve, setTimeout(resolve, 100));
    console.log(1);
}
```
```javascript
// Sometimes the order is incorrect (might not yet be fixed)
console.log(1324);
9999
```
```javascript
// Sometimes the order is incorrect (might not yet be fixed)
import {display} from 'node-kernel';
display.text('1234');
9999
```
```javascript
// Sometimes the order is incorrect (might not yet be fixed)
import {display} from 'node-kernel';
display.text('1234');
9999
```
```javascript
var a = 1243;
a
```
```javascript
a = 1243;
```
```javascript
// Test string literals
`Value of a is ${a}`;
```
```javascript
// Circular references in JSON output.
setTimeout(() => console.log(1324), 1000);
```
```typescript
import * as fs from 'fs/promises';
```
```typescript
// Ensure imports in previous cells are available.
const image = await fs.readFile('.....');
image
```
```typescript
// Ensure imports in previous cells are available.
const image = await fs.readFile('.....');
image
```
```typescript
// Test default imports, named imports (in subsequent cells)
import xyz from 'abc';
import {wow} from 'another';
import {wow, that:isAwesome} from 'another';
import type {wow, that:isAwesome} from 'another';
```
```typescript
// Run this and ensure the source maps are right, it will be wrong today, needs to be fixed.
console.log(x)
```

* Test source maps for the following
```javascript
// Add unnecessary leading white space.
    var a = 1234;
```
