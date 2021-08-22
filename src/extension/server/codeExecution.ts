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
    public get currentRequestId() {
        return this._currentRequestId;
    }
    public set currentRequestId(value: string) {
        if (value !== this._currentRequestId) {
            // Start a new chain of promises.
            this.pendingDisplayUpdates = Promise.resolve();
        }
        this._currentRequestId = value;
    }
    private _currentRequestId = '';
    public get updatesSent() {
        return this.pendingDisplayUpdates.catch(() => noop()).then(() => noop());
    }
    private pendingDisplayUpdates = Promise.resolve();
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
            this.notifyDisplay({ type: 'html', value: `<script type='text/javascript'>${script}</script>` }),
        latex: noop,
        markdown: (value: string) => this.notifyDisplay({ type: 'markdown', value }),
        text: (value: string | Uint8Array) => this.notifyDisplay({ type: 'text', value: value.toString() })
    };
    public displayHtml(html: string) {
        this.notifyDisplay({ type: 'html', value: html });
    }
    public displayImage(image: string | Buffer | Uint8Array) {
        const requestId = this.currentRequestId;
        const promise = formatImage(image).then((data) => (data ? this.notifyDisplay(data, requestId) : noop()));
        this.pendingDisplayUpdates = this.pendingDisplayUpdates.finally(() => promise);
    }
    // eslint-disable-next-line @typescript-eslint/ban-types
    public displayJson(json: string | Object) {
        this.notifyDisplay({ type: 'json', value: typeof json === 'string' ? JSON.parse(json) : json });
    }
    private notifyDisplay(data: DisplayData, requestId: string = this.currentRequestId) {
        sendMessage({
            type: 'output',
            requestId,
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
    Utils.instance.currentRequestId = request.requestId ?? Utils.instance.currentRequestId;
    TensorflowJsVisualizer.instance.show.requestId =
        request.requestId ?? TensorflowJsVisualizer.instance.show.requestId;
    for (const magicHandler of magics) {
        if (magicHandler.isMagicCommand(request)) {
            return magicHandler.handleCommand(request, replServer);
        }
    }

    const start = Date.now();
    try {
        const { start, end, result } = await runCode(request.code);
        // Wait till we send all UI updates to extension before returning from here..
        await Utils.instance.updatesSent;
        const execResult: RunCellResponse = {
            requestId: request.requestId,
            success: true,
            result: await formatValue(result),
            type: 'cellExec',
            start,
            end
        };
        sendMessage(execResult);
    } catch (ex) {
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
    if (parent && request === '@tensorflow/tfjs-core' && parent.filename.includes('@tensorflow/tfjs-vis')) {
        return {};
    }
    if (request === 'node-kernel') {
        return Utils.instance;
    }
    if (request === '@tensorflow/tfjs-vis') {
        return TensorflowJsVisualizer.instance;
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
