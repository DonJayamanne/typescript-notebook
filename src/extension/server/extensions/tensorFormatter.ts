import type * as tfTypes from '@tensorflow/tfjs';
import { DisplayData } from '../types';
// import { Container } from '@tensorflow/tfjs-layers/dist/engine/container';
// import { Layer, Node } from '@tensorflow/tfjs-layers/dist/engine//topology';

export function isTensor(tensor: unknown) {
    return tensor && typeof tensor === 'object' && tensor.constructor.name === 'Tensor';
}

export function formatTensor(data: unknown): DisplayData {
    const value = data as tfTypes.Tensor;
    return {
        type: 'multi-mime',
        value: [
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
