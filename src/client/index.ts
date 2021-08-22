/* eslint-disable @typescript-eslint/no-explicit-any */
// declare const tfvis: typeof import('@tensorflow/tfjs-vis');
import * as tfvis from '@tensorflow/tfjs-vis';
import * as tf from '@tensorflow/tfjs-core';
import type { fitCallbacks } from '@tensorflow/tfjs-vis/dist/show/history';
import './index.css';
import { deserialize } from '../extension/serializer';
import { TensorFlowVis, TensorFlowVisRequest } from '../extension/server/types';

console.log('Inside VIS');
const api = acquireVsCodeApi();
window.addEventListener('message', (e) => onMessage(e.data));
api.postMessage({ type: 'loaded', data: 'Hi' });
api.postMessage({ type: 'initialized' });

function onMessage(data?: { _type?: 'helloWorld' } | TensorFlowVis | any) {
    if (!data || !data.type) {
        return;
    }
    switch (data.type) {
        case 'helloWorld':
            api.postMessage({ type: 'helloBack', data: 'Something' });
            break;
        case 'tensorFlowVis': {
            handleTensorFlowMessage(data);
        }
    }
}

const fitCallbackHandlersMappedByContianer = new Map<string, ReturnType<typeof fitCallbacks>>();
function handleTensorFlowMessage(message: TensorFlowVis) {
    switch (message.request) {
        case 'show': {
            tfvis.visor().open();
            break;
        }
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
        case 'history': {
            const promise = tfvis.show.history(
                message.container as any,
                message.history as any,
                message.metrics,
                message.opts
            );
            if (message.requestId) {
                sendPromiseResult(promise, 'history', message.requestId);
            }
            break;
        }
        case 'fitCallback': {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const callbacks = fitCallbackHandlersMappedByContianer.get(JSON.stringify(message.container));
            if (!callbacks) {
                return console.error(`No callbacks registered for ${JSON.stringify(message.container)}`);
            }
            if (callbacks[message.handler]) {
                void callbacks[message.handler](message.iteration, message.log);
            }
            break;
        }
        case 'barchart': {
            const promise = tfvis.render.barchart(message.container as any, message.data, message.opts);
            if (message.requestId) {
                sendPromiseResult(promise, message.request, message.requestId);
            }
            break;
        }
        case 'confusionMatrix': {
            const promise = tfvis.render.confusionMatrix(message.container as any, message.data, message.opts);
            if (message.requestId) {
                sendPromiseResult(promise, message.request, message.requestId);
            }
            break;
        }
        case 'linechart': {
            const promise = tfvis.render.linechart(message.container as any, message.data, message.opts);
            if (message.requestId) {
                sendPromiseResult(promise, message.request, message.requestId);
            }
            break;
        }
        case 'scatterplot': {
            const promise = tfvis.render.scatterplot(message.container as any, message.data, message.opts);
            if (message.requestId) {
                sendPromiseResult(promise, message.request, message.requestId);
            }
            break;
        }
        case 'histogram': {
            const data = deserialize(message.data as unknown as string);
            const promise = tfvis.render.histogram(message.container as any, data, message.opts);
            if (message.requestId) {
                sendPromiseResult(promise, message.request, message.requestId);
            }
            break;
        }
        case 'heatmap': {
            const data: any = message.isTensor ? tf.tensor(message.data as any) : message.data;
            const promise = tfvis.render.heatmap(message.container as any, data, message.opts);
            if (message.requestId) {
                sendPromiseResult(promise, message.request, message.requestId);
            }
            break;
        }
        case 'modelSummary': {
            const data = message.model;
            (data as any).layers = data.layers.map((layer) => {
                const newLayer = layer;
                newLayer.countParams = () => (layer as any).parameters;
                return newLayer;
            });
            const promise = tfvis.show.modelSummary(message.container as any, data);
            if (message.requestId) {
                sendPromiseResult(promise, message.request, message.requestId);
            }
            break;
        }
        default:
            break;
    }
}

function sendPromiseResult(promise: Promise<any>, request: string, requestId: string) {
    promise
        .then(() => {
            api.postMessage(<TensorFlowVisRequest>{
                request: 'history',
                requestId,
                success: true,
                type: 'tensorFlowVis'
            });
        })
        .catch((ex) => {
            const error = ex as Partial<Error> | undefined;
            api.postMessage(<TensorFlowVisRequest>{
                request: 'history',
                requestId,
                success: false,
                type: 'tensorFlowVis',
                error: {
                    message: error?.message,
                    name: error?.name,
                    stack: error?.stack
                }
            });
        });
}
