import type * as plotly from 'plotly.js';
import { ActivationFunction, OutputItem } from 'vscode-notebook-renderer';
import { errorToJson, noop } from '../extension/coreUtils';
import { GeneratePlot, ResponseType } from '../extension/server/types';
declare const Plotly: typeof plotly;

/* eslint-disable @typescript-eslint/no-explicit-any */

export const activate: ActivationFunction = (context) => {
    return {
        renderOutputItem(outputItem: OutputItem, element: HTMLElement) {
            registerPlotlyScript()
                .then(() => {
                    const json: GeneratePlot = outputItem.json();
                    const existingEle =
                        json.ele && typeof json.ele === 'string' ? document.getElementById(json.ele) : undefined;
                    const ele = existingEle || document.createElement('div');
                    if (json.hidden) {
                        ele.style.display = 'none';
                    }
                    if (!existingEle) {
                        element.appendChild(ele);
                    }
                    Plotly.newPlot(ele, json.data, json.layout)
                        .then((gd) => {
                            if (!json.download || !json.requestId) {
                                return;
                            }
                            Plotly.toImage(gd, {
                                format: json.format || 'png',
                                height: json.layout?.height || 400,
                                width: json.layout?.width || 500
                            })
                                .then((url) => {
                                    if (!context.postMessage) {
                                        return;
                                    }
                                    context.postMessage(<ResponseType>{
                                        type: 'plotGenerated',
                                        success: true,
                                        base64: url,
                                        requestId: json.requestId
                                    });
                                })
                                .catch((ex) => {
                                    if (!context.postMessage) {
                                        return;
                                    }
                                    context.postMessage(<ResponseType>{
                                        type: 'plotGenerated',
                                        success: false,
                                        error: errorToJson(ex),
                                        requestId: json.requestId
                                    });
                                });
                        })
                        .catch(noop);
                })
                .catch(noop);
        }
    };
};

async function registerPlotlyScript() {
    if (globalThis.__plotlyPromise) {
        return globalThis.__plotlyPromise;
    }
    return (globalThis.__plotlyPromise = new Promise<void>((resolve, reject) => {
        const uri = 'https://cdn.plot.ly/plotly-2.3.0.min.js';
        const head = document.head;

        const scriptNode = document.createElement('script');
        scriptNode.src = uri;
        scriptNode.onload = () => {
            resolve();
        };
        scriptNode.onerror = (err) => {
            reject(err);
        };
        head.append(scriptNode);
    }));
}
