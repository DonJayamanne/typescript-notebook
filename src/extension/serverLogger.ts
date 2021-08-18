import { OutputChannel, window } from 'vscode';
import { IDisposable } from './types';
import { registerDisposable } from './utils';
import * as util from 'util';

export class ServerLogger implements IDisposable {
    private static output: OutputChannel;
    constructor() {
        ServerLogger.output = window.createOutputChannel('TypeScript Kernel');
    }
    public static register() {
        registerDisposable(new ServerLogger());
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public static appendLine(...params: any[]) {
        const message = util.format(params[0], ...params.slice(1));
        ServerLogger.output.appendLine(message);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public static append(...params: any[]) {
        const message = util.format(params[0], ...params.slice(1));
        ServerLogger.output.append(message);
    }

    public dispose() {
        ServerLogger.output.dispose();
    }
}
