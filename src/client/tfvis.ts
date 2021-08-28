/* eslint-disable @typescript-eslint/no-explicit-any */
import './index.css';
import * as tfvis from '@tensorflow/tfjs-vis';
import { ActivationFunction, OutputItem } from 'vscode-notebook-renderer';
import { TensorFlowVis } from '../extension/server/types';
function getContainer(container: any, ele: HTMLElement) {
    if (typeof container !== 'string') {
        return ele;
    }
    return document.getElementById(container) || ele;
}
export const activate: ActivationFunction = (context) => {
    return {
        renderOutputItem(outputItem: OutputItem, element: HTMLElement) {
            const data = outputItem.json() as TensorFlowVis;

            // tfvis sets max width to 550px.
            // https://github.com/tensorflow/tfjs/blob/master/tfjs-vis/src/components/surface.tsx#L36
            // modelSummary is an html table, no need to limit the width.
            if (data.request !== 'modelSummary') {
                element.style.maxWidth = '550px';
            }

            switch (data.request) {
                case 'history':
                    tfvis.show.history(
                        getContainer(data.container, element),
                        data.history as any,
                        data.metrics as any,
                        data.opts as any
                    );
                    break;
                case 'scatterplot':
                    tfvis.render.scatterplot(getContainer(data.container, element), data.data, data.opts);
                    break;
                case 'modelSummary':
                    const model = data.model;
                    (model as any).layers = model.layers.map((layer) => {
                        const newLayer = layer;
                        newLayer.countParams = () => (layer as any).parameters;
                        return newLayer;
                    });
                    tfvis.show.modelSummary(getContainer(data.container, element), model);
                    break;
                case 'barchart':
                    tfvis.render.barchart(getContainer(data.container, element), data.data, data.opts);
                    break;
                case 'linechart':
                    tfvis.render.linechart(getContainer(data.container, element), data.data, data.opts);
                    break;
                case 'confusionMatrix':
                    tfvis.render.confusionMatrix(getContainer(data.container, element), data.data, data.opts);
                    break;
                case 'histogram':
                    tfvis.render.histogram(getContainer(data.container, element), data.data, data.opts);
                    break;
                case 'heatmap':
                    tfvis.render.heatmap(getContainer(data.container, element), data.data, data.opts);
                    break;
                default:
                    break;
            }
        }
    };
};
