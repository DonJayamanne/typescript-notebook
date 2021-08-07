import type * as tf from '@tensorflow/tfjs';
import { DisplayData } from '../types';

export function isTensor(tensor: unknown) {
    return tensor && typeof tensor === 'object' && tensor.constructor.name === 'Tensor';
}

export function formatTensor(data: unknown): DisplayData {
    const value = data as tf.Tensor;
    return {
        type: 'multi-mime',
        data: [
            {
                type: 'html',
                value: `<div><pre>${value.toString()}</pre></div>`
            },
            {
                type: 'json',
                value
            }
        ]
    };
}
