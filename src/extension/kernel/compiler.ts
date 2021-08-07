import * as ts from 'typescript';
import { NotebookCell, NotebookDocument, Position, Uri, workspace } from 'vscode';
import { EOL } from 'os';
import { parse } from 'recast';
import { MappingItem, RawSourceMap, SourceMapConsumer, SourceMapGenerator } from 'source-map';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { CodeObject } from '../server/types';
let tmpDirectory: string | undefined;
const mapOfSourceFilesToNotebookUri = new Map<string, Uri>();
const mapFromCellToPath = new WeakMap<NotebookCell, CodeObject>();
const codeObjectToSourceMaps = new WeakMap<
    CodeObject,
    {
        raw: RawSourceMap;
        originalToGenerated: Map<number, Map<number, MappingItem>>;
        generatedToOriginal: Map<number, Map<number, MappingItem>>;
        mappingCache?: Map<string, [line: number, column: number]>;
    }
>();

const vmStartFrame = 'at Script.runInContext';

export function getCellFromTemporaryPath(sourceFilename: string): NotebookCell | undefined {
    if (mapOfSourceFilesToNotebookUri.has(sourceFilename)) {
        return getNotebookCellfromUri(mapOfSourceFilesToNotebookUri.get(sourceFilename));
    }
    if (sourceFilename.endsWith('.jsnb') || sourceFilename.endsWith('.tsjn') || sourceFilename.endsWith('.ipynb')) {
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
       at runCode (/Users/donjayamanne/Desktop/Development/vsc/vscode-typescript-notebook/out/extension/kernel/server/codeExecution.js:64:33)
       at Object.execCode (/Users/donjayamanne/Desktop/Development/vsc/vscode-typescript-notebook/out/extension/kernel/server/codeExecution.js:98:30)
       at WebSocket.<anonymous> (/Users/donjayamanne/Desktop/Development/vsc/vscode-typescript-notebook/out/extension/kernel/server/index.js:47:41)
       at WebSocket.emit (events.js:375:28)
       at WebSocket.emit (domain.js:470:12)
    *
    * We need to repace the temporary paths `/var/folders/3t/z38qn8r53l169lv_1nfk8y6w0000gn/T/vscode-nodebook-sPmlC6/nodebook_cell_ch0000013.js` with the cell index.
    * & also remove all of the messages that are not relevant (VM stack trace).
    */
export function updateCellPathsInStackTraceOrOutput(document: NotebookDocument, error?: Error | string): string {
    if (typeof error === 'object' && error.name === 'InvalidCode_CodeExecution') {
        error.name = 'SyntaxError';
        error.stack = '';
        return '';
    }
    let stackTrace = (typeof error === 'string' ? error : error?.stack) || '';
    const index = stackTrace.indexOf(vmStartFrame);
    if (index < 1) {
        return stackTrace;
    }
    stackTrace = stackTrace.substring(0, index);
    document.getCells().forEach((cell) => {
        const tempPath = mapFromCellToPath.get(cell);
        if (!tempPath) {
            return;
        }
        if (stackTrace.includes(tempPath.sourceFilename)) {
            const regex = new RegExp(tempPath.sourceFilename, 'g');
            stackTrace = stackTrace.replace(regex, `Cell ${cell.index + 1} `);
        }
    });
    return stackTrace;
}

const dummyFnToUseImports = 'adf8d89dff594ea79f38d03905825d73';
export function getSourceMapsInfo(codeObject: CodeObject) {
    return codeObjectToSourceMaps.get(codeObject);
}
export function getCodeObject(cell: NotebookCell): CodeObject {
    try {
        // Parser fails when we have comments in the last line, hence just add empty line.
        let code = `${cell.document.getText()}${EOL}`;
        const details = createCodeObject(cell);
        if (details.textDocumentVersion === cell.document.version) {
            return details;
        }
        try {
            const lines = code.split(/\r?\n/);
            // If imports are not used, typescript will drop them.
            // Solution, add dummy code into ts that will make the compiler think the imports are used.
            // E.g. if we have `import * as fs from 'fs'`, then add `myFunction(fs)` at the bottom of the code
            // And once the JS is generated remove that dummy code.
            const expectedImports = getExpectedImports(cell);
            expectedImports.forEach(({ imports, position }, moduleName) => {
                const requireStatements: string[] = [];
                const namedImports: string[] = [];
                imports.forEach((type) => {
                    if (type.importType === 'empty') {
                        requireStatements.push(`require('${moduleName}')`);
                    } else if ('var' in type.importType) {
                        requireStatements.push(`var ${type.importType.var} = require('${moduleName}')`);
                    } else if ('as' in type.importType) {
                        namedImports.push(`${type.importType.named}:${type.importType.as}`);
                    } else {
                        namedImports.push(`${type.importType.named}`);
                    }
                });
                requireStatements.push(`var {${namedImports.join(', ')}} = require('${moduleName}')`);
                if (requireStatements.length) {
                    lines[position.line] = `${requireStatements.join(';')};${lines[position.line]}`;
                }
            });
            if (expectedImports.size) {
                code = lines.join(EOL);
            }
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
                strict: false,
                fileName: details.sourceFilename,
                resolveJsonModule: true,
                removeComments: true,
                target: ts.ScriptTarget.ES2019, // Minimum Node12
                module: ts.ModuleKind.CommonJS,
                alwaysStrict: false,
                checkJs: false,
                noEmitHelpers: true,
                // esModuleInterop: true,
                allowJs: true,
                allowSyntheticDefaultImports: true
            },
            details.sourceFilename
        );
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

        // Update the source to account for top level awaits, etc.
        const sourceMap = Buffer.from(sourceMapLine.substring(sourceMapLine.indexOf(',') + 1), 'base64').toString();
        const sourceMapInfo = { original: sourceMap, updated: '' };
        transpiledCode = replaceTopLevelConstWithVar(cell, transpiledCode, sourceMapInfo);

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
        // transpiledCode = `${transpiledCode}${EOL}//# sourceMappingURL=data:application/json;base64,${Buffer.from(
        //     updatedSourceMap
        // ).toString('base64')}`;

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
            generatedToOriginal
        });
        console.debug(`Compiled TS cell ${cell.index} into ${details.code}`);
        return details;
    } catch (ex) {
        // Only for debugging.
        console.error('Yikes', ex);
        throw ex;
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
    sourceMap: { original?: string; updated?: string }
) {
    let parsedCode: ParsedCode;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options: any = { ecmaVersion: 2019 }; // Support minimum of Node 12 (which has support for ES2019)
    let wrappedWithIIFE = false;
    try {
        // If the parser fails, then we have a top level await.
        // In the catch block wrap the code.
        parsedCode = parse(source, options);
    } catch (ex) {
        try {
            source = `(async () => {${EOL}${source}})()`;
            // Possible user can write TS code in a JS cell, hence parser could fall over.
            // E.g. ES6 imports isn't supprted in nodejs for js files, & parsing that could faill.
            parsedCode = parse(source, options);
            wrappedWithIIFE = true;
        } catch (ex) {
            console.error(`Failed to parse code ${source}`, ex);
            return source;
        }
    }
    if (parsedCode.type !== 'File' || !Array.isArray(parsedCode.program.body) || parsedCode.program.body.length === 0) {
        return source;
    }
    const rangesToFix: LocationToFix[] = [];
    const body = wrappedWithIIFE ? getBodyOfAsyncIIFE(parsedCode) : parsedCode.program.body;

    body.forEach((item) => {
        // Look for `const` and track them so we can change them to `var`
        if (item.type === 'VariableDeclaration') {
            if (['const', 'let', 'var'].includes(item.kind)) {
                rangesToFix.push(item);
            }
        } else if (item.type === 'ClassDeclaration' && wrappedWithIIFE) {
            // Look for `class` declarations and track them so we can change them to `this.<className> = class <className>`
            rangesToFix.push(item);
        } else if (item.type === 'FunctionDeclaration' && wrappedWithIIFE) {
            // Look for `class` declarations and track them so we can change them to `this.<className> = class <className>`
            rangesToFix.push(item);
        }
    });

    return updateCodeAndAdjustSourceMaps(source, rangesToFix, wrappedWithIIFE, body, sourceMap);
}
function getBodyOfAsyncIIFE(parsedCode: ParsedCode) {
    const body = parsedCode.program.body[0];
    if (
        parsedCode.program.body.length === 1 &&
        body.type === 'ExpressionStatement' &&
        body.expression.type === 'CallExpression' &&
        body.expression.callee.type === 'ArrowFunctionExpression'
    ) {
        return body.expression.callee.body.body;
    }
    return parsedCode.program.body;
}
function updateCodeAndAdjustSourceMaps(
    source: string,
    positions: LocationToFix[],
    wrappedWithIIFE: boolean,
    body: BodyDeclaration[],
    sourceMap: { original?: string; updated?: string }
): string {
    if (positions.length === 0 || body.length === 0) {
        return source;
    }
    // This is very slow, but shouldn't be too bad, we're not dealing with 100s of MB
    // besides this only happens when user runs a cell.
    const lines = source.split(/\r?\n/);
    type LineNumber = number;
    type OldColumn = number;
    type NewColumn = number;
    const linesUpdated = new Map<LineNumber, Map<OldColumn, NewColumn>>();
    const updates = new Map<OldColumn, NewColumn>();
    updates.set(0, '(async () => {'.length);
    linesUpdated.set(1, updates);
    positions.forEach((item) => {
        const { loc, type } = item;
        switch (type) {
            case 'ClassDeclaration': {
                // const line = lines[loc.end.line - 1];
                const name = item.id.name;
                // if we have code such as `class HelloWord{ .... }`,
                // We inject `this.HelloWord = HelloWord;` in the first line of code.
                lines[0] = `${lines[0]}this.${name} = ${name};`;
                break;
            }
            case 'FunctionDeclaration': {
                // const line = lines[loc.end.line - 1];
                const name = item.id.name;
                // // if we have code such as `function sayHello(){ .... }`,
                // We inject `this.sayHello = sayHello;` in the first line of code.
                lines[0] = `${lines[0]}this.${name} = ${name};`;
                break;
            }
            case 'VariableDeclaration':
                {
                    const line = lines[loc.start.line - 1];
                    const variableDeclaration = item as VariableDeclaration;
                    const { start } = loc;
                    if (variableDeclaration.kind === 'const') {
                        // We're just replacing the keyword `const` with `var  ` ensuring we keep the same sapces.
                        // Preserve the position with empty spaces so that source maps don't get screwed up.
                        lines[start.line - 1] = `${line.substring(0, start.column)}var  ${line.substring(
                            variableDeclaration.declarations[0].id.loc.start.column
                        )}`;

                        // No need to update source maps, as the positions have not changed,
                        // we've added empty spaces to keep it the same (less screwing around with source maps).
                    }

                    if (!wrappedWithIIFE) {
                        return;
                    }
                    const linesUpdatedAndIncrementedColumns = new Map<number, { addedCharacters: number }>();
                    variableDeclaration.declarations.forEach((declaration) => {
                        // if we have `var xyz = 1234`, replace that with `var xyz = this.xyz = 1234`;
                        // if we have `var xyz = 1234, one = 234`, replace that with `var xyz = this.xyz = 1234, one = this.one = 234`;
                        const name = declaration.id.name;
                        const position = declaration.id.loc.end;
                        const line = lines[position.line - 1];
                        const extraCharacters = `=this.${name}`;

                        const lastUpdated = linesUpdatedAndIncrementedColumns.get(position.line);
                        const addedCharacters = lastUpdated?.addedCharacters || 0;
                        lines[position.line - 1] = `${line.substring(
                            0,
                            position.column + addedCharacters
                        )}${extraCharacters}${line.substring(declaration.id.loc.end.column + addedCharacters)}`;

                        linesUpdatedAndIncrementedColumns.set(position.line, {
                            addedCharacters: addedCharacters + extraCharacters.length
                        });

                        // Keep track to udpate source maps;
                        const changesToCode = linesUpdated.get(loc.end.line) || new Map<OldColumn, NewColumn>();
                        changesToCode.set(position.column, position.column + addedCharacters + extraCharacters.length);
                        linesUpdated.set(position.line, changesToCode);
                    });
                }
                break;
        }
    });

    // If the last node in the Body is a class, function or expression & we're in an IIFE, then return that value.
    // Because if you have code such as
    // ```typescript
    // const value = 1234;
    // value
    // ```
    // At this point the value of `value` will be printed out.
    // But if we wrap this in IIFE, then nothing will happen, hence we need a return `statement`
    // Ie. we need
    // ```typescript
    // (async () => {
    // const value = 1234;
    // return value
    // })()
    // ```
    const lastExpression = body[body.length - 1];
    if (wrappedWithIIFE && lastExpression.type === 'ExpressionStatement') {
        lines[lastExpression.loc.start.line - 1] = `return ${lines[lastExpression.loc.start.line - 1]}`;
        // Keep track to udpate source maps;
        const changesToCode = linesUpdated.get(lastExpression.loc.start.line) || new Map<OldColumn, NewColumn>();
        changesToCode.set(0, 'return '.length);
        linesUpdated.set(lastExpression.loc.start.line, changesToCode);
    }

    if (!sourceMap.original) {
        return lines.join(EOL);
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
            generatedLine: mapping.generatedLine + (wrappedWithIIFE ? 1 : 0),
            name: mapping.name,
            originalColumn: mapping.originalColumn,
            originalLine: mapping.originalLine,
            source: mapping.source
        };
        // Check if we have adjusted the columns for this line.
        const adjustments = linesUpdated.get(mapping.generatedLine);
        if (adjustments?.size) {
            const positionsInAscendingOrder = Array.from(adjustments.keys()).sort();
            positionsInAscendingOrder.forEach((adjustedColumn) => {
                const newColumn = adjustments.get(adjustedColumn)!;
                if (mapping.generatedColumn === adjustedColumn) {
                    newMapping.generatedColumn = newColumn;
                }
            });
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
    const contents = lines.join(EOL);

    updated.setSourceContent(originalSourceMap.file || '', contents);
    sourceMap.updated = updated.toString();

    return contents;
}
function createCodeObject(cell: NotebookCell) {
    if (mapFromCellToPath.has(cell)) {
        return mapFromCellToPath.get(cell)!;
    }
    const codeObject: CodeObject = {
        code: '',
        sourceFilename: '',
        // sourceMapFilename: '',
        friendlyName: `${path.basename(cell.notebook.uri.fsPath)}?cell=${cell.index + 1}`,
        textDocumentVersion: -1
    };
    if (!tmpDirectory) {
        tmpDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-nodebook-'));
    }
    codeObject.code = '';
    codeObject.sourceFilename =
        codeObject.sourceFilename || path.join(tmpDirectory, `nodebook_cell_${cell.document.uri.fragment}.js`);
    // codeObject.sourceMapFilename = codeObject.sourceMapFilename || `${codeObject.sourceFilename}.map`;
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

// function check(cell: NotebookCell) {
//     const imports = getImports(cell);
//     if (imports.length === 0) {
//         return;
//     }

//     imports.forEach((item) => {
//         if (item.modifiers){
//             if (item.importClause?.isTypeOnly){
//                 return;
//             }
//             item.modifiers.forEach(mod => {
//                 if (mod.)
//                 const moduleName = item.
//                 const start = cell.document.positionAt(item.pos);
//                 const end = cell.document.positionAt(item.end);
//                 const name = item.namedBindings?.forEachChild(cbNode => );
//                 const target = item.name?.escapedText;
//                 const pair: Record<string, string> = {[item.name?.escapedText]}
//             });
//         } else {
//             // We need just a `require(<moduleName>)`
//             // TODO:
//         }
//     });
// }

type ImportType = {
    importType: 'empty' | { var: string } | { named: string } | { named: string; as: string };
    location: { start: number; end: number };
};
type ImportTypes = ImportType[];
// function getImportAdjustments(cell: NotebookCell, transpiledSource: string | BodyDeclaration[]) {
//     const requiredImports = getExpectedImports(cell);
//     const registeredImports = getGeneratedImports(transpiledSource);
//     const importsToRegister: string[] = [];
//     requiredImports.forEach((imports, moduleName) => {
//         const generatedImports = registeredImports.get(moduleName);
//         const namedImports: string[] = [];
//         function regsiterMissingImport(item: ImportType) {
//             if (item.importType === 'empty') {
//                 importsToRegister.push(`require('${moduleName}');`);
//             } else if ('var' in item.importType) {
//                 importsToRegister.push(`var ${item.importType.var} = require('${moduleName}');`);
//             } else if ('as' in item.importType) {
//                 namedImports.push(`${item.importType.named} as ${item.importType.as}`);
//             } else {
//                 namedImports.push(item.importType.named);
//             }
//         }
//         if (!generatedImports) {
//             imports.forEach(regsiterMissingImport);
//         } else {
//             imports
//                 .filter((item) => {
//                     return !generatedImports.find(
//                         (generated) => generated.importType.toString() === item.importType.toString()
//                     );
//                 })
//                 .forEach(regsiterMissingImport);
//         }
//         if (namedImports.length) {
//             importsToRegister.push(`var {${namedImports.join(', ')}} = require('${moduleName}');`);
//         }
//     });

//     // If we have a cell with `import * as fs from 'fs'`,
//     return importsToRegister;
// }
// function getGeneratedImports(source: string | BodyDeclaration[]) {
//     let body: BodyDeclaration[] = [];
//     if (Array.isArray(source)) {
//         body = source;
//     } else {
//         const node: acorn.Node = acorn.parse(source, { ecmaVersion: 2019 });
//         body = (node as any).body;
//     }
//     // eslint-disable-next-line @typescript-eslint/no-explicit-any
//     const varDecs = (body as any).filter(
//         (item) => item.type === 'VariableDeclaration' || item.type === 'ExpressionStatement'
//     );
//     const requires = new Map<string, ImportTypes>();
//     varDecs.forEach((item) => {
//         if (item.type === 'ExpressionStatement') {
//             if (
//                 item.expression &&
//                 item.expression.callee &&
//                 item.expression.callee.type === 'Identifier' &&
//                 item.expression.callee.name === 'require' &&
//                 Array.isArray(item.expression.arguments) &&
//                 item.expression.arguments.length === 1 &&
//                 item.expression.arguments[0].type === 'Literal'
//             ) {
//                 const namedImports: ImportTypes = requires.get(item.expression.arguments[0].value) || [];
//                 namedImports.push({ importType: 'empty', location: { start: item.start, end: item.end } });
//                 requires.set(item.expression.arguments[0].value, namedImports);
//             }
//             return;
//         }
//         if (ts.isExpressionStatement(item)) {
//             console.log('OK');
//             const expression = item.expression;
//             if (ts.isCallExpression(expression)) {
//                 console.log(expression);
//                 return;
//             }
//             return;
//         }
//         if (!Array.isArray(item.declarations) || item.declarations.length === 0) {
//             console.log('WTF');
//             return;
//         }
//         if (item.declarations.length !== 1) {
//             return;
//         }
//         const init = item.declarations[0].init;
//         if (
//             !init ||
//             init.type !== 'CallExpression' ||
//             init.callee.name !== 'require' ||
//             !Array.isArray(init.arguments) ||
//             init.arguments.length !== 1 ||
//             init.arguments[0].type !== 'Literal'
//         ) {
//             // console.log(JSON.stringify(item));
//             return;
//         }
//         const importFrom = init.arguments[0].value;
//         const namedImports: ImportTypes = requires.get(importFrom) || [];
//         if (item.declarations[0].id.type === 'Identifier') {
//             namedImports.push({
//                 importType: { var: item.declarations[0].id.name },
//                 location: { start: item.start, end: item.end }
//             });
//         } else if (
//             item.declarations[0].id.type === 'ObjectPattern' &&
//             item.declarations[0].id.properties.every((prop) => prop.type === 'Property' && prop.kind === 'init')
//         ) {
//             item.declarations[0].id.properties.forEach((prop) => {
//                 if (prop.key.name === prop.value.name) {
//                     namedImports.push({
//                         importType: { named: prop.value.name as string },
//                         location: { start: item.start, end: item.end }
//                     });
//                 } else {
//                     namedImports.push({
//                         importType: { named: prop.key.name, as: prop.value.name },
//                         location: { start: item.start, end: item.end }
//                     });
//                 }
//             });
//         }
//         if (namedImports.length) {
//             requires.set(importFrom, namedImports);
//         }
//     });
//     return requires;
// }
function getExpectedImports(cell: NotebookCell) {
    const program = ts.createSourceFile(
        cell.document.uri.fsPath,
        cell.document.getText(),
        ts.ScriptTarget.ES2019,
        false,
        ts.ScriptKind.TS
    );
    const sourceList = program.getChildAt(0) as ts.SyntaxList;
    const imports = sourceList
        .getChildren()
        .filter((item) => item.kind === ts.SyntaxKind.ImportDeclaration)
        .map((item) => item as ts.ImportDeclaration);

    const expectedImports = new Map<string, { imports: ImportTypes; position: Position }>();
    imports.forEach((item: ts.ImportDeclaration) => {
        const namedImports: ImportTypes = [];
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
        expectedImports.set(importFrom, { imports: namedImports, position });
        const importClause = item.importClause;
        if (!importClause) {
            namedImports.push({ importType: 'empty', location: { start: item.pos, end: item.end } });
            return;
        }
        if (importClause.isTypeOnly) {
            return;
        }
        if (importClause.name) {
            namedImports.push({
                importType: { named: importClause.name.getText(program) },
                location: { start: item.pos, end: item.end }
            });
        }
        if (importClause.namedBindings) {
            if (ts.isNamespaceImport(importClause.namedBindings)) {
                namedImports.push({
                    importType: { var: importClause.namedBindings.name.text },
                    location: { start: item.pos, end: item.end }
                });
                return;
            }
            importClause.namedBindings.elements.forEach((ele) => {
                if (ele.propertyName) {
                    namedImports.push({
                        importType: { named: ele.propertyName.text, as: ele.name.text },
                        location: { start: item.pos, end: item.end }
                    });
                } else {
                    namedImports.push({
                        importType: { named: ele.name.text },
                        location: { start: item.pos, end: item.end }
                    });
                }
            });
        }
    });
    return expectedImports;
}
type TokenLocation = { line: number; column: number };
type BodyLocation = { start: TokenLocation; end: TokenLocation };
type LocationToFix = FunctionDeclaration | ClassDeclaration | VariableDeclaration;
type FunctionDeclaration = {
    type: 'FunctionDeclaration';
    body: BlockStatement;
    id: { name: string; loc: BodyLocation };
    loc: BodyLocation;
};
type VariableDeclaration = {
    type: 'VariableDeclaration';
    kind: 'const' | 'var' | 'let';
    id: { name: string; loc: BodyLocation };
    loc: BodyLocation;
    declarations: VariableDeclarator[];
};
type VariableDeclarator = {
    type: 'VariableDeclarator';
    id: { name: string; loc: BodyLocation };
    loc: BodyLocation;
};
type OtherNodes = { type: '<other>'; loc: BodyLocation };
type ClassDeclaration = { type: 'ClassDeclaration'; id: { name: string; loc: BodyLocation }; loc: BodyLocation };
type BodyDeclaration = ExpressionStatement | VariableDeclaration | ClassDeclaration | FunctionDeclaration | OtherNodes;
type ParsedCode = {
    type: 'File' | '<other>';
    program: {
        type: 'Program';
        body: BodyDeclaration[];
    };
};
type BlockStatement = {
    body: BodyDeclaration[];
};
type ExpressionStatement = {
    type: 'ExpressionStatement';
    expression:
        | {
              callee: { body: BlockStatement; type: 'ArrowFunctionExpression'; loc: BodyLocation };
              type: 'CallExpression';
              loc: BodyLocation;
          }
        | {
              type: '<other>';
              loc: BodyLocation;
          };
    loc: BodyLocation;
};
