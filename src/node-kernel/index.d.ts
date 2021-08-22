import type * as plotly from './plotly.js/index';
export namespace display {
    /**
     * Displays a base64 encoded image.
     */
    export function image(base64: string): void;
    /**
     * Displays an SVG.
     */
    export function image(svg: string): void;
    /**
     * Displays an image from file.
     */
    export function image(filePath: string): void;
    /**
     * Displays an image from bytes.
     */
    export function image(bytes: Uint8Array): void;
    /**
     * Appends an image from a base64 string into an existing image output.
     */
    export function appendImage(base64: string): void;
    /**
     * Appends an SVG image into an existing image output.
     */
    export function appendImage(svg: string): void;
    /**
     * Appends an image loaded from a file into an existing image output.
     */
    export function appendImage(filePath: string): void;
    /**
     * Appends an image loaded from bytes into an existing image output.
     */
    export function appendImage(bytes: Uint8Array): void;

    /**
     * Displays a JSON
     */
    export function json(value: Uint8Array | string | {}): void;
    /**
     * Displays a string
     */
    export function text(value: Uint8Array): void;

    // tslab stuff.
    /**
     * Displays an HTML outut.
     */
    export function html(s: string): void;
    /**
     * Load & executes javacsript in the output.
     */
    export function javascript(s: string): void;
    /**
     * Displays a markdown string in the output.
     */
    export function markdown(s: string): void;
    /**
     * Displays latext in the output.
     */
    // export function latex(s: string): void;
    /**
     * Displays an SVG image.
     */
    export function svg(s: string): void;
    /**
     * Displays a png image.
     */
    export function png(b: Uint8Array): void;
    /**
     * Displays a jpeg image.
     */
    export function jpeg(b: Uint8Array): void;
    /**
     * Displays a gif image.
     */
    export function gif(b: Uint8Array): void;
    /**
     * Displays some text.
     */
    export function text(s: string): void;
}

export namespace Plotly {
    /**
     * Renders a plotly plot.
     */
    export function newPlot(
        root: plotly.Root,
        data: plotly.Data[],
        layout?: Partial<plotly.Layout>,
        config?: Partial<plotly.Config>
    ): Promise<void>;
    /**
     * Returns a base64 encoded string representation of the generated plot.
     */
    export function toBase64(
        data: plotly.Data[],
        layout: plotly.Layout,
        format?: 'png' | 'svg' | 'jpeg'
    ): Promise<string>;
    /**
     * Saves the generated plot into a file.
     * Return the path to the file name (if a file path is not provided a temporary image file is created and returned).
     */
    export function toFile(
        data: plotly.Data[],
        layout: plotly.Layout,
        format?: 'png' | 'svg' | 'jpeg',
        file?: string
    ): Promise<string>;
}
