// Typings for the code in the jupyter extension
export interface IJupyterExtensionApi {
    registerNewNotebookContent(options: { defaultCellLanguage: string }): void;
    createBlankNotebook(options: { defaultCellLanguage: string }): Promise<void>;
}
