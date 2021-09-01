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
import { sendMessage } from '../comms';
import { serialize } from '../../serializer';
import { heatmap } from './heatmap';

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
            requestId: TensorflowJsVisualizer.requestId,
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
            request: 'setactivetab',
            requestId: TensorflowJsVisualizer.requestId,
            tabName
        });
    }
}
/*
 * Gets summary stats and shape for all weights in a layer.
 */
async function getLayerDetails(layer: Layer, math: typeof import('@tensorflow/tfjs-vis/dist/util/math')) {
    const weights = layer.getWeights();
    const layerVariables = layer.weights;
    const statsPromises = weights.map(math.tensorStats);
    const stats = await Promise.all(statsPromises);
    const shapes = weights.map((w) => w.shape);
    return weights.map((weight, i) => ({
        name: layerVariables[i].name,
        stats: stats[i],
        shape: formatShape(shapes[i]),
        weight
    }));
}
function formatShape(shape) {
    const oShape = shape.slice();
    if (oShape.length === 0) {
        return 'Scalar';
    }
    if (oShape[0] === null) {
        oShape[0] = 'batch';
    }
    return `[${oShape.join(',')}]`;
}

class ShowProxy {
    constructor(readonly math: typeof import('@tensorflow/tfjs-vis/dist/util/math')) {}
    public fitCallbacks(
        container: SurfaceInfo,
        metrics: string[],
        opts?: { callbacks?: string[] }
    ): ReturnType<typeof fitCallbacks> {
        const requestId = TensorflowJsVisualizer.requestId;
        const callbackNames = opts?.callbacks || ['onEpochEnd', 'onBatchEnd'];
        sendMessage({
            type: 'tensorFlowVis',
            request: 'registerfitcallback',
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
                    request: 'fitcallback',
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
            requestId: TensorflowJsVisualizer.requestId,
            container,
            history,
            metrics,
            opts
        });
    }
    public async perClassAccuracy(
        container: SurfaceInfo | string,
        classAccuracy: Array<{
            accuracy: number;
            count: number;
        }>,
        classLabels?: string[]
    ): Promise<void> {
        sendMessage({
            type: 'tensorFlowVis',
            request: 'perclassaccuracy',
            requestId: TensorflowJsVisualizer.requestId,
            container,
            classAccuracy,
            classLabels
        });
    }
    public async valuesDistribution(container: SurfaceInfo | string, tensor: Tensor): Promise<void> {
        const [stats, values] = await Promise.all([this.math.tensorStats(tensor), tensor.data()]);
        sendMessage({
            type: 'tensorFlowVis',
            request: 'valuesdistribution',
            container,
            requestId: TensorflowJsVisualizer.requestId,
            tensor: { stats, values: Array.from(values) }
        });
    }
    public async layer(container: SurfaceInfo | string, layer: Layer): Promise<void> {
        const details = await getLayerDetails(layer, this.math);
        const weights = {};
        await Promise.all(
            details.map(async (item) => {
                weights[item.name] = Array.from(await item.weight.data());
            })
        );
        const detailsToSend = details.map((item) => {
            return {
                ...item,
                weight: {
                    size: item.weight.size
                }
            };
        });
        sendMessage({
            type: 'tensorFlowVis',
            request: 'layer',
            requestId: TensorflowJsVisualizer.requestId,
            container,
            layer: { details: detailsToSend, weights } as any
        });
    }
    public async modelSummary(container: SurfaceInfo | string, model: LayersModel): Promise<void> {
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
            request: 'modelsummary',
            requestId: TensorflowJsVisualizer.requestId,
            container,
            model: slimmedModel as any
        });
    }

    // perClassAccuracy: typeof showPerClassAccuracy;
    // valuesDistribution: typeof valuesDistribution;
    // layer: typeof layer;
    // modelSummary: typeof modelSummary;
}

class RendererProxy {
    constructor(readonly tf: typeof import('@tensorflow/tfjs-core')) {}
    public async barchart(
        container: SurfaceInfo | string,
        data: Array<{
            index: number;
            value: number;
        }>,
        opts?: BarChartOpts
    ): Promise<void> {
        sendMessage({
            type: 'tensorFlowVis',
            request: 'barchart',
            requestId: TensorflowJsVisualizer.requestId,
            container,
            data,
            opts
        });
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
            requestId: TensorflowJsVisualizer.requestId,
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
        sendMessage({
            type: 'tensorFlowVis',
            request: 'histogram',
            requestId: TensorflowJsVisualizer.requestId,
            container,
            data: serialize(data) as any, // We'll deserialize this at our end.
            opts
        });
    }
    public async linechart(container: SurfaceInfo | string, data: XYPlotData, opts?: XYPlotOptions): Promise<void> {
        sendMessage({
            type: 'tensorFlowVis',
            request: 'linechart',
            requestId: TensorflowJsVisualizer.requestId,
            container,
            data,
            opts
        });
    }
    public async scatterplot(container: SurfaceInfo | string, data: XYPlotData, opts?: XYPlotOptions): Promise<void> {
        sendMessage({
            type: 'tensorFlowVis',
            request: 'scatterplot',
            requestId: TensorflowJsVisualizer.requestId,
            container,
            data,
            opts
        });
    }
    public async confusionMatrix(
        container: SurfaceInfo | string,
        data: ConfusionMatrixData,
        opts?: ConfusionMatrixOptions
    ): Promise<void> {
        sendMessage({
            type: 'tensorFlowVis',
            request: 'confusionmatrix',
            requestId: TensorflowJsVisualizer.requestId,
            container,
            data,
            opts
        });
    }
    public async heatmap(container: SurfaceInfo | string, data: HeatmapData, opts?: HeatmapOptions): Promise<void> {
        const requestId = TensorflowJsVisualizer.requestId;
        const details = await heatmap(this.tf, data, opts);

        sendMessage({
            type: 'tensorFlowVis',
            request: 'heatmap',
            requestId,
            container,
            data: details,
            opts
        });
    }
}

const _visor: Visor = new VisorProxy(undefined as any, undefined as any, undefined as any, undefined as any) as any;

export class TensorflowJsVisualizer {
    public static requestId: string = '';
    public static instance?: typeof tfvis;
    public static async serializeTensor(tensor: Tensor) {
        return tensor.array();
    }
    public static initialize(
        tf: typeof import('@tensorflow/tfjs-core'),
        math: typeof import('@tensorflow/tfjs-vis/dist/util/math')
    ) {
        if (TensorflowJsVisualizer.instance) {
            return TensorflowJsVisualizer.instance;
        }
        TensorflowJsVisualizer.instance = {
            version_vis: '1.5.0',
            show: new ShowProxy(math),
            render: new RendererProxy(tf),
            metrics: {
                accuracy: math.accuracy,
                perClassAccuracy: math.perClassAccuracy,
                confusionMatrix: math.confusionMatrix
            },
            visor: () => _visor
        } as any;
        return TensorflowJsVisualizer.instance!;
    }
}
