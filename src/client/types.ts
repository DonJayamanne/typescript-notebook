import type { Logs } from '@tensorflow/tfjs-layers/dist/logs';
import type { SurfaceInfo } from '@tensorflow/tfjs-vis';

type BaseRequest<T extends string> = {
    type: T;
    requestId: number;
};
type BaseResponse<T extends string> = BaseRequest<T>;

export type CodeObject = {
    code: string;
    fileName: string;
};
export type RequestType = RunCellRequest | PingRequest | InitializeRequest;
export type RunCellRequest = BaseRequest<'cellExec'> & {
    code: CodeObject;
};

export type PingRequest = BaseRequest<'ping'> & {};
export type InitializeRequest = BaseRequest<'initialize'> & {};

// Responses
export type ResponseType =
    | RunCellResponse
    | PingResponse
    | LogMessage
    | ReplRestarted
    | Initialized
    | OutputResponse
    | TensorFlowVis;
export type LogMessage = BaseResponse<'logMessage'> & {
    message: string;
    category: 'info' | 'error';
};
export type RunCellResponse = BaseResponse<'cellExec'> & {
    result?: DisplayData;
    ex?: Error | { name?: string; message?: string; stack?: string };
    success: boolean;
};
export type OutputResponse = BaseResponse<'output'> & {
    data?: DisplayData;
    ex?: Error | { name?: string; message?: string; stack?: string };
};
export type PingResponse = BaseResponse<'pong'> & {};
export type ReplRestarted = BaseResponse<'replRestarted'> & {};
export type Initialized = BaseResponse<'initialized'> & {};

// Data types
export type DisplayData =
    | string
    | Base64Image
    | TensorData
    | ArrayData
    | JsonData
    | HtmlData
    | { type: 'multi-mime'; data: DisplayData[] };
type Base64Image = { type: 'image'; value: string; mime: string; ext: string };
type TensorData = { type: 'tensor'; value: any };
type ArrayData = { type: 'array'; value: any };
type JsonData = { type: 'json'; value: any };
type HtmlData = { type: 'html'; value: string };

// TensorFlow
export type TensorFlowVis =
    | { type: 'tensorFlowVis'; request: 'setActiveTab'; tabName: string }
    | { type: 'tensorFlowVis'; request: 'show' }
    | {
          type: 'tensorFlowVis';
          request: 'registerFitCallback';
          container: SurfaceInfo | string;
          metrics: string[];
          // eslint-disable-next-line @typescript-eslint/ban-types
          opts?: {};
      }
    | {
          type: 'tensorFlowVis';
          request: 'fitCallback';
          container: SurfaceInfo | string;
          handler: string;
          iteration: number;
          log: Logs;
      };
