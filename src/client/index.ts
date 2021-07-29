// declare const tfvis: typeof import('@tensorflow/tfjs-vis');
import * as tfvis from '@tensorflow/tfjs-vis';
import type { fitCallbacks } from '@tensorflow/tfjs-vis/dist/show/history';
import './index.css';
import { TensorFlowVis } from './types';

console.log('Inside VIS');
const api = acquireVsCodeApi();
window.addEventListener('message', (e) => onMessage(e.data));
initialize();
api.postMessage({ type: 'loaded', data: 'Hi' });
api.postMessage({ type: 'initialized' });

function initialize() {
    console.log('initialized');
    const button = document.getElementById('test');
    console.log('button = ', button);
    button?.addEventListener('click', () => {
        console.log('clicked');
        button.innerText = 'Clicked';
        api.postMessage({ type: 'clicked', data: 'Clicked the button' });
        tfvis.visor();
    });
    console.log('initialized2');
}
function onMessage(data?: { _type?: 'helloWorld' } | TensorFlowVis | any) {
    if (!data || !data._type) {
        return;
    }
    console.error(`Got message ${data._type}`);
    switch (data._type) {
        case 'helloWorld':
            // console.log('got Message');
            api.postMessage({ type: 'helloBack', data: 'Something' });
            break;
        case 'tensorFlowVis': {
            handleTensorFlowMessage(data);
        }
    }
}

const fitCallbackHandlersMappedByContianer = new Map<string, ReturnType<typeof fitCallbacks>>();
function handleTensorFlowMessage(message: TensorFlowVis) {
    console.error(`Got Tensor message ${message.request}`);
    switch (message.request) {
        case 'show':
            tfvis.visor().open();
            break;
        case 'setActiveTab':
            tfvis.visor().setActiveTab(message.tabName);
            break;
        case 'registerFitCallback': {
            // const callbacks = tfvis.show.fitCallbacks(message.container as any, message.metrics, message.opts);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const callbacks = tfvis.show.fitCallbacks(message.container as any, message.metrics);
            fitCallbackHandlersMappedByContianer.set(JSON.stringify(message.container), callbacks);
            break;
        }
        case 'fitCallback': {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const callbacks = fitCallbackHandlersMappedByContianer.get(JSON.stringify(message.container));
            if (!callbacks) {
                return console.error(`No callbacks registered for ${JSON.stringify(message.container)}`);
            }
            console.error(`Execute ${message.handler} ${typeof callbacks[message.handler]}`);
            if (callbacks[message.handler]) {
                callbacks[message.handler](message.iteration, message.log);
            }
            break;
        }
        default:
            break;
    }
}
