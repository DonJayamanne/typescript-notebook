import type { ImportDeclaration, SyntaxList } from 'typescript';
import { ExtensionContext, NotebookCell, NotebookDocument, Uri, workspace } from 'vscode';
import { EOL } from 'os';
import { MappingItem, RawSourceMap, SourceMapConsumer, SourceMapGenerator } from 'source-map';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { CodeObject } from '../server/types';
import { LineNumber, NewColumn, OldColumn, processTopLevelAwait } from './asyncWrapper';
import { getNotebookCwd } from '../utils';
declare const __webpack_require__: any;
declare const __non_webpack_require__: any;
let ts: typeof import('typescript');

let tmpDirectory: string | undefined;
const mapOfSourceFilesToNotebookUri = new Map<string, Uri>();
const mapFromCellToPath = new WeakMap<NotebookCell, CodeObject>();
const codeObjectToSourceMaps = new WeakMap<
    CodeObject,
    {
        raw: RawSourceMap;
        originalToGenerated: Map<number, Map<number, MappingItem>>;
        generatedToOriginal: Map<number, Map<number, MappingItem>>;
        originalToGeneratedCache: Map<string, { line?: number; column?: number }>;
        generatedToOriginalCache: Map<string, { line?: number; column?: number }>;
    }
>();

export namespace Compiler {
    export function register(context: ExtensionContext) {
        const typescriptPath = path.join(
            context.extensionUri.fsPath,
            'resources',
            'scripts',
            'node_modules',
            'typescript',
            'index.js'
        );
        const requireFunc = typeof __webpack_require__ === 'function' ? __non_webpack_require__ : require;
        ts = requireFunc(typescriptPath);
    }
    /**
     * Returns the Cell associated with the temporary file we create (used to enable debugging with source maps), this will
     */
    export function getCellFromTemporaryPath(sourceFilename: string): NotebookCell | undefined {
        if (mapOfSourceFilesToNotebookUri.has(sourceFilename)) {
            return getNotebookCellfromUri(mapOfSourceFilesToNotebookUri.get(sourceFilename));
        }
        if (sourceFilename.toLowerCase().endsWith('.nnb') || sourceFilename.toLowerCase().endsWith('.ipynb')) {
            const key = Array.from(mapOfSourceFilesToNotebookUri.keys()).find((item) => sourceFilename.includes(item));
            return getNotebookCellfromUri(key ? mapOfSourceFilesToNotebookUri.get(key) : undefined);
        }
    }
    /**
    * Will replace the bogus paths in stack trace with user friendly paths.
    * E.g. if the following is the stack trace we get back:
    * /var/folders/3t/z38qn8r53l169lv_1nfk8y6w0000gn/T/vscode-nodebook-sPmlC6/nodebook_cell_ch0000013.js:2
       console.log(x);
                   ^

   ReferenceError: x is not defined
       at hello (/var/folders/3t/z38qn8r53l169lv_1nfk8y6w0000gn/T/vscode-nodebook-sPmlC6/nodebook_cell_ch0000013.js:2:17)
       at /var/folders/3t/z38qn8r53l169lv_1nfk8y6w0000gn/T/vscode-nodebook-sPmlC6/nodebook_cell_ch0000012.js:1:1
       at Script.runInContext (vm.js:144:12)
       at Script.runInNewContext (vm.js:149:17)
       at Object.runInNewContext (vm.js:304:38)
       at runCode (/Users/donjayamanne/Desktop/Development/vsc/typescript-notebook/out/extension/kernel/server/codeExecution.js:64:33)
       at Object.execCode (/Users/donjayamanne/Desktop/Development/vsc/typescript-notebook/out/extension/kernel/server/codeExecution.js:98:30)
       at WebSocket.<anonymous> (/Users/donjayamanne/Desktop/Development/vsc/typescript-notebook/out/extension/kernel/server/index.js:47:41)
       at WebSocket.emit (events.js:375:28)
       at WebSocket.emit (domain.js:470:12)
    *
    * We need to repace the temporary paths `/var/folders/3t/z38qn8r53l169lv_1nfk8y6w0000gn/T/vscode-nodebook-sPmlC6/nodebook_cell_ch0000013.js` with the cell index.
    * & also remove all of the messages that are not relevant (VM stack trace).
    */
    export function fixCellPathsInStackTrace(
        document: NotebookDocument,
        error?: Error | string,
        replaceWithRealCellUri = false
    ): string {
        if (typeof error === 'object' && error.name === 'InvalidCode_CodeExecution') {
            error.name = 'SyntaxError';
            error.stack = '';
            return '';
        }
        let stackTrace = (typeof error === 'string' ? error : error?.stack) || '';
        let lineFound = false;
        if (stackTrace.includes('at Script.runInContext (vm.js')) {
            stackTrace = stackTrace.substring(0, stackTrace.indexOf('at Script.runInContext (vm.js')).trimEnd();
        }
        if (
            stackTrace.includes('extension/server/codeExecution.ts') ||
            stackTrace.includes('extension/server/codeExecution.js')
        ) {
            stackTrace = stackTrace.split(/\r?\n/).reduce((newStack, line, i) => {
                const separator = i > 0 ? '\n' : '';
                if (!lineFound) {
                    lineFound =
                        line.includes('extension/server/codeExecution.ts') ||
                        line.includes('extension/server/codeExecution.js');
                    if (!lineFound) {
                        newStack += `${separator}${line}`;
                    }
                }
                return newStack;
            }, '');
        }
        if (!stackTrace.includes('vscode-notebook-') || !stackTrace.includes('notebook_cell_')) {
            return stackTrace;
        }
        document.getCells().forEach((cell) => {
            const tempPath = mapFromCellToPath.get(cell);
            if (!tempPath) {
                return;
            }
            if (stackTrace.includes(tempPath.sourceFilename)) {
                const codeObject = Compiler.getCodeObject(cell);
                if (!codeObject) {
                    return;
                }
                const sourceMap = Compiler.getSourceMapsInfo(codeObject);
                if (!sourceMap) {
                    return;
                }
                const regex = new RegExp(tempPath.sourceFilename, 'g');
                const lines = stackTrace.split(tempPath.sourceFilename);
                lines
                    .filter((line) => line.startsWith(':'))
                    .forEach((stack) => {
                        const parts = stack.split(':').slice(1);
                        const line = parseInt(parts[0]);
                        const column = parseInt(parts[1]);
                        if (!isNaN(line) && !isNaN(column)) {
                            const mappedLocation = Compiler.getMappedLocation(
                                codeObject,
                                { line, column },
                                'DAPToVSCode'
                            );
                            if (typeof mappedLocation.line === 'number' && typeof mappedLocation.column === 'number') {
                                const textToReplace = `${tempPath.sourceFilename}:${line}:${column}`;

                                const textToReplaceWith = replaceWithRealCellUri
                                    ? `${cell.document.uri.toString()}:${mappedLocation.line}:${mappedLocation.column}`
                                    : `<Cell ${cell.index + 1}> [${mappedLocation.line}, ${mappedLocation.column}]`;
                                stackTrace = stackTrace.replace(textToReplace, textToReplaceWith);
                            }
                        }
                    });
                stackTrace = stackTrace.replace(regex, `<Cell ${cell.index + 1}> `);
            }
        });
        return stackTrace;
    }

    const dummyFnToUseImports = 'adf8d89dff594ea79f38d03905825d73';
    export function getSourceMapsInfo(codeObject: CodeObject) {
        return codeObjectToSourceMaps.get(codeObject);
    }
    export function getMappedLocation(
        codeObject: CodeObject,
        location: { line?: number; column?: number },
        direction: 'VSCodeToDAP' | 'DAPToVSCode'
    ): { line?: number; column?: number } {
        if (typeof location.line !== 'number' && typeof location.column !== 'number') {
            return location;
        }
        const sourceMap = getSourceMapsInfo(codeObject);
        if (!sourceMap) {
            return location;
        }
        if (typeof location.line !== 'number') {
            return location;
        }
        const cacheKey = `${location.line || ''},${location.column || ''}`;
        const cache =
            direction === 'VSCodeToDAP' ? sourceMap.originalToGeneratedCache : sourceMap.generatedToOriginalCache;
        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            return cachedData;
        }
        const mappedLocation = { ...location };
        if (direction === 'DAPToVSCode') {
            // There's no such mapping of this line number.
            const map = sourceMap.generatedToOriginal.get(location.line);
            if (!map) {
                return location;
            }
            const matchingItem = typeof location.column === 'number' ? map.get(location.column) : map.get(0)!;
            if (matchingItem) {
                mappedLocation.line = matchingItem.originalLine;
                mappedLocation.column = matchingItem.originalColumn;
            }
            // get the first item that has the lowest column.
            // TODO: Review this.
            else if (map.has(0)) {
                mappedLocation.line = map.get(0)!.originalLine;
                mappedLocation.column = map.get(0)!.originalColumn;
            } else {
                const column = Array.from(map.keys()).sort()[0];
                mappedLocation.line = map.get(column)!.originalLine;
                mappedLocation.column = map.get(column)!.originalColumn;
            }
        } else {
            const map = sourceMap.originalToGenerated.get(location.line);
            if (!map) {
                return location;
            }
            const matchingItem =
                typeof location.column === 'number'
                    ? // Find the next closes column we have, we if cannot find an exact match.
                      map.get(location.column) || map.get(location.column - 1) || map.get(location.column + 1)
                    : map.get(0)!;
            if (matchingItem) {
                mappedLocation.line = matchingItem.generatedLine;
                mappedLocation.column = matchingItem.generatedColumn;
            }
            // get the first item that has the lowest column.
            // TODO: Review this.
            else if (map.has(0)) {
                mappedLocation.line = map.get(0)!.generatedLine;
                mappedLocation.column = map.get(0)!.generatedColumn;
            } else {
                const column = Array.from(map.keys()).sort()[0];
                mappedLocation.line = map.get(column)!.generatedLine;
                mappedLocation.column = map.get(column)!.generatedColumn;
            }
        }

        cache.set(cacheKey, mappedLocation);
        return mappedLocation;
    }
    export function getCodeObject(cell: NotebookCell) {
        return mapFromCellToPath.get(cell)!;
    }
    export function getOrCreateCodeObject(
        cell: NotebookCell,
        code = cell.document.getText(),
        supportBreakingOnExceptionsInDebugger: boolean = true
    ): CodeObject {
        try {
            // Parser fails when we have comments in the last line, hence just add empty line.
            code = `${code}${EOL}`;
            const details = createCodeObject(cell);
            if (details.textDocumentVersion === cell.document.version) {
                return details;
            }
            let expectedImports = '';
            try {
                // If imports are not used, typescript will drop them.
                // Solution, add dummy code into ts that will make the compiler think the imports are used.
                // E.g. if we have `import * as fs from 'fs'`, then add `myFunction(fs)` at the bottom of the code
                // And once the JS is generated remove that dummy code.
                expectedImports = getExpectedImports(cell);
            } catch (ex) {
                console.error(`Failed to generate dummy placeholders for imports`);
            }
            // Even if the code is JS, transpile it (possibel user accidentally selected JS cell & wrote TS code)
            const result = ts.transpile(
                code,
                {
                    sourceMap: true,
                    inlineSourceMap: true,
                    sourceRoot: path.dirname(details.sourceFilename),
                    noImplicitUseStrict: true,
                    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
                    strict: false, // No way.
                    fileName: details.sourceFilename,
                    resolveJsonModule: true,
                    removeComments: true,
                    target: ts.ScriptTarget.ESNext, // Minimum Node12 (but let users use what ever they want). Lets look into user defined tsconfig.json.
                    module: ts.ModuleKind.CommonJS,
                    alwaysStrict: false,
                    checkJs: false, // We're not going to give errors, the user can get this from vscode problems window & linters, etc... why re-invent the wheel here.
                    noEmitHelpers: true,
                    esModuleInterop: true,
                    moduleResolution: ts.ModuleResolutionKind.NodeJs,
                    experimentalDecorators: true,
                    allowUnreachableCode: true,
                    preserveConstEnums: true,
                    allowJs: true,
                    rootDir: path.dirname(cell.notebook.uri.fsPath),
                    allowSyntheticDefaultImports: true,
                    skipLibCheck: true // We expect users to rely on VS Code to let them know if they have issues in their code.
                },
                details.sourceFilename
            );
            // let transpiledCode = result;
            // let transpiledCode = result.replace(
            //     'Object.defineProperty(exports, "__esModule", { value: true });',
            //     'Object.defineProperty(module.exports, "__esModule", { value: true });'
            // );
            let transpiledCode = result.replace(
                'Object.defineProperty(exports, "__esModule", { value: true });',
                ' '.repeat('Object.defineProperty(exports, "__esModule", { value: true });'.length)
            );
            // Remove `use strict`, this causes issues some times.
            // E.g. this code fails (dfd not found).
            /*
import * as dfd from 'danfojs-node';
const df: dfd.DataFrame = await dfd.read_csv('./finance-charts-apple.csv');
const layout = {
    title: 'A financial charts',
    xaxis: {
        title: 'Date',
    },
    yaxis: {
        title: 'Count',
    }
}
const newDf = df.set_index({ key: "Date" })
newDf.plot("").line({ columns: ["AAPL.Open", "AAPL.High"], layout })
            */

            // Split generated source & source maps
            const lines = transpiledCode.split(/\r?\n/).filter((line) => !line.startsWith(dummyFnToUseImports));
            const sourceMapLine = lines.pop()!;
            transpiledCode = lines.join(EOL);

            // Update the source to account for top level awaits & other changes, etc.
            const sourceMap = Buffer.from(sourceMapLine.substring(sourceMapLine.indexOf(',') + 1), 'base64').toString();
            const sourceMapInfo = { original: sourceMap, updated: '' };
            transpiledCode = replaceTopLevelConstWithVar(
                cell,
                transpiledCode,
                sourceMapInfo,
                expectedImports,
                supportBreakingOnExceptionsInDebugger
            );

            // Re-generate source maps correctly
            const updatedRawSourceMap: RawSourceMap = JSON.parse(
                sourceMapInfo.updated || sourceMapInfo.updated || sourceMap || ''
            );
            updatedRawSourceMap.file = path.basename(details.sourceFilename);
            updatedRawSourceMap.sourceRoot = path.dirname(details.sourceFilename);
            updatedRawSourceMap.sources = [path.basename(details.sourceFilename)];

            const updatedSourceMap = JSON.stringify(updatedRawSourceMap);
            // Node debugger doesn't seem to support inlined source maps
            // https://github.com/microsoft/vscode/issues/130303
            // Once available, uncomment this file & the code.
            // const transpiledCodeWithSourceFile = `${transpiledCode}${EOL}//# sourceURL=file:///${details.sourceFilename}`;
            // const transpiledCodeWithSourceMap = `${transpiledCode}${EOL}//# sourceMappingURL=data:application/json;base64,${Buffer.from(
            //     updatedSourceMap
            // ).toString('base64')}`;

            // updateCodeObject(details, cell, transpiledCodeWithSourceMap, updatedSourceMap);
            // details.code = transpiledCodeWithSourceFile;
            updateCodeObject(details, cell, transpiledCode, updatedSourceMap);
            const originalToGenerated = new Map<number, Map<number, MappingItem>>();
            const generatedToOriginal = new Map<number, Map<number, MappingItem>>();
            new SourceMapConsumer(updatedRawSourceMap).eachMapping((mapping) => {
                let maps = originalToGenerated.get(mapping.originalLine) || new Map<number, MappingItem>();
                originalToGenerated.set(mapping.originalLine, maps);
                maps.set(mapping.originalColumn, mapping);

                maps = generatedToOriginal.get(mapping.generatedLine) || new Map<number, MappingItem>();
                generatedToOriginal.set(mapping.generatedLine, maps);
                maps.set(mapping.generatedColumn, mapping);
            });
            codeObjectToSourceMaps.set(details, {
                raw: updatedRawSourceMap,
                originalToGenerated,
                generatedToOriginal,
                originalToGeneratedCache: new Map<string, { line?: number; column?: number }>(),
                generatedToOriginalCache: new Map<string, { line?: number; column?: number }>()
            });
            if (!process.env.__IS_TEST) {
                console.debug(`Compiled TS cell ${cell.index} into ${details.code}`);
            }
            return details;
        } catch (ex) {
            // Only for debugging.
            console.error('Yikes', ex);
            throw ex;
        }
    }
}

/**
     * Found that sometimes the repl crashes when we have trailing commas and an async.
     * The following sample code fails (but removing the trailing comments work):
tensor = tf.tensor([
    [
        [1,1,1],
        [0,0,0],
        [1,1,1]
    ],
    [
        [0,0,0],
        [1,1,1],
        [0,0,0]
    ],
    [
        [1,1,1],
        [0,0,0],
        [1,1,1]
    ]
]);
var big = tf.fill([10,10,4], 0.5)
// big
// // tensor = tensor.mult
// let m = await tf.node.encodePng(tensor);
const image = await tf.node.encodePng(tensor);
let fs = require('fs');
fs.writeFileSync('wow.png', image)
image
// console.log(img1);
// // let fs = require('fs');
// fs.writeFileSync('wow.png', img)
     */
// private removeTrailingComments(code: string) {
//     const lines = code.split(/\r?\n/).reverse();
//     let nonEmptyLineFound = false;
//     const reversedLines = lines.map((line) => {
//         const isEmpty = line.trim().length === 0 || line.trim().startsWith('//');
//         nonEmptyLineFound = nonEmptyLineFound || !isEmpty;
//         return nonEmptyLineFound ? line : '';
//     });
//     return reversedLines.reverse().join(EOL);
// }
/**
 * We cannot have top level constants.
 * Running the cell again will cause errors.
 * Solution, convert const to var.
 */
function replaceTopLevelConstWithVar(
    cell: NotebookCell,
    source: string,
    sourceMap: { original?: string; updated?: string },
    expectedImports: string,
    supportBreakingOnExceptionsInDebugger?: boolean
) {
    if (source.trim().length === 0) {
        return expectedImports;
    }

    const result = processTopLevelAwait(expectedImports, source, supportBreakingOnExceptionsInDebugger);
    try {
        updateCodeAndAdjustSourceMaps(result!.linesUpdated, sourceMap);
    } catch (ex) {
        console.error(`Failed to adjust source maps`, ex);
    }
    return result!.updatedCode;
}
function updateCodeAndAdjustSourceMaps(
    linesUpdated: Map<
        LineNumber,
        { adjustedColumns: Map<OldColumn, NewColumn>; firstOriginallyAdjustedColumn?: number; totalAdjustment: number }
    >,
    sourceMap: { original?: string; updated?: string }
) {
    // If we don't have any original source maps, then nothing to update.
    if (!sourceMap.original) {
        return;
    }

    // If we have changes, update the source maps now.
    const originalSourceMap: RawSourceMap = JSON.parse(sourceMap.original);
    const updated = new SourceMapGenerator({
        file: path.basename(originalSourceMap.file || ''),
        sourceRoot: path.dirname(originalSourceMap.sourceRoot || '')
    });
    const original = new SourceMapConsumer(originalSourceMap);
    original.eachMapping((mapping) => {
        const newMapping: MappingItem = {
            generatedColumn: mapping.generatedColumn,
            generatedLine: mapping.generatedLine + 2, // We added a top empty line and one after start of IIFE
            name: mapping.name,
            originalColumn: mapping.originalColumn,
            originalLine: mapping.originalLine,
            source: mapping.source
        };
        // // Check if we have adjusted the columns for this line.
        const oldValue = newMapping.generatedColumn;
        const adjustments = linesUpdated.get(newMapping.generatedLine);
        if (adjustments?.adjustedColumns?.size) {
            const positionsInAscendingOrder = Array.from(adjustments.adjustedColumns.keys()).sort();
            // Get all columns upto this current column, get the max column & its new position.
            const lastColumnUpdatedUptoThisColumn = positionsInAscendingOrder.filter(
                (item) => item <= newMapping.generatedColumn
            );
            if (lastColumnUpdatedUptoThisColumn.length) {
                const lastColumn = lastColumnUpdatedUptoThisColumn[lastColumnUpdatedUptoThisColumn.length - 1];
                const incrementBy = adjustments.adjustedColumns.get(lastColumn)! - lastColumn;
                newMapping.generatedColumn += incrementBy;
            }
        } else if (
            typeof adjustments?.firstOriginallyAdjustedColumn === 'number' &&
            mapping.originalColumn >= adjustments?.firstOriginallyAdjustedColumn
        ) {
            // Something is wrong in the code.
            newMapping.generatedColumn += adjustments.totalAdjustment;
        }
        // We need a test for this, assume we declare a variable and that line of code is indented
        // E.g. we have `    var x = 1234` (note the leading spaces)
        if (newMapping.generatedColumn < 0) {
            newMapping.generatedColumn = oldValue;
        }

        updated.addMapping({
            generated: {
                column: newMapping.generatedColumn,
                line: newMapping.generatedLine
            },
            original: {
                column: newMapping.originalColumn,
                line: newMapping.originalLine
            },
            source: newMapping.source,
            name: newMapping.name
        });
    });

    sourceMap.updated = updated.toString();
}
function createCodeObject(cell: NotebookCell) {
    if (mapFromCellToPath.has(cell)) {
        return mapFromCellToPath.get(cell)!;
    }
    const cwd = getNotebookCwd(cell.notebook);
    const codeObject: CodeObject = {
        code: '',
        sourceFilename: '',
        sourceMapFilename: '',
        friendlyName: cwd
            ? `${path.relative(cwd, cell.notebook.uri.fsPath)}?cell=${cell.index + 1}`
            : `${path.basename(cell.notebook.uri.fsPath)}?cell=${cell.index + 1}`,
        textDocumentVersion: -1
    };
    if (!tmpDirectory) {
        tmpDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-notebook-'));
    }
    codeObject.code = '';
    // codeObject.sourceFilename = codeObject.sourceFilename || cell.document.uri.toString();
    codeObject.sourceFilename =
        codeObject.sourceFilename || path.join(tmpDirectory, `notebook_cell_${cell.document.uri.fragment}.js`);
    codeObject.sourceMapFilename = codeObject.sourceMapFilename || `${codeObject.sourceFilename}.map`;
    mapOfSourceFilesToNotebookUri.set(codeObject.sourceFilename, cell.document.uri);
    mapOfSourceFilesToNotebookUri.set(cell.document.uri.toString(), cell.document.uri);
    mapFromCellToPath.set(cell, codeObject);
    return codeObject;
}
function updateCodeObject(codeObject: CodeObject, cell: NotebookCell, sourceCode: string, sourceMapText: string) {
    if (!tmpDirectory) {
        tmpDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-nodebook-'));
    }
    codeObject.code = sourceCode;

    if (codeObject.textDocumentVersion !== cell.document.version) {
        fs.writeFileSync(codeObject.sourceFilename, sourceCode);
        // if (sourceMapText) {
        //     fs.writeFileSync(codeObject.sourceMapFilename, sourceMapText);
        // }
    }
    codeObject.textDocumentVersion = cell.document.version;
    mapFromCellToPath.set(cell, codeObject);
    return codeObject;
}
function getNotebookCellfromUri(uri?: Uri) {
    if (!uri) {
        return;
    }
    const notebookUri = uri.fsPath.toLowerCase();
    const notebook = workspace.notebookDocuments.find((item) => item.uri.fsPath.toLowerCase() === notebookUri);
    if (notebook) {
        return notebook.getCells().find((cell) => cell.document.uri.toString() === uri.toString());
    }
}

function getExpectedImports(cell: NotebookCell) {
    const program = ts.createSourceFile(
        cell.document.uri.fsPath,
        cell.document.getText(),
        ts.ScriptTarget.ES2019,
        false,
        ts.ScriptKind.TS
    );
    const sourceList = program.getChildAt(0) as SyntaxList;
    const imports = sourceList
        .getChildren()
        .filter((item) => item.kind === ts.SyntaxKind.ImportDeclaration)
        .map((item) => item as ImportDeclaration);

    const requireStatements: string[] = [];
    const variables: string[] = [];
    imports.forEach((item: ImportDeclaration) => {
        if (!ts.isStringLiteral(item.moduleSpecifier)) {
            return;
        }
        const importFrom = item.moduleSpecifier.text;
        const position = cell.document.positionAt(item.moduleSpecifier.end);
        const line = cell.document.lineAt(position.line).text.trim();
        // We're only goinng to try to make this work for lines that start with `import ....`
        if (!line.startsWith('import')) {
            return;
        }
        const importClause = item.importClause;
        if (!importClause) {
            requireStatements.push(`void (require("${importFrom}"));`);
            return;
        }
        if (importClause.isTypeOnly) {
            return;
        }
        if (importClause.name) {
            variables.push(`var ${importClause.name.getText(program)};`);
            requireStatements.push(
                `void (${importClause.name.getText(program)} = __importDefault(require("${importFrom}")));`
            );
        }
        if (importClause.namedBindings) {
            if (ts.isNamespaceImport(importClause.namedBindings)) {
                variables.push(`var ${importClause.namedBindings.name.text};`);
                requireStatements.push(
                    `void (${importClause.namedBindings.name.text} = __importStar(require("${importFrom}")));`
                );
            } else {
                const namedImportsForModule: string[] = [];
                importClause.namedBindings.elements.forEach((ele) => {
                    if (ele.propertyName) {
                        variables.push(`var ${ele.name.text};`);
                        namedImportsForModule.push(`${ele.propertyName.text}:${ele.name.text}`);
                    } else {
                        variables.push(`var ${ele.name.text};`);
                        namedImportsForModule.push(`${ele.name.text}`);
                    }
                });
                if (namedImportsForModule.length) {
                    requireStatements.push(`void ({${namedImportsForModule.join(', ')}} = require("${importFrom}"));`);
                }
            }
        }
    });
    return `${variables.join('')}${requireStatements.join('')}`;
}
export type BaseNode<T> = {
    type: T;
    start: number;
    end: number;
    loc: BodyLocation;
    range?: [number, number];
};
type TokenLocation = { line: number; column: number };
type BodyLocation = { start: TokenLocation; end: TokenLocation };
type FunctionDeclaration = BaseNode<'FunctionDeclaration'> & {
    body: BlockStatement;
    id: { name: string; loc: BodyLocation };
};
export type VariableDeclaration = BaseNode<'VariableDeclaration'> & {
    kind: 'const' | 'var' | 'let';
    id: { name: string; loc: BodyLocation };
    // loc: BodyLocation;
    declarations: VariableDeclarator[];
};
type VariableDeclarator = BaseNode<'VariableDeclarator'> & {
    id:
        | (BaseNode<string> & { name: string; loc: BodyLocation; type: 'Identifier' | '<other>' })
        | (BaseNode<'ObjectPattern'> & {
              name: string;
              properties: { type: 'Property'; key: { name: string }; value: { name: string } }[];
          })
        | (BaseNode<'ArrayPattern'> & {
              name: string;
              elements: { name: string; type: 'Identifier' }[];
          });
    init?: { loc: BodyLocation };
    loc: BodyLocation;
};
type OtherNodes = BaseNode<'other'> & { loc: BodyLocation };
type ClassDeclaration = BaseNode<'ClassDeclaration'> & {
    id: { name: string; loc: BodyLocation };
};
type BodyDeclaration = ExpressionStatement | VariableDeclaration | ClassDeclaration | FunctionDeclaration | OtherNodes;
type BlockStatement = {
    body: BodyDeclaration[];
};
type ExpressionStatement = BaseNode<'ExpressionStatement'> & {
    expression:
        | (BaseNode<'CallExpression'> & {
              callee:
                  | (BaseNode<'ArrowFunctionExpression'> & { body: BlockStatement })
                  | (BaseNode<'CallExpression'> & {
                        body: BlockStatement;
                        callee: { name: string; loc: BodyLocation };
                    });
          })
        | BaseNode<'other'>;
    loc: BodyLocation;
};
