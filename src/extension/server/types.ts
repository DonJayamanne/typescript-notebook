/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import type * as plotly from 'plotly.js';
import type { Logs } from '@tensorflow/tfjs-layers/dist/logs';
import { Layer } from '@tensorflow/tfjs-layers/dist/engine/topology';
import { LayersModel } from '@tensorflow/tfjs-layers/dist/engine/training';
import type {
    BarChartOpts,
    ConfusionMatrixData,
    ConfusionMatrixOptions,
    HeatmapOptions,
    HistogramOpts,
    SurfaceInfo,
    TableData,
    TypedArray,
    XYPlotData,
    XYPlotOptions
} from '@tensorflow/tfjs-vis';

export type Configuration = {
    registerTsNode: boolean;
    disablePseudoTerminal: boolean;
    inlineTensorflowVisualizations: boolean;
    injectTsVis: boolean;
    injectPlotly: boolean;
    terminalRows: number;
    terminalColumns: number;
};

type BaseMessage<T extends string, B = {}> = {
    type: T;
    requestId: string;
} & B;
export type CodeObject = {
    code: string;
    textDocumentVersion: number;
    sourceFilename: string;
    friendlyName: string;
    sourceMapFilename: string;
};
export type RequestType = RunCellRequest | PingRequest | InitializeRequest | TensorFlowVisRequest | PlotGenerated;
export type RunCellRequest = BaseMessage<
    'cellExec',
    {
        code: CodeObject;
    }
>;

export type PingRequest = BaseMessage<'ping'>;
export type InitializeRequest = BaseMessage<'initialize'>;
export type TensorFlowVisRequest = BaseMessage<
    'tensorFlowVis',
    | { request: 'history'; requestId: string; success: boolean; error?: Error }
    | { request: 'barchart'; requestId: string; success: boolean; error?: Error }
    | { request: 'confusionMatrix'; requestId: string; success: boolean; error?: Error }
    | { request: 'scatterplot'; requestId: string; success: boolean; error?: Error }
    | { request: 'linechart'; requestId: string; success: boolean; error?: Error }
    | { request: 'histogram'; requestId: string; success: boolean; error?: Error }
    | { request: 'modelSummary'; requestId: string; success: boolean; error?: Error }
    | { request: 'layer'; requestId: string; success: boolean; error?: Error }
    | { request: 'valuesDistribution'; requestId: string; success: boolean; error?: Error }
    | { request: 'perclassaccuracy'; requestId: string; success: boolean; error?: Error }
    | { request: 'heatmap'; requestId: string; success: boolean; error?: Error }
>;

// Responses
export type ResponseType =
    | RunCellResponse
    | PingResponse
    | LogMessage
    | ReplRestarted
    | Initialized
    | OutputResponse
    | PlotGenerated
    | TensorFlowVis;
export type LogMessage = BaseMessage<
    'logMessage',
    {
        message: string;
        category: 'info' | 'error';
    }
>;
export type RunCellResponse = BaseMessage<
    'cellExec',
    | {
          result?: DisplayData;
          success: true;
          start: number;
          end: number;
      }
    | {
          ex: Error | { name?: string; message?: string; stack?: string };
          success: false;
          start: number;
          end: number;
      }
>;
export type OutputResponse = BaseMessage<
    'output',
    {
        data?: DisplayData;
        ex?: Error | { name?: string; message?: string; stack?: string };
    }
>;
export type PingResponse = BaseMessage<'pong'>;
export type ReplRestarted = BaseMessage<'replRestarted'>;
export type Initialized = BaseMessage<'initialized'>;

// Data types
export type DisplayData =
    | TextOutput
    | Base64OrSVGImage
    | TensorData
    | ArrayData
    | JsonData
    | HtmlData
    | GeneratePlot
    | TensorFlowVis
    | MarkdownData
    | MultiMimeOutput;
type MultiMimeOutput = BaseMessage<'multi-mime', { value: DisplayData[] }>;
type Base64OrSVGImage = BaseMessage<'image', { value: string; mime: string }>;
type TensorData = BaseMessage<'tensor', { value: any }>;
type ArrayData = BaseMessage<'array', { value: any }>;
type TextOutput = BaseMessage<'text', { value: string }>;
type JsonData = BaseMessage<'json', { value: any }>;
type HtmlData = BaseMessage<'html', { value: string }>;
type MarkdownData = BaseMessage<'markdown', { value: string }>;
export type GeneratePlot = BaseMessage<
    'generatePlot',
    {
        ele?: string;
        data: plotly.Data[];
        layout: plotly.Layout;
        hidden?: boolean;
        format?: 'png' | 'jpeg' | 'svg';
        download?: boolean;
    }
>;
type PlotGenerated = BaseMessage<
    'plotGenerated',
    { base64: string; success: true } | { base64: string; success: false; error: Error }
>;

// TensorFlow
export type TensorFlowHistory = BaseMessage<
    'tensorFlowVis',
    {
        request: 'history';
        container: SurfaceInfo | string;
        history: {};
        metrics: string[];
        opts?: {};
    }
>;
export type TensorFlowTable = BaseMessage<
    'tensorFlowVis',
    {
        request: 'table';
        container: SurfaceInfo | string;
        data: TableData;
        opts?: {
            fontSize?: number;
        };
    }
>;
export type TensorFlowHistogram = BaseMessage<
    'tensorFlowVis',
    {
        request: 'histogram';
        container: SurfaceInfo | string;
        data:
            | Array<{
                  value: number;
              }>
            | number[]
            | TypedArray;
        opts?: HistogramOpts;
    }
>;
export type TensorFlowLineChart = BaseMessage<
    'tensorFlowVis',
    {
        request: 'linechart';
        container: SurfaceInfo | string;
        data: XYPlotData;
        opts?: XYPlotOptions;
    }
>;
export type TensorFlowScatterPlot = BaseMessage<
    'tensorFlowVis',
    {
        request: 'scatterplot';
        container: SurfaceInfo | string;
        data: XYPlotData;
        opts?: XYPlotOptions;
    }
>;
export type TensorFlowConfusionMatrix = BaseMessage<
    'tensorFlowVis',
    {
        request: 'confusionmatrix';
        container: SurfaceInfo | string;
        data: ConfusionMatrixData;
        opts?: ConfusionMatrixOptions;
    }
>;
export type TensorFlowHeatMap = BaseMessage<
    'tensorFlowVis',
    {
        request: 'heatmap';
        container: SurfaceInfo | string;
        data: { spec: any; embedOpts: any };
        opts?: HeatmapOptions;
    }
>;
export type TensorFlowBarChart = BaseMessage<
    'tensorFlowVis',
    {
        request: 'barchart';
        container: SurfaceInfo | string;
        data: Array<{
            index: number;
            value: number;
        }>;
        opts?: BarChartOpts;
    }
>;
export type TensorFlowModelSummary = BaseMessage<
    'tensorFlowVis',
    {
        request: 'modelsummary';
        container: SurfaceInfo | string;
        model: LayersModel;
    }
>;
export type TensorFlowRegisterFitCallback = BaseMessage<
    'tensorFlowVis',
    {
        request: 'registerfitcallback';
        container: SurfaceInfo | string;
        metrics: string[];
        opts?: {};
    }
>;
export type TensorFlowFitCallback = BaseMessage<
    'tensorFlowVis',
    {
        request: 'fitcallback';
        container: SurfaceInfo | string;
        handler: string;
        iteration: number;
        log: Logs;
    }
>;
export type TensorFlowVis =
    | BaseMessage<'tensorFlowVis', { request: 'setactivetab'; tabName: string }>
    | BaseMessage<'tensorFlowVis', { request: 'show' }>
    | TensorFlowRegisterFitCallback
    | TensorFlowFitCallback
    | TensorFlowHistory
    | TensorFlowTable
    | TensorFlowHistogram
    | TensorFlowLineChart
    | TensorFlowScatterPlot
    | TensorFlowConfusionMatrix
    | TensorFlowHeatMap
    | TensorFlowBarChart
    | TensorFlowModelSummary
    | BaseMessage<
          'tensorFlowVis',
          {
              request: 'perclassaccuracy';
              container: SurfaceInfo | string;
              classAccuracy: Array<{
                  accuracy: number;
                  count: number;
              }>;
              classLabels?: string[];
          }
      >
    | BaseMessage<
          'tensorFlowVis',
          {
              request: 'valuesdistribution';
              container: SurfaceInfo | string;
              tensor: { stats; values };
          }
      >
    | BaseMessage<
          'tensorFlowVis',
          {
              request: 'layer';
              container: SurfaceInfo | string;
              layer: Layer;
          }
      >;
