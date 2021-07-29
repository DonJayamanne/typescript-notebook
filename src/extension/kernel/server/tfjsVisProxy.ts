/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import type * as tfvis from '@tensorflow/tfjs-vis';
import type { SurfaceInfo, SurfaceInfoStrict } from '@tensorflow/tfjs-vis';
import type { VisorComponent } from '@tensorflow/tfjs-vis/dist/components/visor';
import type { fitCallbacks } from '@tensorflow/tfjs-vis/dist/show/history';
import type { Visor } from '@tensorflow/tfjs-vis/dist/visor';
import type { Logs } from '@tensorflow/tfjs-layers/dist/logs';
import { sendMessage } from './comms';

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
    // history: typeof history;
    public fitCallbacks(container: SurfaceInfo, metrics: string[], opts?: {}): ReturnType<typeof fitCallbacks> {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        sendMessage({
            type: 'tensorFlowVis',
            request: 'registerFitCallback',
            container: container,
            metrics,
            opts
        });
        const handler = {
            get: function (_target, prop) {
                return (iteration: number, log: Logs) => {
                    sendMessage({
                        type: 'tensorFlowVis',
                        request: 'fitCallback',
                        container: container,
                        handler: prop,
                        iteration,
                        log
                    });
                };
            }
        };
        return new Proxy({}, handler);
    }
    // perClassAccuracy: typeof showPerClassAccuracy;
    // valuesDistribution: typeof valuesDistribution;
    // layer: typeof layer;
    // modelSummary: typeof modelSummary;
}

export class TensorflowJsVisualizer {
    public static intance = new TensorflowJsVisualizer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private _visor = new VisorProxy(undefined as any, undefined as any, undefined as any, undefined as any);
    public show = new ShowProxy();
    public visor(): Visor {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return this._visor as any;
    }
}
