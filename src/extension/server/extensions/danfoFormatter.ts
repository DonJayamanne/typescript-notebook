import * as path from 'path';
import { logErrorMessage } from '../logger';
import type * as dfd from 'danfojs-node';
import type { Configs } from 'danfojs-node/types/config/config';

import { sendMessage } from '../comms';
import { DanfoNodePlotter } from './danforPlotter';
import { DisplayData } from '../types';

export class DanfoJsFormatter {
    static _instance: DanfoJsFormatter;
    private isLoaded?: boolean;
    private failedToInject?: boolean;
    private danfoJs?: typeof dfd;
    public static requestId: string = '';
    public static get instance() {
        if (DanfoJsFormatter._instance) {
            return DanfoJsFormatter._instance;
        }
        DanfoJsFormatter._instance = new DanfoJsFormatter();
        return DanfoJsFormatter._instance;
    }
    public static initialize(codeRunner: (code: string) => Promise<unknown>, danfoModule: typeof dfd) {
        DanfoJsFormatter.instance.inject(codeRunner, danfoModule);
    }
    public canFormatAsDanfo(value: unknown) {
        if ((!value && typeof value !== 'object') || !this.danfoJs) {
            return false;
        }
        if (value instanceof this.danfoJs.Series) {
            return true;
        }
        if (value instanceof this.danfoJs.DataFrame) {
            return true;
        }
        return false;
    }
    public formatDanfoObject(value: unknown): DisplayData {
        if (this.canFormatAsDanfo(value) && this.danfoJs) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { html } =
                value instanceof this.danfoJs?.Series ? seriesToHtmlJson(value) : frameToHtmlJson(value as any);
            return {
                type: 'multi-mime',
                value: [
                    {
                        type: 'html',
                        value: html,
                        requestId: DanfoJsFormatter.requestId
                    },
                    // {
                    //     type: 'json',
                    //     value: json
                    // },
                    {
                        type: 'text',
                        value: (value as any).toString(),
                        requestId: DanfoJsFormatter.requestId
                    }
                ],
                requestId: DanfoJsFormatter.requestId
            };
        } else {
            return {
                type: 'json',
                value,
                requestId: DanfoJsFormatter.requestId
            };
        }
    }
    public inject(codeRunner: (code: string) => Promise<unknown>, danfoModule: typeof dfd) {
        if (this.isLoaded || this.failedToInject) {
            return;
        }
        let config: Configs | undefined;
        if (danfoModule) {
            this.danfoJs = danfoModule;
            try {
                config = new (danfoModule as any).Configs();
            } catch {
                //
            }
        }
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const loadedModules = Object.keys(require('module')._cache);
        const modulePath = path.join('node_modules', 'danfojs-node');
        if (!loadedModules.some((item) => item.includes(modulePath))) {
            return;
        }
        this.isLoaded = true;
        try {
            // Get an instance of the danfo module (load it within the context of the VM, not in our code).
            if (this.danfoJs) {
                hijackSeriesPrint(this.danfoJs, config);
                hijackNDFramePrint(this.danfoJs, config);
            }
            // codeRunner("require('danfojs-node')").then((result) => {
            //     this.danfoJs = result as typeof dfd;
            //     hijackSeriesPrint(this.danfoJs);
            //     hijackNDFramePrint(this.danfoJs);
            // });
        } catch (ex) {
            this.failedToInject = true;
            logErrorMessage(`Failed to load danfojs-node`, ex);
        }
    }
}

function hijackSeriesPrint(danfoJs: typeof dfd, config?: Configs) {
    danfoJs.Series.prototype.print = function (this: dfd.Series) {
        // Always print the old format (this way user has text output & html).
        const rawText: string = this.toString();
        const { html } = seriesToHtmlJson(this, config);
        sendMessage({
            type: 'output',
            requestId: DanfoJsFormatter.requestId,
            data: {
                type: 'multi-mime',
                requestId: DanfoJsFormatter.requestId,
                value: [
                    {
                        type: 'html',
                        value: html,
                        requestId: DanfoJsFormatter.requestId
                    },
                    // {
                    //     type: 'json',
                    //     value: json
                    // },
                    {
                        type: 'text',
                        value: rawText,
                        requestId: DanfoJsFormatter.requestId
                    }
                ]
            }
        });
    };
    danfoJs.Series.prototype.plot = function (this: dfd.Series, div: string) {
        const plotter = new DanfoNodePlotter(this, danfoJs, div);
        return plotter;
    };
}
function hijackNDFramePrint(danfoJs: typeof dfd, config?: Configs) {
    danfoJs.DataFrame.prototype.print = function (this: dfd.DataFrame) {
        // Always print the old format (this way user has text output & html).
        const rawText: string = this.toString();
        const { html } = frameToHtmlJson(this, config);
        sendMessage({
            type: 'output',
            requestId: DanfoJsFormatter.requestId,
            data: {
                type: 'multi-mime',
                requestId: DanfoJsFormatter.requestId,
                value: [
                    {
                        type: 'html',
                        value: html,
                        requestId: DanfoJsFormatter.requestId
                    },
                    // {
                    //     type: 'json',
                    //     value: json
                    // },
                    {
                        type: 'text',
                        value: rawText,
                        requestId: DanfoJsFormatter.requestId
                    }
                ]
            }
        });
    };

    danfoJs.DataFrame.prototype.plot = function (this: dfd.Series, div: string) {
        const plotter = new DanfoNodePlotter(this, danfoJs, div);
        return plotter;
    };
}
function seriesToHtmlJson(series: dfd.Series, config?: Configs): { html: string; json: any[] } {
    const max_row = Math.max(config?.table_max_row || 100, 100); //config.get_max_row;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data_arr: any[] = [];
    const header = [''].concat(series.columns);
    let idx, data;

    if (series.values.length > max_row) {
        //slice Object to show a max of [max_rows]
        data = series.values.slice(0, max_row);
        idx = series.index.slice(0, max_row);
    } else {
        data = series.values;
        idx = series.index;
    }

    const rowsHtml: string[] = [];
    const rowsJson: any[] = [];
    idx.forEach((val, i) => {
        const rowJson = {};
        const row = [val].concat(data[i]);
        data_arr.push(row);
        const rowHtml = row
            .map((item, i) => {
                try {
                    rowJson[header[i]] = item;
                } catch {
                    //
                }
                return `<td>${item}</td>`;
            })
            .join('');
        rowsJson.push(rowJson);
        rowsHtml.push(`<tr>${rowHtml}</tr>`);
    });

    const headers = header.map((item) => `<th>${item}</th>`);
    const html = `<table><thead><tr>${headers.join('')}</tr><tbody>${rowsHtml.join('')}</tbody>`;
    return { html, json: rowsJson };
}

function frameToHtmlJson(df: dfd.DataFrame, config?: Configs): { html: string; json: any[] } {
    const max_col_in_console = Math.max(config?.get_max_col_in_console || 100, 100);
    const max_row = Math.max(config?.get_max_row || 100, 100);
    // let data;
    type Row = string[];
    const data_arr: Row[] = [];
    // let idx = this.index
    const col_len = df.columns.length;
    // let row_len = this.values.length - 1
    let header: string[] = [];

    if (col_len > max_col_in_console) {
        //truncate displayed columns to fit in the console
        const first_4_cols = df.columns.slice(0, 4);
        const last_3_cols = df.columns.slice(col_len - 4);
        //join columns with truncate ellipse in the middle
        header = [''].concat(first_4_cols).concat(['...']).concat(last_3_cols);

        let sub_idx, values_1, value_2;

        if (df.values.length > max_row) {
            //slice Object to show [max_rows]
            const df_subset_1 = df.iloc({
                rows: [`0:${max_row}`],
                columns: ['0:4']
            });
            const df_subset_2 = df.iloc({
                rows: [`0:${max_row}`],
                columns: [`${col_len - 4}:`]
            });
            sub_idx = df.index.slice(0, max_row);
            values_1 = df_subset_1.values;
            value_2 = df_subset_2.values;
        } else {
            const df_subset_1 = df.iloc({ rows: ['0:'], columns: ['0:4'] });
            const df_subset_2 = df.iloc({
                rows: ['0:'],
                columns: [`${col_len - 4}:`]
            });
            sub_idx = df.index.slice(0, max_row);
            values_1 = df_subset_1.values;
            value_2 = df_subset_2.values;
        }

        // merge dfs
        sub_idx.map((val, i) => {
            const row = [val].concat(values_1[i]).concat(['...']).concat(value_2[i]);
            data_arr.push(row);
        });
    } else {
        //display all columns
        header = [''].concat(df.columns);
        let idx, values;
        if (df.values.length > max_row) {
            //slice Object to show a max of [max_rows]
            const data = df.loc({ rows: [`0:${max_row}`], columns: df.columns });
            idx = data.index;
            values = data.values;
        } else {
            values = df.values;
            idx = df.index;
        }

        // merge cols
        idx.forEach((val, i) => {
            const row = [val].concat(values[i]);
            data_arr.push(row);
        });
    }

    const rowsHtml: string[] = [];
    const rowsJson: any[] = [];
    data_arr.forEach((row) => {
        const rowJson = {};
        const rowCellsHtml = row
            .map((item, i) => {
                try {
                    rowJson[header[i]] = item;
                } catch {
                    //
                }
                return `<td>${item}</td>`;
            })
            .join('');
        rowsJson.push(rowJson);
        rowsHtml.push(`<tr>${rowCellsHtml}</tr>`);
    });
    const headers = header.map((item) => `<th>${item}</th>`);
    const html = `<table><thead><tr>${headers.join('')}</tr><tbody>${rowsHtml.join('')}</tbody>`;
    return { html, json: rowsJson };
}
