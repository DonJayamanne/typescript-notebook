import * as repl from 'repl';
import * as vm from 'vm';
import { sendMessage } from './comms';
import { logErrorMessage, logMessage } from './logger';
import { CodeObject, Configuration, DisplayData, RunCellRequest, RunCellResponse } from './types';
import { VariableListingMagicCommandHandler } from './magics/variables';
import { formatImage, formatValue } from './extensions/format';
import { DanfoJsFormatter } from './extensions/danfoFormatter';
import { TensorflowJsVisualizer } from './extensions/tfjsVisProxy';
import { Plotly } from './extensions/plotly';
import { init as injectTslib } from '../../../resources/scripts/tslib';
import { register as registerTsNode } from './tsnode';
import { noop } from '../coreUtils';
import { createConsoleOutputCompletedMarker } from '../const';
import { DanfoNodePlotter } from './extensions/danforPlotter';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Module = require('module');

let replServer: repl.REPLServer;
let configuration: Configuration | undefined;

class Utils {
    private static _instance: Utils;
    public static get instance() {
        if (Utils._instance) {
            return Utils._instance;
        }
        return (Utils._instance = new Utils());
    }
    public static get requestId() {
        return Utils._requestId;
    }
    public static set requestId(value: string) {
        if (value !== Utils._requestId) {
            // Start a new chain of promises.
            Utils.pendingDisplayUpdates = Promise.resolve();
        }
        Utils._requestId = value;
    }
    private static _requestId = '';
    public static get updatesSent() {
        return Utils.pendingDisplayUpdates.catch(() => noop()).then(() => noop());
    }
    private static pendingDisplayUpdates = Promise.resolve();
    public readonly Plotly = Plotly;
    public readonly display = {
        html: this.displayHtml.bind(this),
        json: this.displayJson.bind(this),
        image: this.displayImage.bind(this),
        appendImage: this.displayImage.bind(this),
        gif: this.displayImage.bind(this),
        jpeg: this.displayImage.bind(this),
        png: this.displayImage.bind(this),
        svg: this.displayImage.bind(this),
        javascript: (script: string) =>
            this.notifyDisplay({
                type: 'html',
                value: `<script type='text/javascript'>${script}</script>`,
                requestId: Utils.requestId
            }),
        latex: noop,
        markdown: (value: string) => this.notifyDisplay({ type: 'markdown', value, requestId: Utils.requestId }),
        text: (value: string | Uint8Array) =>
            this.notifyDisplay({ type: 'text', value: value.toString(), requestId: Utils.requestId })
    };
    public displayHtml(html: string) {
        this.notifyDisplay({ type: 'html', value: html, requestId: Utils.requestId });
    }
    public displayImage(image: string | Buffer | Uint8Array) {
        const promise = formatImage(image, Utils.requestId).then((data) => (data ? this.notifyDisplay(data) : noop()));
        Utils.pendingDisplayUpdates = Utils.pendingDisplayUpdates.finally(() => promise);
    }
    // eslint-disable-next-line @typescript-eslint/ban-types
    public displayJson(json: string | Object) {
        this.notifyDisplay({
            type: 'json',
            value: typeof json === 'string' ? JSON.parse(json) : json,
            requestId: Utils.requestId
        });
    }
    private notifyDisplay(data: DisplayData) {
        sendMessage({
            type: 'output',
            requestId: data.requestId || Utils.requestId,
            data
        });
    }
}

let initialized = false;
export function initialize(config?: Configuration) {
    if (initialized) {
        return;
    }
    initialized = true;
    configuration = config;
    startRepl();
}

function startRepl() {
    replServer = repl.start({ prompt: '', eval: replEvalCode, ignoreUndefined: true, terminal: true, useColors: true });
    // replServer.context.$$ = Utils.instance;
    injectTslib(replServer.context);
    if (configuration?.registerTsNode === true) {
        logMessage('tsNode registered');
        registerTsNode(replServer.context);
    }
    // This way we have `__dirname`.
    replServer.context.__dirname = process.cwd();
    return replServer;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runCode(
    code: string | CodeObject,
    mode: 'userCode' | 'silent' = 'userCode'
): Promise<{ start: number; result: any; end: number }> {
    const source = typeof code === 'string' ? code : code.code;
    logMessage(mode === 'userCode' ? `Executing ${source}` : `Executing Silently ${source}`);
    // First check if we have valid JS code.
    try {
        new vm.Script(source);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (ex: any) {
        logErrorMessage('Unrecoverable error', ex);
        const newError = new Error(ex.message || '<Unknown error in creating ScriptObject>');
        newError.name = 'InvalidCode_CodeExecution';
        throw newError;
    }
    try {
        const start = Date.now();
        const fileName = typeof code === 'object' ? code.sourceFilename : undefined;
        const result = await vm.runInNewContext(source, replServer.context, {
            displayErrors: true,
            filename: fileName
        });
        const end = Date.now();
        // Found that sometimes if the code runs very quickly `runInNewContext` completes even before we get output.
        // Not much we can do about that, but adding this comment so we're aware of that.
        return { start, end, result };
    } catch (ex) {
        logErrorMessage('Unrecoverable error', ex);
        throw ex;
    }
}

async function runCodeSilently(code: string | CodeObject): Promise<unknown> {
    return runCode(code, 'silent');
}
async function replEvalCode(code, _context, _filename, _callback) {
    return runCode(code);
}

const magics = [new VariableListingMagicCommandHandler()];
export async function execCode(request: RunCellRequest): Promise<void> {
    Utils.requestId = request.requestId;
    Plotly.requestId = request.requestId;
    DanfoJsFormatter.requestId = request.requestId;
    TensorflowJsVisualizer.requestId = request.requestId;
    DanfoNodePlotter.requestId = request.requestId;
    for (const magicHandler of magics) {
        if (magicHandler.isMagicCommand(request)) {
            try {
                await magicHandler.handleCommand(request, replServer);
            } finally {
                console.log(createConsoleOutputCompletedMarker(request.requestId));
            }
            return;
        }
    }

    const start = Date.now();
    try {
        const { start, end, result } = await runCode(request.code);
        // Wait till we send all UI updates to extension before returning from here..
        await Utils.updatesSent;
        // Now its possible as part of the execution, some data was written to the console.
        // Sometimes those messages written to the console get dispayed in the output after
        // the last result (the value `result` below).
        // E.g. assuem we have a cell as follows:
        //
        // var a = 1234;
        // console.log('Hello World')
        // a
        //
        // Since the variable `a` is the last line, just like in a repl, the value will be printed out.
        // However, when we monitor output of the process, its possible that comes a little later (depends on when the buffer is flushed).
        // Hence its possible we'd see `1234\nHello World`, i.e. things in reverse order.
        // As a solution, we'll send a console.log<Special GUID><ExecutionCount>, if we see that, then we know we're ready to display messages
        // received from kernel (i.e. displaying the value of the last line).
        console.log(createConsoleOutputCompletedMarker(request.requestId));

        // Or another solution is to send the value of the last line (last expression)
        // as an output on console.log
        // But the problem with that is, this console.log could end up in the output of the next cell.

        const execResult: RunCellResponse = {
            requestId: request.requestId,
            success: true,
            result: await formatValue(result, request.requestId),
            type: 'cellExec',
            start,
            end
        };
        sendMessage(execResult);
    } catch (ex) {
        console.log(createConsoleOutputCompletedMarker(request.requestId));
        const err = ex as Partial<Error> | undefined;
        const execResult: RunCellResponse = {
            requestId: request.requestId,
            success: false,
            ex: { name: err?.name || 'unknown', message: err?.message || 'unknown', stack: err?.stack },
            type: 'cellExec',
            start,
            end: Date.now()
        };
        sendMessage(execResult);
    }
}

// let injectedCustomTFLogger = false;

// /**
//  * We are only interested in printing the current progress,
//  * We don't care about the previous epochs (they take space).
//  * User can use the GUID as a place holder to determine where the progress really started
//  */
// function customTfjsProgressLogger(message: string) {
//     console.log(message);
//     // console.log(`49ed1433-2c77-4180-bdfc-922704829871${message}`);
// }
// function injectCustomProgress() {
//     if (injectedCustomTFLogger) {
//         return;
//     }
//     try {
//         const { progressBarHelper } = vm.runInNewContext(
//             "require('@tensorflow/tfjs-node/dist/callbacks')",
//             replServer.context,
//             {
//                 displayErrors: false
//             }
//         );
//         if (progressBarHelper.log !== customTfjsProgressLogger) {
//             // For some reason, when training in tensforflow, we get empty lines from the process.
//             // Some code in tfjs is writing empty lines into console window. no idea where.
//             // Even if logging is disabled, we get them.
//             // This results in ugly long empty oututs.
//             // Solution, swallow this new lines.
//             try {
//                 const tf = vm.runInNewContext("require('@tensorflow/tfjs')", replServer.context, {
//                     displayErrors: false
//                 }) as typeof import('@tensorflow/tfjs');
//                 class CustomLogger extends tf.CustomCallback {
//                     constructor() {
//                         super({
//                             onTrainBegin: (_) => console.log('d1786f7c-d2ed-4a27-bd8a-ce19f704d4d0'),
//                             onTrainEnd: () => console.log('1f3dd592-7812-4461-b82c-3573643840ed')
//                         });
//                     }
//                 }
//                 tf.registerCallbackConstructor(1, CustomLogger);
//             } catch (ex) {
//                 console.error('Failed to inject custom tensorflow logger to swallow empty lines', ex);
//             }
//             progressBarHelper.log = customTfjsProgressLogger;
//         }
//     } catch (ex) {
//         injectedCustomTFLogger = true;
//         console.error('Failed to inject custom tensorflow progress bar', ex);
//     }
// }
const originalLoad = Module._load;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
Module._load = function (request: any, parent: any) {
    if (
        parent &&
        request === '@tensorflow/tfjs-core' &&
        parent.filename &&
        parent.filename.includes('@tensorflow/tfjs-vis') &&
        !parent.filename.includes('@tensorflow/tfjs-vis/dist/util/math')
    ) {
        return {};
    }
    if (request === 'node-kernel') {
        return Utils.instance;
    }
    if (request === '@tensorflow/tfjs-vis') {
        const tfMath = vm.runInNewContext("require('@tensorflow/tfjs-vis/dist/util/math');", replServer.context, {
            displayErrors: false
        });
        const tfCore = vm.runInNewContext("require('@tensorflow/tfjs-core');", replServer.context, {
            displayErrors: false
        });
        return TensorflowJsVisualizer.initialize(tfCore, tfMath);
    }
    if (request === '@tensorflow/tfjs-node') {
        // injectCustomProgress();
        // TensorFormatter.initialize();
    }

    // eslint-disable-next-line prefer-rest-params
    const result = originalLoad.apply(this, arguments);
    if (request === 'danfojs-node') {
        DanfoJsFormatter.initialize(runCodeSilently, result);
    }
    return result;
};
