import { RequestType, ResponseType } from './types';
import * as WebSocket from 'ws';
import { EventEmitter } from 'events';
import { createDeferred } from '../coreUtils';
import { format } from 'util';
const stringify = require('json-stringify-safe');

const ws = createDeferred<WebSocket>();
const messagesToSend: ResponseType[] = [];
export function initializeComms(websocket: WebSocket) {
    ws.resolve(websocket);
}
export function sendMessage(message: ResponseType) {
    messagesToSend.push(message);
    ws.promise.then((websocket) => {
        while (messagesToSend.length) {
            const message = messagesToSend.shift();
            if (!message) {
                continue;
            }
            try {
                websocket.send(stringify(message));
            } catch (ex) {
                sendMessage({
                    type: 'logMessage',
                    category: 'error',
                    message: format(`Failed to send a message ${message.type}`, ex)
                });
            }
        }
    });
}

export const emitter = new EventEmitter();
export function addMessageHandler(type: RequestType['type'], listener: (message: any) => void) {
    emitter.on(`onMessage_${type}`, listener);
}
export function removeMessageHandler(type: RequestType['type'], listener: (message: any) => void) {
    emitter.off(`onMessage_${type}`, listener);
}
