function noop() {
    //
}
module.exports = {
    display: {
        javascript: noop,
        html: noop,
        markdown: noop,
        latex: noop,
        svg: noop,
        png: noop,
        jpeg: noop,
        gif: noop,
        pdf: noop,
        text: noop,
        // New items.
        image: noop,
        appendImage: noop,
        json: noop
    },
    Plotly: {
        newPlot: noop,
        toBase64: noop,
        toFile: noop
    }
};
