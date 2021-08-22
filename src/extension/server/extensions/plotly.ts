import type * as plotly from 'plotly.js';
import * as fs from 'fs/promises';
import * as tmp from 'tmp';
import { addMessageHandler, removeMessageHandler, sendMessage } from '../comms';
import { v4 as uuid } from 'uuid';
import { ResponseType } from '../types';
import { errorFromJson } from '../../coreUtils';

export const Plotly = {
    async toBase64(data: plotly.Data[], layout: plotly.Layout, format?: 'png' | 'svg' | 'jpeg'): Promise<string> {
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
    },
    async toFile(
        data: plotly.Data[],
        layout: plotly.Layout,
        format?: 'png' | 'svg' | 'jpeg',
        file?: string
    ): Promise<string> {
        const base64 = await Plotly.toBase64(data, layout, format);
        file =
            file ||
            (await new Promise<string>((resolve, reject) => {
                tmp.file({ postfix: `.${format || 'png'}` }, (err, path, _, cleanupCallback) => {
                    if (err) {
                        return reject(err);
                    }
                    resolve(path);
                });
            }));
        await fs.writeFile(file, Buffer.from(base64.substring(base64.indexOf(',') + 1), 'base64'));
        return file;
    },
    async newPlot(ele: string, data: plotly.Data[], layout: plotly.Layout): Promise<void> {
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
};
