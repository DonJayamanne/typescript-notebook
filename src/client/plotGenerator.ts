import { ActivationFunction, OutputItem } from 'vscode-notebook-renderer';
import { errorToJson, noop } from '../extension/coreUtils';
import { GeneratePlot, ResponseType } from '../extension/server/types';
const Plotly = require('plotly.js-dist') as typeof import('plotly.js');
/* eslint-disable @typescript-eslint/no-explicit-any */

export const activate: ActivationFunction = (context) => {
    return {
        renderOutputItem(outputItem: OutputItem, element: HTMLElement) {
            const json: GeneratePlot = outputItem.json();
            const existingEle =
                json.ele && typeof json.ele === 'string' ? document.getElementById(json.ele) : undefined;
            const ele = existingEle || document.createElement('div');
            if (json.hidden) {
                element.style.display = 'none';
            }
            if (!existingEle) {
                element.appendChild(ele);
            }
            console.log('Generating Plot');
            try {
                Plotly.newPlot(ele, json.data, json.layout)
                    .then((gd) => {
                        console.log('Generated Plot', gd);
                        if (!json.download || !json.requestId) {
                            console.log('Nothing to do with Plot');
                            return;
                        }
                        console.log('Converting to bytes');
                        Plotly.toImage(gd, {
                            format: json.format || 'png',
                            height: json.layout?.height || 400,
                            width: json.layout?.width || 500
                        })
                            .then((url) => {
                                console.log('Got Url');
                                if (!context.postMessage) {
                                    return;
                                }
                                console.log('sent  Url');
                                context.postMessage(<ResponseType>{
                                    type: 'plotGenerated',
                                    success: true,
                                    base64: url,
                                    requestId: json.requestId
                                });
                            })
                            .catch((ex) => {
                                console.log('Generating failed', ex);
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
                    .catch((ex) => {
                        console.error('Failed to generate bytes of plot', ex);
                    });
            } catch (ex) {
                console.error('Failed to generate plot', ex);
            }
        }
    };
};
