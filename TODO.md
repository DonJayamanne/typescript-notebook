1. Use tsconfig from users workspace folder, closest to the ipynb file.
3. Interactive widow will be a great addition
4. Better way to view image tensors (helper to generate images & probaly zoom in - or just use jupyters tensor visualizer)
5. Variable viewer? or tensor viewer or easy image viewer (from tensors)?
6. Changing cwd permanently in shells? (probably not)
7. Cell magics (to change CWD, send variable from node to browser)?
8. Use shell path from vscode settings
Ignore language (doesn't matter whether its shell or powershell).
At the end of the day the shell is setup by the user.
11. tfjs-vis, Use a webview instead of a Panel, as the state is not preserved & its not tied to a particular notebook.
    This way we can open the new webview on the side.
12. Use ESBuild for extension (excluding `node-pty`, that's better bundled & shipped in node_modules folder, this way the bundle will pick it)
13. Fix prettier, etc
14. Links in error output
15. Tests
# Bugs
* Enable `supportBreakingOnExceptionsInDebugger`
    For break point exceptions
* Fix stack traces in exceptions

* Following code fails
```
console.log(typeof some)
var {x}={x:'xyz1234'},y,some = ' ',([a,b]=[1,2]);
doIt();
```

* When debugging, we do'nt see variables
* Should wrap every cell in an IIFE, so we can see variables as variables.
* Display message if we fail to start node process (currently just hangs)
* Magics must be excluded from being executed as JS code (else parser will fall over & hang)

# Telemetry
* See whether we need variable hoisting
(easy, parse the code & check if we have classes/functions)
* Variable hoisting
    * At worst, we notify users that this will not work when debugging (yuck)
    * Or we open a dummy cell & start debugging that code (yuck)



# Known issues
* Hoisting is always an issue (after all its just hacky, we're changing user code)
* Printing value of last expression vs `console.log`
See below
```typescript
    var s = await Promise.resolve(1);
    function bye(){
        console.log("Bye");
    }
    bye();
    s
```
When you run this, the value `1` will be displayed first and then we'll see `Bye`.
This is because we get output from repl before we get output from stdout of the process.
** SOLUTION **
* After we get the result from the repl, we can send a `console.log(<GUID>)`, this will
tell the UI that we have some output that will be coming.
Next we sent out result via websockets. We should not display the output we got from the socket
until we've received the `<GUID>` from `process.stdout`, once we wait, we know any `console.log` the
user sent would have been received & printed in the right order.
Thus if we look at the above example, the output would be in the right order as follows:
```
Bye
1
```

