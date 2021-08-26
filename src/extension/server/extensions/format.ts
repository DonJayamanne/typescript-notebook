import * as kindOf from 'kind-of';
import * as fileType from 'file-type';
import * as util from 'util';
import * as fs from 'fs/promises';
import { logMessage } from '../logger';
import { DisplayData } from '../types';
import { DanfoJsFormatter } from './danfoFormatter';
import { formatTensor, isTensor } from './tensorFormatter';

export function isBase64OrSvg(value: string) {
    return value.startsWith('data:image/') || (value.endsWith('</svg>') && value.includes('<svg'));
}
function utilInspect(value) {
    return util.inspect(value, { colors: true, compact: false });
}
export async function formatImage(image: string | Buffer | Uint8Array): Promise<DisplayData | undefined> {
    if (typeof image !== 'string') {
        return formatValue(image);
    }
    if (typeof image === 'string' && isBase64OrSvg(image)) {
        return formatValue(image);
    }
    // Sometimes the value could be a file path.
    try {
        const buffer = await fs.readFile(image);
        const type = await fileType.fromBuffer(buffer);
        if (type?.mime.startsWith('image/')) {
            return formatValue(`data:${type.mime};base64,${buffer.toString('base64')}`);
        }
    } catch (ex) {
        logMessage('Unable to get image type', ex);
    }
}
export async function formatValue(value: unknown): Promise<DisplayData | undefined> {
    if (typeof value === undefined) {
        return;
    } else if (typeof value === 'string' && value.startsWith('data:image/')) {
        return {
            type: 'multi-mime',
            value: [
                {
                    type: 'image',
                    value: value.substring(value.indexOf(',') + 1),
                    mime: value.substring(value.indexOf(':') + 1, value.indexOf(';'))
                },
                {
                    type: 'text',
                    value
                }
            ]
        };
    } else if (typeof value === 'string' && value.endsWith('</svg>') && value.includes('<svg')) {
        return {
            type: 'multi-mime',
            value: [
                {
                    type: 'image',
                    value: value,
                    mime: 'svg+xml'
                },
                {
                    type: 'text',
                    value
                }
            ]
        };
    } else if (kindOf(value) === 'buffer' || util.types.isTypedArray(value)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const buffer: Buffer = kindOf(value) === 'buffer' ? (value as Buffer) : Buffer.from(value as any);
        try {
            const type = await fileType.fromBuffer(buffer);
            if (type?.mime.startsWith('image/')) {
                return {
                    type: 'image',
                    value: buffer.toString('base64'),
                    mime: type.mime
                };
            }
        } catch (ex) {
            logMessage('Unable to get type', ex);
        }
        // Return as plain text.
        return { type: 'text', value: buffer.toString() };
    } else if (isTensor(value)) {
        return formatTensor(value);
    } else if (value && Array.isArray(value)) {
        return {
            type: 'text',
            value: utilInspect(value) // stringify(value) // We use this in case we have circular references in the Objects.
        };
    } else if (value && DanfoJsFormatter.instance.canFormatAsDanfo(value)) {
        return DanfoJsFormatter.instance.formatDanfoObject(value);
    } else if (value && typeof value === 'object' && value.constructor?.name === 'Tensor') {
        return {
            type: 'text',
            value: utilInspect(value) // We use this in case we have circular references in the Objects.
        };
    } else if (value && typeof value === 'object') {
        return {
            type: 'text',
            value: utilInspect(value) // We use this in case we have circular references in the Objects.
        };
    }
    // If there's no output, then nothing to return.
    if (typeof value === 'undefined') {
        return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { type: 'text', value: utilInspect(value) };
}
