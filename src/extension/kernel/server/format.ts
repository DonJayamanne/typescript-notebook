import * as kindOf from 'kind-of';
import * as fileType from 'file-type';
import { logMessage } from './logger';
import { DisplayData } from './types';
import { DanfoJsFormatter } from './danfoFormatter';
import { formatTensor, isTensor } from './tensorFormatter';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const isTypedArray = require('is-typed-array');

export async function formatValue(value: unknown) {
    if (kindOf(value) === 'buffer' || isTypedArray(value)) {
        const buffer: Buffer = kindOf(value) === 'buffer' ? (value as Buffer) : Buffer.from(value as any);
        try {
            const type = await fileType.fromBuffer(buffer);
            if (type?.mime.startsWith('image/')) {
                return <DisplayData>{
                    type: 'image',
                    value: buffer.toString('base64'),
                    mime: type.mime,
                    ext: type.ext
                };
            }
        } catch (ex) {
            logMessage('Unable to get type', ex);
        }
    } else if (isTensor(value)) {
        return formatTensor(value);
    } else if (value && Array.isArray(value)) {
        return <DisplayData>{
            type: 'array',
            value: value,
            json: value
        };
    } else if (value && DanfoJsFormatter.instance.canFormatAsDanfo(value)) {
        return DanfoJsFormatter.instance.formatDanfoObject(value);
    } else if (value && typeof value === 'object' && value.constructor?.name === 'Tensor') {
        return <DisplayData>{
            type: 'tensor',
            value: value,
            json: JSON.parse(JSON.stringify(value))
        };
    } else if (value && typeof value === 'object') {
        return <DisplayData>{
            type: 'json',
            value: value,
            json: value
        };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((value as any) || '').toString() as DisplayData;
}
