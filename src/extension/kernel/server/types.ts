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
export type ResponseType = RunCellResponse | PingResponse | LogMessage | ReplRestarted | Initialized | OutputResponse;
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
