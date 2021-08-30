/* eslint-disable @typescript-eslint/no-explicit-any */
import './index.css';
import * as tfvis from '@tensorflow/tfjs-vis';
import { ActivationFunction, OutputItem, RendererContext } from 'vscode-notebook-renderer';
import { TensorFlowVis } from '../extension/server/types';
import { Logs } from '@tensorflow/tfjs-layers';
interface FitCallbackHandlers {
    [key: string]: (iteration: number, log: Logs) => Promise<void>;
}
function getContainer(container: any, ele: HTMLElement) {
    if (typeof container !== 'string') {
        return ele;
    }
    return document.getElementById(container) || ele;
}

const containerMappings = new Map<string, HTMLElement>();
const containerMappingsByOutputItemId = new Map<string, string>();
const containerFitCallbacks = new Map<string, FitCallbackHandlers>();
let registered = false;
function registerCallbackHandler(context: RendererContext<any>) {
    if (registered) {
        return;
    }
    registered = true;
    if (!context.onDidReceiveMessage) {
        return;
    }
    context.onDidReceiveMessage((e) => {
        if (e && e.type !== 'tensorFlowVis') {
            return;
        }
        const message = e as TensorFlowVis;
        if (message.request === 'show' || message.request === 'setactivetab') {
            return;
        }
        if (message.request === 'fitcallback') {
            const handler = containerFitCallbacks.get(JSON.stringify(message.container));
            if (!handler) {
                return;
            }
            handler[message.handler](message.iteration, message.log);
            return;
        }
        const element = containerMappings.get(JSON.stringify(message.container));
        if (!element) {
            return;
        }
        // Update the existing plots in place.
        renderTensorflowVis(undefined, message, element);
    });
}

function renderTensorflowVis(outputItemId: string | undefined, data: TensorFlowVis, element: HTMLElement) {
    if (data.request === 'setactivetab' || data.request === 'show') {
        return;
    }

    const containerId = JSON.stringify(data.container);
    containerMappings.set(containerId, getContainer(data.container, element));
    if (outputItemId) {
        containerMappingsByOutputItemId.set(outputItemId, containerId);
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
        case 'modelsummary':
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
            console.error(data, JSON.stringify(data));
            tfvis.render.linechart(getContainer(data.container, element), data.data, data.opts);
            break;
        case 'confusionmatrix':
            tfvis.render.confusionMatrix(getContainer(data.container, element), data.data, data.opts);
            break;
        case 'histogram':
            tfvis.render.histogram(getContainer(data.container, element), data.data, data.opts);
            break;
        case 'heatmap':
            tfvis.render.heatmap(getContainer(data.container, element), data.data, data.opts);
            break;
        case 'perclassaccuracy':
            tfvis.show.perClassAccuracy(getContainer(data.container, element), data.classAccuracy, data.classLabels);
            break;
        case 'layer':
            tfvis.show.layer(getContainer(data.container, element), data.layer);
            break;
        case 'registerfitcallback':
            const handlers = tfvis.show.fitCallbacks(getContainer(data.container, element), data.metrics, data.opts);
            containerFitCallbacks.set(containerId, handlers);
            break;
        case 'valuesdistribution': {
            // const values = (data as any).values;
            // const stats = (data as any).stats;
            // tfvis.render.histogram(getContainer(data.container, element), values, { height: 150, stats });
            tfvis.show.valuesDistribution(getContainer(data.container, element), data.tensor);
            break;
        }
        case 'table':
            tfvis.render.table(getContainer(data.container, element), data.data, data.opts);
            break;
        default:
            return;
    }
}
export const activate: ActivationFunction = (context) => {
    registerCallbackHandler(context);
    return {
        disposeOutputItem(id?: string) {
            if (!id || !context.postMessage) {
                return;
            }
            const containerId = containerMappingsByOutputItemId.get(id);
            if (!containerId) {
                return;
            }
            containerMappings.delete(containerId);
            containerFitCallbacks.delete(containerId);
            context.postMessage({
                type: 'tfvisCleared',
                containerId
            });
        },
        renderOutputItem(outputItem: OutputItem, element: HTMLElement) {
            const data = outputItem.json() as TensorFlowVis;
            if (data.request === 'setactivetab' || data.request === 'show') {
                return;
            }

            // tfvis sets max width to 550px.
            // https://github.com/tensorflow/tfjs/blob/master/tfjs-vis/src/components/surface.tsx#L36
            // modelSummary is an html table, no need to limit the width.
            if (data.request !== 'modelsummary' && data.request !== 'table') {
                element.style.maxWidth = '550px';
            }
            if (data.container && typeof data.container === 'object' && 'name' in data.container) {
                const label = document.createElement('h2');
                label.innerText = data.container.name;
                label.style.textAlign = 'center';
                element.appendChild(label);
                const containerEle = document.createElement('div');
                element.appendChild(containerEle);
                element = containerEle;
            }
            renderTensorflowVis(outputItem.id, data, element);
        }
    };
};
