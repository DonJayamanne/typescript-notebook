export async function heatmap(tf: typeof import('@tensorflow/tfjs-core'), data, opts = {}) {
    const options = Object.assign({}, defaultOpts, opts);
    let inputValues = data.values;
    if (options.rowMajor) {
        inputValues = await convertToRowMajor(tf, data.values);
    }
    // Data validation
    const { xTickLabels, yTickLabels } = data;
    //
    // Format data for vega spec; an array of objects, one for for each cell
    // in the matrix.
    //
    // If custom labels are passed in for xTickLabels or yTickLabels we need
    // to make sure they are 'unique' before mapping them to visual properties.
    // We therefore append the index of the label to the datum that will be used
    // for that label in the x or y axis. We could do this in all cases but choose
    // not to to avoid unnecessary string operations.
    //
    // We use IDX_SEPARATOR to demarcate the added index
    const IDX_SEPARATOR = '@tfidx@';
    const values: any[] = [];
    if (inputValues instanceof tf.Tensor) {
        // This is a slightly specialized version of TensorBuffer.get, inlining it
        // avoids the overhead of a function call per data element access and is
        // specialized to only deal with the 2d case.
        const inputArray = await inputValues.data();
        const [numRows, numCols] = inputValues.shape;
        for (let row = 0; row < numRows; row++) {
            const x = xTickLabels ? `${xTickLabels[row]}${IDX_SEPARATOR}${row}` : row;
            for (let col = 0; col < numCols; col++) {
                const y = yTickLabels ? `${yTickLabels[col]}${IDX_SEPARATOR}${col}` : col;
                const index = row * numCols + col;
                const value = inputArray[index];
                values.push({ x, y, value });
            }
        }
    } else {
        const inputArray = inputValues;
        for (let row = 0; row < inputArray.length; row++) {
            const x = xTickLabels ? `${xTickLabels[row]}${IDX_SEPARATOR}${row}` : row;
            for (let col = 0; col < inputArray[row].length; col++) {
                const y = yTickLabels ? `${yTickLabels[col]}${IDX_SEPARATOR}${col}` : col;
                const value = inputArray[row][col];
                values.push({ x, y, value });
            }
        }
    }
    const embedOpts = {
        actions: false,
        mode: 'vega-lite',
        defaultStyle: false
    };
    const spec = {
        width: options.width,
        height: options.height,
        padding: 0,
        autosize: {
            type: 'fit',
            contains: 'padding',
            resize: true
        },
        config: {
            axis: {
                labelFontSize: options.fontSize,
                titleFontSize: options.fontSize
            },
            text: { fontSize: options.fontSize },
            legend: {
                labelFontSize: options.fontSize,
                titleFontSize: options.fontSize
            },
            scale: { bandPaddingInner: 0, bandPaddingOuter: 0 }
        },
        //@ts-ignore
        data: { values: values },
        mark: { type: 'rect', tooltip: true },
        encoding: {
            x: {
                field: 'x',
                type: options.xType,
                title: options.xLabel,
                sort: false
            },
            y: {
                field: 'y',
                type: options.yType,
                title: options.yLabel,
                sort: false
            },
            fill: {
                field: 'value',
                type: 'quantitative'
            }
        }
    };
    //
    // Format custom labels to remove the appended indices
    //
    const suffixPattern = `${IDX_SEPARATOR}\\d+$`;
    const suffixRegex = new RegExp(suffixPattern);
    if (xTickLabels) {
        // @ts-ignore
        spec.encoding.x.axis = {
            labelExpr: `replace(datum.value, regexp(/${suffixPattern}/), '')`
        };
    }
    if (yTickLabels) {
        // @ts-ignore
        spec.encoding.y.axis = {
            labelExpr: `replace(datum.value, regexp(/${suffixPattern}/), '')`
        };
    }
    // Customize tooltip formatting to remove the appended indices
    if (xTickLabels || yTickLabels) {
        //@ts-ignore
        embedOpts.tooltip = {
            sanitize: (value) => {
                const valueString = String(value);
                return valueString.replace(suffixRegex, '');
            }
        };
    }
    let colorRange;
    switch (options.colorMap) {
        case 'blues':
            colorRange = ['#f7fbff', '#4292c6'];
            break;
        case 'greyscale':
            colorRange = ['#000000', '#ffffff'];
            break;
        case 'viridis':
        default:
            colorRange = 'viridis';
            break;
    }
    if (colorRange !== 'viridis') {
        //@ts-ignore
        const fill = spec.encoding.fill;
        // @ts-ignore
        fill.scale = { range: colorRange };
    }
    if (options.domain) {
        //@ts-ignore
        const fill = spec.encoding.fill;
        // @ts-ignore
        if (fill.scale != null) {
            // @ts-ignore
            fill.scale = Object.assign({}, fill.scale, { domain: options.domain });
        } else {
            // @ts-ignore
            fill.scale = { domain: options.domain };
        }
    }
    return { spec, embedOpts };
}
exports.heatmap = heatmap;
async function convertToRowMajor(tf: typeof import('@tensorflow/tfjs-core'), inputValues) {
    let transposed;
    if (inputValues instanceof tf.Tensor) {
        transposed = inputValues.transpose();
    } else {
        transposed = tf.tidy(() => tf.tensor2d(inputValues).transpose());
    }
    // Download the intermediate tensor values and
    // dispose the transposed tensor.
    const transposedValues = await transposed.array();
    transposed.dispose();
    return transposedValues;
}
const defaultOpts = {
    height: null,
    width: null,
    xLabel: null,
    yLabel: null,
    xType: 'ordinal',
    yType: 'ordinal',
    colorMap: 'viridis',
    fontSize: 12,
    domain: null,
    rowMajor: false
};
//# sourceMappingURL=heatmap.js.map
