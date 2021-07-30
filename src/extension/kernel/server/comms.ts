import { createDeferred } from '../../coreUtils';
import { RequestType, ResponseType } from './types';
import * as WebSocket from 'ws';
import { EventEmitter } from 'stream';

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
            websocket.send(JSON.stringify(message));
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
