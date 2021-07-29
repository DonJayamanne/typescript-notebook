import * as yargs from 'yargs';
import * as WebSocket from 'ws';
import { logErrorMessage, logMessage } from './logger';
import { RequestType } from './types';
import { initializeComms, sendMessage } from './comms';
import { execCode } from './codeExecution';

const argv = yargs(process.argv).argv;
logMessage(`Started ${argv}`);
console.log(argv);
const port = 'port' in argv ? (argv.port as number) : 0;
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
        initializeComms(connection);
    });

    connection.on('error', (error) => {
        logMessage('Error', error);
        logErrorMessage('WebSocket error', error);
    });

    connection.on('message', (e) => {
        logMessage('Got message');
        try {
            if (typeof e === 'string') {
                const data: RequestType = JSON.parse(e);
                switch (data.type) {
                    case 'initialize':
                        sendMessage({ type: 'initialized', requestId: -1 });
                        break;
                    case 'ping': {
                        sendMessage({ type: 'pong', requestId: -1 });
                        break;
                    }
                    case 'cellExec': {
                        execCode(data);
                        break;
                    }
                    default:
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
