/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import type * as tfvis from '@tensorflow/tfjs-vis';
import type { Tensor } from '@tensorflow/tfjs';
import type {
    BarChartOpts,
    ConfusionMatrixData,
    ConfusionMatrixOptions,
    HeatmapData,
    HeatmapOptions,
    HistogramOpts,
    SurfaceInfo,
    SurfaceInfoStrict,
    TableData,
    TypedArray,
    XYPlotData,
    XYPlotOptions
} from '@tensorflow/tfjs-vis';
import type { VisorComponent } from '@tensorflow/tfjs-vis/dist/components/visor';
import type { fitCallbacks } from '@tensorflow/tfjs-vis/dist/show/history';
import type { Visor } from '@tensorflow/tfjs-vis/dist/visor';
import type { Logs } from '@tensorflow/tfjs-layers/dist/logs';
import { Layer } from '@tensorflow/tfjs-layers/dist/engine/topology';
import { LayersModel } from '@tensorflow/tfjs-layers/dist/engine/training';
import { TensorFlowVisRequest } from '../types';
import { sendMessage } from '../comms';
import { generateId } from '../../coreUtils';
import { serialize } from '../../serializer';

class VisorProxy {
    constructor(
        private visorComponent: VisorComponent,
        visorEl: HTMLElement,
        private surfaceList: Map<string, SurfaceInfoStrict>,
        private renderVisor: (domNode: HTMLElement, surfaceList: Map<string, SurfaceInfoStrict>) => VisorComponent
    ) {}
    el!: HTMLElement;
    public __mock() {
        console.log(this.visorComponent);
        console.log(this.surfaceList);
        console.log(this.renderVisor);
        console.log(this.el);
    }
    surface(options: tfvis.SurfaceInfo): { container: HTMLElement; label: HTMLElement; drawArea: HTMLElement } {
        throw new Error(`Method not implemented. ${options}`);
    }
    isFullscreen(): boolean {
        return true;
    }
    isOpen(): boolean {
        return true;
    }
    close(): void {
        //
    }
    open(): void {
        sendMessage({
            type: 'tensorFlowVis',
            request: 'show'
        });
    }
    toggle(): void {
        //
    }
    toggleFullScreen(): void {
        //
    }
    bindKeys(): void {
        //
    }
    unbindKeys(): void {
        //
    }
    setActiveTab(tabName: string): void {
        sendMessage({
            type: 'tensorFlowVis',
            request: 'setActiveTab',
            tabName
        });
    }
}
class ShowProxy {
    public requestId: string = generateId();
    public fitCallbacks(
        container: SurfaceInfo,
        metrics: string[],
        opts?: { callbacks?: string[] }
    ): ReturnType<typeof fitCallbacks> {
        const callbackNames = opts?.callbacks || ['onEpochEnd', 'onBatchEnd'];
        const requestId = this.requestId;
        sendMessage({
            type: 'tensorFlowVis',
            request: 'registerFitCallback',
            container,
            requestId,
            metrics,
            opts
        });
        const handlers: ReturnType<typeof fitCallbacks> = {};
        function createHandler(callbackName: string) {
            return async (iteration: number, log: Logs) => {
                sendMessage({
                    type: 'tensorFlowVis',
                    request: 'fitCallback',
                    container,
                    requestId,
                    handler: callbackName,
                    iteration,
                    log
                });
            };
        }
        callbackNames.forEach((callbackName) => {
            handlers[callbackName] = createHandler(callbackName);
        });
        return handlers;
    }
    public async history(container: SurfaceInfo | string, history: {}, metrics: string[], opts?: {}): Promise<void> {
        sendMessage({
            type: 'tensorFlowVis',
            request: 'history',
            requestId: this.requestId,
            container,
            history,
            metrics,
            opts
        });
        await waitForMessage('history', this.requestId);
    }
    public async showPerClassAccuracy(
        container: SurfaceInfo | string,
        classAccuracy: Array<{
            accuracy: number;
            count: number;
        }>,
        classLabels?: string[]
    ): Promise<void> {
        const id = generateId();
        sendMessage({
            type: 'tensorFlowVis',
            request: 'showPerClassAccuracy',
            requestId: id,
            container,
            classAccuracy,
            classLabels
        });
        await waitForMessage('showPerClassAccuracy', id);
    }
    public async valuesDistribution(container: SurfaceInfo | string, tensor: Tensor): Promise<void> {
        const id = generateId();
        sendMessage({
            type: 'tensorFlowVis',
            request: 'valuesDistribution',
            container,
            requestId: id,
            tensor: TensorflowJsVisualizer.serializeTensor(tensor) as any
        });
        await waitForMessage('valuesDistribution', id);
    }
    public async layer(container: SurfaceInfo | string, layer: Layer): Promise<void> {
        const id = generateId();
        sendMessage({
            type: 'tensorFlowVis',
            request: 'layer',
            requestId: id,
            container,
            layer
        });
        await waitForMessage('layer', id);
    }
    public async modelSummary(container: SurfaceInfo | string, model: LayersModel): Promise<void> {
        const id = generateId();
        const layers = model.layers.map((layer) => {
            return {
                outputShape: layer.outputShape,
                name: layer.name,
                parameters: layer.countParams()
            };
        });
        const slimmedModel = { layers };

        sendMessage({
            type: 'tensorFlowVis',
            request: 'modelSummary',
            requestId: id,
            container,
            model: slimmedModel as any
        });
        await waitForMessage('modelSummary', id);
    }

    // perClassAccuracy: typeof showPerClassAccuracy;
    // valuesDistribution: typeof valuesDistribution;
    // layer: typeof layer;
    // modelSummary: typeof modelSummary;
}

async function waitForMessage(_request: TensorFlowVisRequest['request'], _requestId: string) {
    return;
    // return new Promise<void>((resolve, reject) => {
    //     const handler = (message: TensorFlowVisRequest) => {
    //         if (message.requestId === requestId && message.request === request) {
    //             removeMessageHandler('tensorFlowVis', handler);
    //             if (message.success) {
    //                 resolve();
    //             } else {
    //                 const ex = new Error(message.error?.message || 'unknown error');
    //                 ex.name = message.error?.name || ex.name;
    //                 ex.stack = message.error?.stack || ex.stack;
    //                 reject(ex);
    //             }
    //         }
    //     };
    //     addMessageHandler('tensorFlowVis', handler);
    // });
}
class RendererProxy {
    public async barchart(
        container: SurfaceInfo | string,
        data: Array<{
            index: number;
            value: number;
        }>,
        opts?: BarChartOpts
    ): Promise<void> {
        const id = generateId();
        sendMessage({
            type: 'tensorFlowVis',
            request: 'barchart',
            requestId: id,
            container,
            data,
            opts
        });
        await waitForMessage('barchart', id);
    }
    public table(
        container: SurfaceInfo | string,
        data: TableData,
        opts?: {
            fontSize?: number;
        }
    ) {
        sendMessage({
            type: 'tensorFlowVis',
            request: 'table',
            container,
            data,
            opts
        });
    }
    public async histogram(
        container: SurfaceInfo | string,
        data:
            | Array<{
                  value: number;
              }>
            | number[]
            | TypedArray,
        opts?: HistogramOpts
    ): Promise<void> {
        const id = generateId();
        sendMessage({
            type: 'tensorFlowVis',
            request: 'histogram',
            requestId: id,
            container,
            data: serialize(data) as any, // We'll deserialize this at our end.
            opts
        });
        await waitForMessage('histogram', id);
    }
    public async linechart(container: SurfaceInfo | string, data: XYPlotData, opts?: XYPlotOptions): Promise<void> {
        const id = generateId();
        sendMessage({
            type: 'tensorFlowVis',
            request: 'linechart',
            requestId: id,
            container,
            data,
            opts
        });
        await waitForMessage('linechart', id);
    }
    public async scatterplot(container: SurfaceInfo | string, data: XYPlotData, opts?: XYPlotOptions): Promise<void> {
        const id = generateId();
        sendMessage({
            type: 'tensorFlowVis',
            request: 'scatterplot',
            requestId: id,
            container,
            data,
            opts
        });
        await waitForMessage('scatterplot', id);
    }
    public async confusionMatrix(
        container: SurfaceInfo | string,
        data: ConfusionMatrixData,
        opts?: ConfusionMatrixOptions
    ): Promise<void> {
        const id = generateId();
        sendMessage({
            type: 'tensorFlowVis',
            request: 'confusionMatrix',
            requestId: id,
            container,
            data,
            opts
        });
        await waitForMessage('confusionMatrix', id);
    }
    public async heatmap(container: SurfaceInfo | string, data: HeatmapData, opts?: HeatmapOptions): Promise<void> {
        const id = generateId();
        let isTensor = false;
        let dataToSend: any = data;
        if (!Array.isArray(data)) {
            isTensor = true;
            dataToSend = await TensorflowJsVisualizer.serializeTensor(data as any);
            // Serialize as a tensor2D.
        }
        sendMessage({
            type: 'tensorFlowVis',
            request: 'heatmap',
            requestId: id,
            container,
            data: dataToSend,
            isTensor,
            opts
        });
        await waitForMessage('heatmap', id);
    }
}

const _visor: Visor = new VisorProxy(undefined as any, undefined as any, undefined as any, undefined as any) as any;

export class TensorflowJsVisualizer {
    public static async serializeTensor(tensor: Tensor) {
        return tensor.array();
    }
    public static instance = {
        show: new ShowProxy(),
        render: new RendererProxy(),
        visor: () => _visor,
        version_vis: '1.5.1'
    };
}
