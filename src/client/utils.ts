import { KustoResponseDataSet } from 'azure-kusto-data/source/response';

interface Schema {
    fields: Field[];
    primaryKey?: string[];
}
export interface Field {
    name: string;
    type: string;
}
export interface Datapoint {
    [fieldName: string]: any;
}
export interface TabularData {
    schema: Schema;
    data: Datapoint[];
}

export function hasDataTable(results: KustoResponseDataSet) {
    if (results.primaryResults.length === 0) {
        return false;
    }
    return true;
}
export function getTabularData(results: KustoResponseDataSet): TabularData | undefined {
    if (!hasDataTable(results)) {
        return;
    }
    const primaryTable = results.primaryResults[0];
    const fields: Field[] = primaryTable.columns as any;
    const dataPoints = primaryTable._rows.map((items) => {
        const row: Datapoint = {};
        primaryTable.columns.forEach((col) => {
            if (col.name) {
                row[col.name] = items[col.ordinal];
            }
        });
        return row;
    });
    return {
        data: dataPoints,
        schema: {
            fields: fields
        }
    };
}
