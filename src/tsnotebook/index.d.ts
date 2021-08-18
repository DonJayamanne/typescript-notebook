export interface Display extends TsLabDisplay {
    /**
     * Displays a base64 encoded image.
     */
    image(base64: string): void;
    /**
     * Displays an SVG.
     */
    image(svg: string): void;
    /**
     * Displays an image from file.
     */
    image(filePath: string): void;
    /**
     * Displays an image from bytes.
     */
    image(bytes: Uint8Array): void;
    /**
     * Appends an image from a base64 string into an existing image output.
     */
    appendImage(base64: string): void;
    /**
     * Appends an SVG image into an existing image output.
     */
    appendImage(svg: string): void;
    /**
     * Appends an image loaded from a file into an existing image output.
     */
    appendImage(filePath: string): void;
    /**
     * Appends an image loaded from bytes into an existing image output.
     */
    appendImage(bytes: Uint8Array): void;

    /**
     * Displays a JSON
     */
    json(value: Uint8Array | string | {}): void;
    /**
     * Displays a string
     */
    text(value: Uint8Array): void;
}

interface TsLabDisplay {
    /**
     * Displays an HTML outut.
     */
    html(s: string): void;
    /**
     * Load & executes javacsript in the output.
     */
    javascript(s: string): void;
    /**
     * Displays a markdown string in the output.
     */
    markdown(s: string): void;
    /**
     * Displays latext in the output.
     */
    latex(s: string): void;
    /**
     * Displays an SVG image.
     */
    svg(s: string): void;
    /**
     * Displays a png image.
     */
    png(b: Uint8Array): void;
    /**
     * Displays a jpeg image.
     */
    jpeg(b: Uint8Array): void;
    /**
     * Displays a gif image.
     */
    gif(b: Uint8Array): void;
    /**
     * Displays some text.
     */
    text(s: string): void;
}

export const display: Display;
