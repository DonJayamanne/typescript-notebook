/* eslint-disable @typescript-eslint/no-explicit-any */
import * as yargs from 'yargs';
import * as WebSocket from 'ws';
import * as fs from 'fs';
import { logErrorMessage, logMessage } from './logger';
import { execCode, initialize } from './codeExecution';
import { Configuration, RequestType } from './types';
import { emitter, initializeComms, sendMessage } from './comms';
import { createDeferred } from '../coreUtils';

const ws = createDeferred<WebSocket>();

const argv = yargs(process.argv).argv;
logMessage(`Started ${argv}`);
const port = 'port' in argv ? (argv.port as number) : 0;
const config = 'config' in argv ? (argv.config as string) : undefined;
let configuration: Configuration | undefined;
try {
    if (config) {
        configuration = JSON.parse(fs.readFileSync(config).toString());
    }
} catch (ex) {
    logErrorMessage(`Failed to read & parse configuration file ${config}`, ex);
}

initialize(configuration);

if (!port) {
    console.error(`Port not provided, got ${JSON.stringify(argv)}`);
    logErrorMessage(`Port not provided, got ${JSON.stringify(argv)}`);
    process.exit(1);
}
function connectToServer(port: number) {
    const url = `ws://localhost:${port}`;
    const connection = new WebSocket(url);
    logMessage('connecting');
    connection.on('open', () => {
        logMessage('initialized');
        ws.resolve(connection);
        initializeComms(connection);
    });

    connection.on('error', (error) => {
        logMessage('Error', error);
        logErrorMessage('WebSocket error', error);
    });

    connection.on('message', (e) => {
        try {
            if (typeof e === 'string') {
                const data: RequestType = JSON.parse(e);
                logMessage(`Kernel got message ${data.type}`);
                switch (data.type) {
                    case 'initialize':
                        sendMessage({ type: 'initialized', requestId: '' });
                        break;
                    case 'ping': {
                        sendMessage({ type: 'pong', requestId: '' });
                        break;
                    }
                    case 'cellExec': {
                        void execCode(data);
                        break;
                    }
                    default:
                        emitter.emit(`onMessage_${data.type}`, data);
                        logErrorMessage(`Unknown message ${data['type']}`);
                        break;
                }
            }
        } catch (ex) {
            logErrorMessage(`Error handling message ${e}`, ex);
        }
    });
}

connectToServer(port);
