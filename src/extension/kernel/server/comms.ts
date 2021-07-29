import { createDeferred } from '../../coreUtils';
import { ResponseType } from './types';
import * as WebSocket from 'ws';

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
