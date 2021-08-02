import { NotebookDocument } from 'vscode';

const executionOrders = new WeakMap<NotebookDocument, number>();
export class ExecutionOrder {
    public static reset(notebook: NotebookDocument) {
        executionOrders.delete(notebook);
    }
    public static getExecutionOrder(notebook: NotebookDocument) {
        const nextExecutionOrder = (executionOrders.get(notebook) || 0) + 1;
        executionOrders.set(notebook, nextExecutionOrder);
        return nextExecutionOrder;
    }
}
