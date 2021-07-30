import * as repl from 'repl';
import * as vm from 'vm';
import { sendMessage } from './comms';
import { logErrorMessage, logMessage } from './logger';
import { CodeObject, DisplayData, RunCellRequest, RunCellResponse } from './types';
import { processTopLevelAwait } from 'node-repl-await';
import { VariableListingMagicCommandHandler } from './magics/variables';
import { formatValue } from './format';
import { DanfoJsFormatter } from './danfoFormatter';
import { TensorflowJsVisualizer } from './tfjsVisProxy';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Module = require('module');

let replServer: repl.REPLServer;

class Utils {
    private static _instance: Utils;
    public static get instance() {
        if (Utils._instance) {
            return Utils._instance;
        }
        return (Utils._instance = new Utils());
    }
    public currentRequestId = -1;
    public get display() {
        return {
            html: this.displayHtml.bind(this),
            json: this.displayJson.bind(this),
            image: this.displayImage.bind(this)
        };
    }
    public displayHtml(html: string) {
        this.notifyDisplay({ type: 'html', value: html });
    }
    public displayImage(image: string | Buffer) {
        formatValue(image).then((data) => this.notifyDisplay(data));
    }
    // eslint-disable-next-line @typescript-eslint/ban-types
    public displayJson(json: string | Object) {
        this.notifyDisplay({ type: 'json', value: typeof json === 'string' ? JSON.parse(json) : json });
    }
    private notifyDisplay(data: DisplayData) {
        sendMessage({
            type: 'output',
            requestId: this.currentRequestId,
            data
        });
    }
}

startRepl();
function startRepl() {
    replServer = repl.start({ prompt: '', eval: replEvalCode, ignoreUndefined: true, terminal: true, useColors: true });
    replServer.context.$$ = Utils.instance;
    return replServer;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runCode(code: string | CodeObject, mode: 'userCode' | 'silent' = 'userCode'): Promise<any> {
    try {
        const originalSource = typeof code === 'string' ? code : code.code;
        const source = processTopLevelAwait(originalSource) || originalSource;
        logMessage(mode === 'userCode' ? `Executing ${source}` : `Executing Silently ${source}`);
        const fileName = typeof code === 'object' ? code.fileName : undefined;
        const result = await vm.runInNewContext(source, replServer.context, {
            displayErrors: true,
            filename: fileName
        });
        // Found that sometimes if the code runs very quickly `runInNewContext` completes even before we get output.
        // Not much we can do about that, but adding this comment so we're aware of that.
        return result;
    } catch (ex) {
        logErrorMessage('Unrecoverable error', ex);
        // sendMessage({
        //     type: 'replRestarted',
        //     requestId: -1
        // });
        // startRepl();
        throw ex;
    }
}

async function runCodeSilently(code: string | CodeObject): Promise<any> {
    return runCode(code, 'silent');
}
async function replEvalCode(code, _context, _filename, _callback) {
    return runCode(code);
}

const magics = [new VariableListingMagicCommandHandler()];
export async function execCode(request: RunCellRequest): Promise<void> {
    Utils.instance.currentRequestId = request.requestId ?? Utils.instance.currentRequestId;
    for (const magicHandler of magics) {
        if (magicHandler.isMagicCommand(request)) {
            return magicHandler.handleCommand(request, replServer);
        }
    }
    try {
        const result = await runCode(request.code);
        const execResult: RunCellResponse = {
            requestId: request.requestId,
            success: true,
            result: await formatValue(result),
            type: 'cellExec'
        };
        sendMessage(execResult);
    } catch (ex) {
        const err = ex as Partial<Error> | undefined;
        const execResult: RunCellResponse = {
            requestId: request.requestId,
            success: false,
            ex: { name: err?.name || 'unknown', message: err?.message || 'unknown', stack: err?.stack },
            type: 'cellExec'
        };
        sendMessage(execResult);
    }
}

const originalLoad = Module._load;
Module._load = function (request: any, parent: any) {
    if (parent && request === '@tensorflow/tfjs-core' && parent.filename.includes('@tensorflow/tfjs-vis')) {
        return {};
    }
    if (request === '@tensorflow/tfjs-vis') {
        return TensorflowJsVisualizer.instance;
    }

    // eslint-disable-next-line prefer-rest-params
    const result = originalLoad.apply(this, arguments);
    if (request === 'danfojs-node') {
        DanfoJsFormatter.initialize(runCodeSilently, result);
    }
    return result;
};
