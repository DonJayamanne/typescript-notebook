/* eslint-disable @typescript-eslint/no-explicit-any */
// declare const tfvis: typeof import('@tensorflow/tfjs-vis');
import * as tfvis from '@tensorflow/tfjs-vis';
import { ActivationFunction, OutputItem } from 'vscode-notebook-renderer';
import type { fitCallbacks } from '@tensorflow/tfjs-vis/dist/show/history';
import { TensorFlowFitCallback, TensorFlowVis } from '../extension/server/types';
// import './index.css';
// import * as tf from '@tensorflow/tfjs-core';
// import type { fitCallbacks } from '@tensorflow/tfjs-vis/dist/show/history';
// import { deserialize } from '../extension/serializer';
// import { TensorFlowVis, TensorFlowVisRequest } from '../extension/server/types';

const fitCallbackHandlersMappedByContianer = new Map<string, ReturnType<typeof fitCallbacks>>();
export const activate: ActivationFunction = (context) => {
    if (context.onDidReceiveMessage) {
        context.onDidReceiveMessage((data?: TensorFlowFitCallback) => {
            if (data?.request === 'fitCallback') {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const callbacks = fitCallbackHandlersMappedByContianer.get(JSON.stringify(data.container));
                if (!callbacks) {
                    return console.error(`No callbacks registered for ${JSON.stringify(data.container)}`);
                }
                if (callbacks[data.handler]) {
                    void callbacks[data.handler](data.iteration, data.log);
                }
            }
        });
    }
    return {
        renderOutputItem(outputItem: OutputItem, element: HTMLElement) {
            const data = outputItem.json() as TensorFlowVis;
            switch (data.request) {
                case 'history':
                    tfvis.show.history(element as any, data.history as any, data.metrics as any, data.opts as any);
                    break;
                case 'scatterplot':
                    tfvis.render.scatterplot(element as any, data.data, data.opts);
                    break;
                case 'modelSummary':
                    const model = data.model;
                    (model as any).layers = model.layers.map((layer) => {
                        const newLayer = layer;
                        newLayer.countParams = () => (layer as any).parameters;
                        return newLayer;
                    });
                    tfvis.show.modelSummary(element as any, model);
                    break;
                case 'barchart':
                    tfvis.render.barchart(element as any, data.data);
                    break;
                case 'registerFitCallback':
                    {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const callbacks = tfvis.show.fitCallbacks(element, data.metrics);
                        fitCallbackHandlersMappedByContianer.set(JSON.stringify(data.container), callbacks);
                        if (context.postMessage) {
                            context.postMessage({
                                type: 'tensorFlowVis',
                                requestId: data.requestId,
                                message: 'registerFitCallback'
                            });
                        }
                    }
                    break;
                // case 'fitCallback': {
                //     // eslint-disable-next-line @typescript-eslint/no-explicit-any
                //     const callbacks = fitCallbackHandlersMappedByContianer.get(JSON.stringify(data.container));
                //     if (!callbacks) {
                //         return console.error(`No callbacks registered for ${JSON.stringify(data.container)}`);
                //     }
                //     if (callbacks[data.handler]) {
                //         void callbacks[data.handler](data.iteration, data.log);
                //     }
                //     break;
                // }
                default:
                    break;
            }
        }
    };
};
