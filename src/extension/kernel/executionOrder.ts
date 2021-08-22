import { NotebookDocument } from 'vscode';

const executionOrders = new WeakMap<NotebookDocument, number>();
export function resetExecutionOrder(notebook: NotebookDocument) {
    executionOrders.delete(notebook);
}
export function getNextExecutionOrder(notebook: NotebookDocument) {
    const nextExecutionOrder = (executionOrders.get(notebook) || 0) + 1;
    executionOrders.set(notebook, nextExecutionOrder);
    return nextExecutionOrder;
}
