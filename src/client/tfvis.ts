/* eslint-disable @typescript-eslint/no-explicit-any */
import * as tfvis from '@tensorflow/tfjs-vis';
import { ActivationFunction, OutputItem } from 'vscode-notebook-renderer';
import { TensorFlowVis } from '../extension/server/types';
export const activate: ActivationFunction = (context) => {
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
                    tfvis.render.barchart(element as any, data.data, data.opts);
                    break;
                case 'linechart':
                    tfvis.render.linechart(element as any, data.data, data.opts);
                    break;
                case 'confusionMatrix':
                    tfvis.render.confusionMatrix(element as any, data.data, data.opts);
                    break;
                case 'histogram':
                    tfvis.render.histogram(element as any, data.data, data.opts);
                    break;
                case 'heatmap':
                    tfvis.render.heatmap(element as any, data.data, data.opts);
                    break;
                default:
                    break;
            }
        }
    };
};
