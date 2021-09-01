/* eslint-disable @typescript-eslint/no-explicit-any */
import * as tfvis from '@tensorflow/tfjs-vis';
import * as renderUtils from '@tensorflow/tfjs-vis/dist/render/render_utils';
import * as dom from '@tensorflow/tfjs-vis/dist/util/dom';
import vega_embed from 'vega-embed';
export async function valuesDistribution(container: any, stats: any, values: any) {
    tfvis.render.histogram(container, values, { height: 150, stats });
}

export async function renderHeatmap(container: any, spec: any, embedOpts: any) {
    const drawArea = renderUtils.getDrawArea(container);
    vega_embed(drawArea, spec, embedOpts);
}
export async function renderLayer(container: any, layer: { details: any; weights: Record<string, any[]> }) {
    const drawArea = renderUtils.getDrawArea(container);
    const details = layer.details;
    const headers = ['Weight Name', 'Shape', 'Min', 'Max', '# Params', '# Zeros', '# NaNs', '# Infinity'];
    // Show layer summary
    const weightsInfoSurface = dom.subSurface(drawArea, 'layer-weights-info');
    const detailValues = details.map((l) => [
        l.name,
        l.shape,
        l.stats.min,
        l.stats.max,
        l.weight.size,
        l.stats.numZeros,
        l.stats.numNans,
        l.stats.numInfs
    ]);
    tfvis.render.table(weightsInfoSurface, { headers, values: detailValues });
    const histogramSelectorSurface = dom.subSurface(drawArea, 'select-layer');
    const layerValuesHistogram = dom.subSurface(drawArea, 'param-distribution');
    const handleSelection = (layerName: string) => {
        tfvis.render.histogram(layerValuesHistogram, layer.weights[layerName], {
            height: 150,
            width: 460,
            stats: false
        });
    };
    addHistogramSelector(
        details.map((d) => d.name),
        histogramSelectorSurface,
        handleSelection
    );
}
function addHistogramSelector(
    items,
    parent,
    // tslint:disable-next-line:no-any
    selectionHandler
) {
    const select = `
        <select>
          ${items.map((i) => `<option value=${i}>${i}</option>`)}
        </select>
      `;
    const button = `<button>Show Values Distribution for:</button>`;
    const content = `<div>${button}${select}</div>`;
    parent.innerHTML = content;
    // Add listeners
    const buttonEl = parent.querySelector('button');
    const selectEl = parent.querySelector('select');
    buttonEl.addEventListener('click', () => {
        selectionHandler(selectEl.selectedOptions[0].label);
    });
}
