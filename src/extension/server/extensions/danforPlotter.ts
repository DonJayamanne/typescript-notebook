import type * as dfd from 'danfojs-node';
import { sendMessage } from '../comms';
import { v4 as uuid } from 'uuid';

function generatePlot(data, config, eleId: string) {
    const parentId = uuid().replace(/-/g, '');
    const html = `
    <script src="https://cdn.plot.ly/plotly-2.3.0.min.js"></script>
    <div id="${parentId}"></div>
    <script type="text/javascript">
        function plotIt${parentId}(){
            if (!window.Plotly){
                plotIt${parentId}._tryCount += 1;
                if (plotIt${parentId}._tryCount === 120){
                    return console.error('Failed to load plotly in 120s');
                }
                console.info('Plotly not yet ready, retrying');
                return setTimeout(plotIt${parentId}, 500);
            }
            const ele = document.getElementById("${eleId || parentId}") || document.getElementById("${parentId}");
            console.info('Plotly is ready, plotting');
            window.Plotly.newPlot(
                ele,
                ${JSON.stringify(data)},
                ${JSON.stringify(config['layout'])},
                ${JSON.stringify(config)}
            );
        }
        plotIt${parentId}._tryCount = 0;
        plotIt${parentId}();
    </script>
    `;
    sendMessage({
        type: 'output',
        requestId: DanfoNodePlotter.requestId,
        data: {
            type: 'html',
            value: html,
            requestId: DanfoNodePlotter.requestId
        }
    });
}
export class DanfoNodePlotter {
    public static requestId: string = '';
    constructor(private readonly ndframe, private readonly danfojs: typeof dfd, private readonly div: string = '') {}

    line(config = {}) {
        const ret_params = this.__get_plot_params(config);

        const this_config = ret_params[0];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const params = ret_params[1] as string[];

        if (this.ndframe instanceof this.danfojs.Series) {
            const trace = {};
            const y = this.ndframe.values;
            params.forEach((param) => {
                // if (!param === 'layout') {
                if (param !== 'layout') {
                    trace[param] = config[param];
                }
            });
            trace['y'] = y;
            trace['type'] = 'line';
            generatePlot([trace], this_config, this.div);
        } else {
            if ('x' in this_config && 'y' in this_config) {
                if (!this.ndframe.column_names.includes(this_config['x'])) {
                    throw Error(`Column Error: ${this_config['x']} not found in columns`);
                }

                if (!this.ndframe.column_names.includes(this_config['y'])) {
                    throw Error(`Column Error: ${this_config['y']} not found in columns`);
                }

                const x = this.ndframe[this_config['x']].values;
                const y = this.ndframe[this_config['y']].values;
                const trace = {};
                trace['x'] = x;
                trace['y'] = y;
                const xaxis = {};
                const yaxis = {};
                xaxis['title'] = this_config['x'];
                yaxis['title'] = this_config['y'];
                this_config['layout']['xaxis'] = xaxis;
                this_config['layout']['yaxis'] = yaxis;
                generatePlot([trace], this_config, this.div);
            } else if ('x' in this_config || 'y' in this_config) {
                const data: any[] = [];
                let cols_to_plot;

                if ('columns' in this_config) {
                    cols_to_plot = this.____check_if_cols_exist(this_config['columns']);
                } else {
                    cols_to_plot = this.ndframe.column_names;
                }

                cols_to_plot.forEach((c_name) => {
                    const trace = {};
                    params.forEach((param) => {
                        trace[param] = config[param];
                    });

                    if ('x' in this_config) {
                        trace['x'] = this.ndframe[this_config['x']].values;
                        trace['y'] = this.ndframe[c_name].values;
                        trace['name'] = c_name;
                    } else {
                        trace['y'] = this.ndframe[this_config['y']].values;
                        trace['x'] = this.ndframe[c_name].values;
                        trace['name'] = c_name;
                    }

                    data.push(trace);
                });
                generatePlot(data, this_config, this.div);
            } else {
                const data: any[] = [];
                let cols_to_plot;

                if ('columns' in this_config) {
                    cols_to_plot = this.____check_if_cols_exist(this_config['columns']);
                } else {
                    cols_to_plot = this.ndframe.column_names;
                }

                cols_to_plot.forEach((c_name) => {
                    const trace = {};
                    params.forEach((param) => {
                        trace[param] = config[param];
                    });
                    trace['x'] = this.ndframe.index;
                    trace['y'] = this.ndframe[c_name].values;
                    trace['name'] = c_name;
                    data.push(trace);
                });
                generatePlot(data, this_config, this.div);
            }
        }
    }

    bar(config = {}) {
        const ret_params = this.__get_plot_params(config);

        const this_config = ret_params[0];
        const params = ret_params[1] as any;

        if (this.ndframe instanceof this.danfojs.Series) {
            const trace = {};
            const y = this.ndframe.values;
            params.forEach((param) => {
                if (param !== 'layout') {
                    trace[param] = config[param];
                }
            });
            trace['y'] = y;
            trace['type'] = 'bar';
            generatePlot([trace], this_config, this.div);
        } else {
            if ('x' in this_config && 'y' in this_config) {
                if (!this.ndframe.column_names.includes(this_config['x'])) {
                    throw Error(`Column Error: ${this_config['x']} not found in columns`);
                }

                if (!this.ndframe.column_names.includes(this_config['y'])) {
                    throw Error(`Column Error: ${this_config['y']} not found in columns`);
                }

                const x = this.ndframe[this_config['x']].values;
                const y = this.ndframe[this_config['y']].values;
                const trace = {};
                trace['x'] = x;
                trace['y'] = y;
                trace['type'] = 'bar';
                const xaxis = {};
                const yaxis = {};
                xaxis['title'] = this_config['x'];
                yaxis['title'] = this_config['y'];
                this_config['layout']['xaxis'] = xaxis;
                this_config['layout']['yaxis'] = yaxis;
                generatePlot([trace], this_config, this.div);
            } else if ('x' in this_config || 'y' in this_config) {
                const trace = {};
                params.forEach((param) => {
                    if (param !== 'layout') {
                        trace[param] = config[param];
                    }
                });

                if ('x' in this_config) {
                    trace['y'] = this.ndframe[this_config['x']].values;
                } else {
                    trace['y'] = this.ndframe[this_config['y']].values;
                }

                trace['type'] = 'bar';
                generatePlot([trace], this_config, this.div);
            } else {
                const data: any[] = [];
                let cols_to_plot;

                if ('columns' in this_config) {
                    cols_to_plot = this.____check_if_cols_exist(this_config['columns']);
                } else {
                    cols_to_plot = this.ndframe.column_names;
                }

                cols_to_plot.forEach((c_name) => {
                    const trace = {};
                    trace['x'] = this.ndframe.index;
                    trace['y'] = this.ndframe[c_name].values;
                    trace['name'] = c_name;
                    trace['type'] = 'bar';
                    data.push(trace);
                });
                generatePlot(data, this_config, this.div);
            }
        }
    }

    scatter(config = {}) {
        const ret_params = this.__get_plot_params(config);

        const this_config = ret_params[0];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const params = ret_params[1] as any;

        if (this.ndframe instanceof this.danfojs.Series) {
            const trace = {};
            params.forEach((param) => {
                // if (!param == 'layout') {
                if (param !== 'layout') {
                    trace[param] = config[param];
                }
            });
            trace['x'] = this.ndframe.values;
            trace['y'] = this.ndframe.index;
            trace['type'] = 'scatter';
            trace['mode'] = 'markers';
            generatePlot([trace], this_config, this.div);
        } else {
            if ('x' in this_config && 'y' in this_config) {
                if (!this.ndframe.column_names.includes(this_config['x'])) {
                    throw Error(`Column Error: ${this_config['x']} not found in columns`);
                }

                if (!this.ndframe.column_names.includes(this_config['y'])) {
                    throw Error(`Column Error: ${this_config['y']} not found in columns`);
                }

                const x = this.ndframe[this_config['x']].values;
                const y = this.ndframe[this_config['y']].values;
                const trace = {};
                trace['x'] = x;
                trace['y'] = y;
                trace['type'] = 'scatter';
                trace['mode'] = 'markers';
                const xaxis = {};
                const yaxis = {};
                xaxis['title'] = this_config['x'];
                yaxis['title'] = this_config['y'];
                this_config['layout']['xaxis'] = xaxis;
                this_config['layout']['yaxis'] = yaxis;
                generatePlot([trace], this_config, this.div);
            } else if ('x' in this_config || 'y' in this_config) {
                const trace = {};
                params.forEach((param) => {
                    if (param !== 'layout') {
                        trace[param] = config[param];
                    }
                });

                if ('x' in this_config) {
                    trace['y'] = this.ndframe.index;
                    trace['x'] = this.ndframe[this_config['x']].values;
                } else {
                    trace['x'] = this.ndframe.index;
                    trace['y'] = this.ndframe[this_config['y']].values;
                }

                trace['type'] = 'scatter';
                trace['mode'] = 'markers';
                generatePlot([trace], this_config, this.div);
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const data: any[] = [];
                let cols_to_plot;

                if ('columns' in this_config) {
                    cols_to_plot = this.____check_if_cols_exist(this_config['columns']);
                } else {
                    cols_to_plot = this.ndframe.column_names;
                }

                cols_to_plot.forEach((c_name) => {
                    const trace = {};
                    trace['y'] = this.ndframe.index;
                    trace['x'] = this.ndframe[c_name].values;
                    trace['name'] = c_name;
                    trace['type'] = 'scatter';
                    trace['mode'] = 'markers';
                    data.push(trace);
                });
                generatePlot(data, this_config, this.div);
            }
        }
    }

    hist(config = {}) {
        const ret_params = this.__get_plot_params(config);

        const this_config = ret_params[0];
        const params = ret_params[1] as any;

        if (this.ndframe instanceof this.danfojs.Series) {
            const trace = {};
            params.forEach((param) => {
                if (param !== 'layout') {
                    trace[param] = config[param];
                }
            });
            trace['x'] = this.ndframe.values;
            trace['type'] = 'histogram';
            generatePlot([trace], this_config, this.div);
        } else if ('x' in this_config) {
            const trace = {};
            params.forEach((param) => {
                if (param !== 'layout') {
                    trace[param] = config[param];
                }
            });
            trace['x'] = this.ndframe[this_config['y']].values;
            trace['type'] = 'histogram';
            generatePlot([trace], this_config, this.div);
        } else if ('y' in this_config) {
            const trace = {};
            params.forEach((param) => {
                if (param !== 'layout') {
                    trace[param] = config[param];
                }
            });
            trace['y'] = this.ndframe[this_config['y']].values;
            trace['type'] = 'histogram';
            generatePlot([trace], this_config, this.div);
        } else {
            const data: any[] = [];
            let cols_to_plot;

            if ('columns' in this_config) {
                cols_to_plot = this.____check_if_cols_exist(this_config['columns']);
            } else {
                cols_to_plot = this.ndframe.column_names;
            }

            cols_to_plot.forEach((c_name) => {
                const trace = {};
                trace['x'] = this.ndframe[c_name].values;
                trace['name'] = c_name;
                trace['type'] = 'histogram';
                data.push(trace);
            });
            generatePlot(data, this_config, this.div);
        }
    }

    pie(config = {}) {
        const ret_params = this.__get_plot_params(config);

        const this_config = ret_params[0];

        if (this.ndframe instanceof this.danfojs.Series) {
            const data = [
                {
                    values: this.ndframe.values,
                    labels: this.ndframe.index,
                    type: 'pie',
                    name: this_config['labels'],
                    hoverinfo: 'label+percent+name',
                    automargin: true
                }
            ];
            generatePlot(data, this_config, this.div);
        } else if ('values' in this_config && 'labels' in this_config) {
            if (!this.ndframe.column_names.includes(this_config['labels'])) {
                throw Error(
                    `Column Error: ${this_config['labels']} not found in columns. labels name must be one of [ ${this.ndframe.column_names}]`
                );
            }

            if (!this.ndframe.column_names.includes(this_config['values'])) {
                throw Error(
                    `Column Error: ${this_config['values']} not found in columns. value name must be one of [ ${this.ndframe.column_names}]`
                );
            }

            const data = [
                {
                    values: this.ndframe[this_config['values']].values,
                    labels: this.ndframe[this_config['labels']].values,
                    type: 'pie',
                    name: this_config['labels'],
                    hoverinfo: 'label+percent+name',
                    automargin: true
                }
            ];
            generatePlot(data, this_config, this.div);
        } else {
            let cols_to_plot;

            if ('columns' in this_config) {
                cols_to_plot = this.____check_if_cols_exist(this_config['columns']);
            } else {
                cols_to_plot = this.ndframe.column_names;
            }

            if ('row_pos' in this_config) {
                if (this_config['row_pos'].length != cols_to_plot.length - 1) {
                    throw Error(
                        `Lenght of row_pos array must be equal to number of columns. Got ${
                            this_config['row_pos'].length
                        }, expected ${cols_to_plot.length - 1}`
                    );
                }
            } else {
                const temp_arr: any[] = [];

                for (let i = 0; i < cols_to_plot.length - 1; i++) {
                    temp_arr.push(0);
                }

                this_config['row_pos'] = temp_arr;
            }

            if ('col_pos' in this_config) {
                if (this_config['col_pos'].length != cols_to_plot.length - 1) {
                    throw Error(
                        `Lenght of col_pos array must be equal to number of columns. Got ${
                            this_config['col_pos'].length
                        }, expected ${cols_to_plot.length - 1}`
                    );
                }
            } else {
                const temp_arr: any = [];

                for (let i = 0; i < cols_to_plot.length - 1; i++) {
                    temp_arr.push(i);
                }

                this_config['col_pos'] = temp_arr;
            }

            const data: any[] = [];
            cols_to_plot.forEach((c_name, i) => {
                const trace = {};
                trace['values'] = this.ndframe[c_name].values;
                trace['labels'] = this.ndframe[this_config['labels']].values;
                trace['name'] = c_name;
                trace['type'] = 'pie';
                trace['domain'] = {
                    row: this_config['row_pos'][i],
                    column: this_config['col_pos'][i]
                };
                trace['hoverinfo'] = 'label+percent+name';
                trace['textposition'] = 'outside';
                trace['automargin'] = true;
                data.push(trace);
            });

            if (!('grid' in this_config)) {
                const size = Number((this.ndframe.shape[1] / 2).toFixed()) + 1;
                this_config['grid'] = {
                    rows: size,
                    columns: size
                };
            }

            this_config['layout']['grid'] = this_config['grid'];
            generatePlot(data, this_config, this.div);
        }
    }

    box(config = {}) {
        const ret_params = this.__get_plot_params(config);

        const this_config = ret_params[0];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const params = ret_params[1] as any[];

        if (this.ndframe instanceof this.danfojs.Series) {
            const trace = {};
            const y = this.ndframe.values;
            params.forEach((param) => {
                if (param !== 'layout') {
                    trace[param] = config[param];
                }
            });
            trace['y'] = y;
            trace['type'] = 'box';
            generatePlot([trace], this_config, this.div);
        } else {
            if ('x' in this_config && 'y' in this_config) {
                if (!this.ndframe.column_names.includes(this_config['x'])) {
                    throw Error(`Column Error: ${this_config['x']} not found in columns`);
                }

                if (!this.ndframe.column_names.includes(this_config['y'])) {
                    throw Error(`Column Error: ${this_config['y']} not found in columns`);
                }

                const x = this.ndframe[this_config['x']].values;
                const y = this.ndframe[this_config['y']].values;
                const trace = {};
                trace['x'] = x;
                trace['y'] = y;
                trace['type'] = 'box';
                const xaxis = {};
                const yaxis = {};
                xaxis['title'] = this_config['x'];
                yaxis['title'] = this_config['y'];
                this_config['layout']['xaxis'] = xaxis;
                this_config['layout']['yaxis'] = yaxis;
                generatePlot([trace], this_config, this.div);
            } else if ('x' in this_config || 'y' in this_config) {
                const trace = {};
                params.forEach((param) => {
                    if (param !== 'layout') {
                        trace[param] = config[param];
                    }
                });

                if ('x' in this_config) {
                    trace['x'] = this.ndframe[this_config['x']].values;
                    trace['y'] = this.ndframe.index;
                    trace['type'] = 'box';
                } else {
                    trace['x'] = this.ndframe.index;
                    trace['y'] = this_config['y'];
                    trace['type'] = 'box';
                }

                generatePlot([trace], this_config, this.div);
            } else {
                const data: any[] = [];
                let cols_to_plot;

                if ('columns' in this_config) {
                    cols_to_plot = this.____check_if_cols_exist(this_config['columns']);
                } else {
                    cols_to_plot = this.ndframe.column_names;
                }

                cols_to_plot.forEach((c_name) => {
                    const trace = {};
                    params.forEach((param) => {
                        trace[param] = config[param];
                    });
                    trace['y'] = this.ndframe[c_name].values;
                    trace['name'] = c_name;
                    trace['type'] = 'box';
                    data.push(trace);
                });
                generatePlot(data, this_config, this.div);
            }
        }
    }

    violin(config = {}) {
        const ret_params = this.__get_plot_params(config);

        const this_config = ret_params[0];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const params = ret_params[1] as any[];

        if (this.ndframe instanceof this.danfojs.Series) {
            const trace = {};
            const y = this.ndframe.values;
            params.forEach((param) => {
                if (param !== 'layout') {
                    trace[param] = config[param];
                }
            });
            trace['y'] = y;
            trace['type'] = 'violin';
            generatePlot([trace], this_config, this.div);
        } else {
            if ('x' in this_config && 'y' in this_config) {
                if (!this.ndframe.column_names.includes(this_config['x'])) {
                    throw Error(`Column Error: ${this_config['x']} not found in columns`);
                }

                if (!this.ndframe.column_names.includes(this_config['y'])) {
                    throw Error(`Column Error: ${this_config['y']} not found in columns`);
                }

                const x = this.ndframe[this_config['x']].values;
                const y = this.ndframe[this_config['y']].values;
                const trace = {};
                trace['x'] = x;
                trace['y'] = y;
                trace['type'] = 'violin';
                const xaxis = {};
                const yaxis = {};
                xaxis['title'] = this_config['x'];
                yaxis['title'] = this_config['y'];
                this_config['layout']['xaxis'] = xaxis;
                this_config['layout']['yaxis'] = yaxis;
                generatePlot([trace], this_config, this.div);
            } else if ('x' in this_config || 'y' in this_config) {
                const trace = {};
                params.forEach((param) => {
                    if (param !== 'layout') {
                        trace[param] = config[param];
                    }
                });

                if ('x' in this_config) {
                    trace['x'] = this.ndframe[this_config['x']].values;
                    trace['y'] = this.ndframe.index;
                    trace['type'] = 'violin';
                } else {
                    trace['x'] = this.ndframe.index;
                    trace['y'] = this_config['y'];
                    trace['type'] = 'violin';
                }

                generatePlot([trace], this_config, this.div);
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const data: any[] = [];
                let cols_to_plot;

                if ('columns' in this_config) {
                    cols_to_plot = this.____check_if_cols_exist(this_config['columns']);
                } else {
                    cols_to_plot = this.ndframe.column_names;
                }

                cols_to_plot.forEach((c_name) => {
                    const trace = {};
                    params.forEach((param) => {
                        trace[param] = config[param];
                    });
                    trace['y'] = this.ndframe[c_name].values;
                    trace['name'] = c_name;
                    trace['type'] = 'violin';
                    data.push(trace);
                });
                generatePlot(data, this_config, this.div);
            }
        }
    }

    table(config = {}) {
        const ret_params = this.__get_plot_params(config);

        const this_config = ret_params[0];
        const header = {};
        const cells = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let cols_data: any[] = [];
        let cols_2_show;

        if ('columns' in this_config) {
            this_config['columns'].forEach((cname) => {
                if (!this.ndframe.column_names.includes(cname)) {
                    throw Error(
                        `Column Error: ${cname} not found in columns. Columns should be one of [ ${this.ndframe.column_names} ]`
                    );
                }

                const idx = this.ndframe.column_names.indexOf(cname);
                cols_data.push(this.ndframe.col_data[idx]);
            });
            cols_2_show = this_config['columns'];
        } else {
            cols_2_show = this.ndframe.column_names;
            cols_data = this.ndframe.col_data;
        }

        header['values'] = cols_2_show;
        cells['values'] = cols_data;

        if (this_config['header_style']) {
            Object.keys(this_config['header_style']).forEach((param) => {
                header[param] = this_config['header_style'][param];
            });
        }

        if (this_config['cell_style']) {
            Object.keys(this_config['cell_style']).forEach((param) => {
                cells[param] = this_config['cell_style'][param];
            });
        }

        const data = [
            {
                type: 'table',
                header: header,
                cells: cells
            }
        ];
        generatePlot(data, this_config, this.div);
    }

    __get_plot_params(config) {
        const params = Object.keys(config);
        const this_config = {};
        params.forEach((param) => {
            this_config[param] = config[param];
        });

        if (!('layout' in config)) {
            this_config['layout'] = {};
        }

        return [this_config, params];
    }

    ____check_if_cols_exist(cols) {
        cols.forEach((col) => {
            if (!this.ndframe.column_names.includes(col)) {
                throw Error(
                    `Column Error: ${col} not found in columns. Columns should be one of [ ${this.ndframe.column_names} ]`
                );
            }
        });
        return cols;
    }
}
