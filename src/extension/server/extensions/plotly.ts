import type * as plotly from 'plotly.js';
import { addMessageHandler, removeMessageHandler, sendMessage } from '../comms';
import { v4 as uuid } from 'uuid';
import { ResponseType } from '../types';
import { errorFromJson } from '../../coreUtils';

export class Plotly {
    public static readonly instance = new Plotly();
    public async downloadPlot(
        data: plotly.Data[],
        layout: plotly.Layout,
        format?: 'png' | 'svg' | 'jpeg'
    ): Promise<string> {
        const id = uuid().replace(/-/g, '');
        sendMessage({
            type: 'output',
            data: {
                type: 'generatePlog',
                data,
                layout,
                requestId: id,
                download: true,
                format,
                hidden: true
            }
        });
        return new Promise<string>((resolve, reject) => {
            const messageHandler = (data: ResponseType) => {
                if (data.type === 'plotGenerated' && data.requestId === id) {
                    removeMessageHandler('plotGenerated', messageHandler);
                    if (data.success) {
                        resolve(data.base64);
                    } else {
                        reject(errorFromJson(data.error));
                    }
                }
            };
            addMessageHandler('plotGenerated', messageHandler);
        });
    }
    public async newPlot(ele: string, data: plotly.Data[], layout: plotly.Layout): Promise<void> {
        sendMessage({
            type: 'output',
            data: {
                type: 'generatePlog',
                ele,
                data,
                layout
            }
        });
    }
}
