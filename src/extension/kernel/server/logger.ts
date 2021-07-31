import * as util from 'util';
import * as fs from 'fs';
import { LogMessage } from './types';
import { sendMessage } from './comms';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function logErrorMessage(...param: any[]) {
    log('error', ...param);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function logMessage(...param: any[]) {
    log('info', ...param);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function log(category: 'info' | 'error', ...param: any[]) {
    const msg: LogMessage = {
        type: 'logMessage',
        requestId: '',
        category,
        message: util.format(...param)
    };
    logToFile(msg.message);
    sendMessage(msg);
}

function logToFile(message: string) {
    fs.appendFileSync(
        '/Users/donjayamanne/Desktop/Development/vsc/vscode-typescript-notebook/log.log',
        `${message}\n\n---------------------------\n`
    );
}
