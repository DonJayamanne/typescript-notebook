/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-unused-vars */
// This must be on top, do not change. Required by webpack.
// eslint-disable-next-line no-unused-vars
// declare let __webpack_public_path__: string;
// declare const scriptUrl: string;
// const getPublicPath = () => {
//     return new URL(scriptUrl.replace(/[^/]+$/, '')).toString();
// };

// eslint-disable-next-line prefer-const
// __webpack_public_path__ = getPublicPath();
// This must be on top, do not change. Required by webpack.

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import type { ActivationFunction, OutputItem } from 'vscode-notebook-renderer';
import type { KustoResponseDataSet } from 'azure-kusto-data/source/response';
import type { KustoResultTable } from 'azure-kusto-data/source/models';
import { hasDataTable } from './utils';
import ReactJson from 'react-json-view';
import { AgGridReact } from 'ag-grid-react';

import 'ag-grid-community/dist/styles/ag-grid.css';
import 'ag-grid-community/dist/styles/ag-theme-balham.css';
import { CellDoubleClickedEvent, ColDef, RowSelectedEvent } from 'ag-grid-community';
// import { request } from 'node:http';

export const activate: ActivationFunction = () => {
    return {
        renderOutputItem(outputItem, element) {
            renderOutput(outputItem, element);
        }
    };
};

/**
 * Called from renderer to render output.
 * This will be exposed as a public method on window for renderer to render output.
 */
function renderOutput(value: OutputItem, element: HTMLElement) {
    try {
        const style = document.createElement('style');
        style.type = 'text/css';
        style.media = 'screen';
        style.textContent = `
            .ag-cell,
            .ag-header-cell,
            .ag-header-container,
            .ag-header-viewport {
                overflow-x: hidden !important;
            }
        `;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        renderDataTable(value.json(), element);
        element.appendChild(style);
    } catch (ex) {
        console.error(`Failed to render output ${value.text()}`, ex);
    }
}
const columnDataType = new Map<string, string>();
function createAgGridData(resultTable: KustoResultTable) {
    const gridData = {
        columnDefs: [] as ColDef[],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rowData: [] as { [idx: string]: any }[]
    };
    columnDataType.clear();
    const columns = resultTable.columns;
    for (const col of columns) {
        const columnDef: ColDef = {
            headerName: col.name || '',
            field: col.name || '',
            sortable: true,
            // type: col.type || 'string',
            filter: true
        };
        // If we have some JSON, then ensure we stringify it.
        // Possible the JSON is already in string form.
        if (col.type === 'dynamic' && col.name) {
            columnDef.valueGetter = (param) => {
                const cellData = param.data[col.name || ''];
                return typeof cellData === 'string' ? cellData : JSON.stringify(cellData);
            };
        }
        gridData.columnDefs.push(columnDef);
        columnDataType.set(col.name || '', col.type || '');
    }

    for (const row of resultTable._rows) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rowDatum: { [idx: string]: any } = {};
        for (const col of columns) {
            rowDatum[col.name || ''] = row[col.ordinal];
        }
        gridData.rowData.push(rowDatum);
    }

    return gridData;
}

function renderDataTable(results: KustoResponseDataSet, ele: HTMLElement) {
    console.log('renderDataTable', results);
    if (!hasDataTable(results)) {
        console.error('No data table');
        return;
    }
    const data = createAgGridData(results.primaryResults[0]);
    ReactDOM.render(React.createElement(DataTable, data, null), ele);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DataTable(props: { columnDefs: any; rowData: any }) {
    function onCellDoubleClicked(e: CellDoubleClickedEvent) {
        if (columnDataType.get(e.colDef.field || '') === 'dynamic' && e.colDef.field) {
            try {
                const json =
                    typeof e.data[e.colDef.field] === 'string'
                        ? JSON.parse(e.data[e.colDef.field])
                        : e.data[e.colDef.field];
                console.info(`Displaying details for ${e.colDef.field}`);
                setDetailsField(e.colDef.field);
                setDetailsJson(json);
                displayDetails(true);
            } catch (ex) {
                setDetailsJson(undefined);
                console.error(
                    `Failed to parse details into JSON for ${e.colDef.field} with data ${e.data[e.colDef.field]}`,
                    ex
                );
            }
        }
    }
    function onRowSelected(e: RowSelectedEvent) {
        if (!detailsVisible || !detailsField) {
            console.info(`Nothing to render`);
            return;
        }
        try {
            const json =
                typeof e.data[detailsField] === 'string' ? JSON.parse(e.data[detailsField]) : e.data[detailsField];
            console.info(`Displaying details for ${detailsField}`);
            setDetailsJson(json);
        } catch (ex) {
            setDetailsJson(undefined);
        }
    }
    const [detailsVisible, displayDetails] = React.useState<boolean>(false);
    const [detailsField, setDetailsField] = React.useState<string | undefined>(undefined);
    const [detailsJson, setDetailsJson] = React.useState<any>(undefined);
    return (
        <div className="ag-theme-balham" style={{ width: '100%', backgroundColor: 'white' }}>
            <AgGridReact
                domLayout="autoHeight"
                pagination={true}
                paginationPageSize={10}
                defaultColDef={{ resizable: true, filter: true, sortable: true, floatingFilter: true }}
                columnDefs={props.columnDefs}
                rowData={props.rowData}
                rowSelection="multiple"
                rowMultiSelectWithClick={false}
                onCellDoubleClicked={onCellDoubleClicked}
                onRowSelected={onRowSelected}
            ></AgGridReact>
            {detailsVisible && detailsJson && (
                <ReactJson src={detailsJson} displayDataTypes={false} displayObjectSize={false} />
            )}
        </div>
    );
}
