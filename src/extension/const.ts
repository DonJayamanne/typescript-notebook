export const notebookType = 'node-notebook';

const writingToConsoleOutputCompletdMarker = 'd1786f7c-d2ed-4a27-bd8a-ce19f704d111';

export function createConsoleOutputCompletedMarker(requestId: string) {
    return `${writingToConsoleOutputCompletdMarker}-${requestId}`;
}
