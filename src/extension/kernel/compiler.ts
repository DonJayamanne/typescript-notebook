import * as ts from 'typescript';
import { NotebookCell, NotebookDocument, Uri, workspace } from 'vscode';
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
       at runCode (/Users/donjayamanne/Desktop/Development/vsc/typescript-notebook/out/extension/kernel/server/codeExecution.js:64:33)
       at Object.execCode (/Users/donjayamanne/Desktop/Development/vsc/typescript-notebook/out/extension/kernel/server/codeExecution.js:98:30)
       at WebSocket.<anonymous> (/Users/donjayamanne/Desktop/Development/vsc/typescript-notebook/out/extension/kernel/server/index.js:47:41)
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

        // Update the source to account for top level awaits & other changes, etc.
        const sourceMap = Buffer.from(sourceMapLine.substring(sourceMapLine.indexOf(',') + 1), 'base64').toString();
        const sourceMapInfo = { original: sourceMap, updated: '' };
        transpiledCode = replaceTopLevelConstWithVar(cell, transpiledCode, sourceMapInfo, expectedImports);

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
    sourceMap: { original?: string; updated?: string },
    expectedImports: string
) {
    let parsedCode: ParsedCode;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options: any = { ecmaVersion: 2019 }; // Support minimum of Node 12 (which has support for ES2019)
    try {
        // If the parser fails, then we have a top level await.
        // In the catch block wrap the code.
        parsedCode = parse(source, options);
        // always wrap in IIFE (this was required only for top level awaits)
        // But for consistency, lets alawys use IIFE.
        source = `${expectedImports}${EOL}(() => {${EOL}${source}${EOL}})()`;
        parsedCode = parse(source, options);
    } catch (ex) {
        try {
            source = `${expectedImports}${EOL}(async () => {${EOL}${source}${EOL}})()`;
            parsedCode = parse(source, options);
        } catch (ex) {
            console.error(`Failed to parse code ${source}`, ex);
            return source;
        }
    }
    if (parsedCode.type !== 'File' || !Array.isArray(parsedCode.program.body) || parsedCode.program.body.length === 0) {
        return source;
    }
    const rangesToFix: LocationToFix[] = [];
    const body = getBodyOfAsyncIIFE(parsedCode);
    const variablesToDeclareGlobally: string[] = [];
    body.forEach((item) => {
        // Look for `const`, `var` & `let` and remove those keywords at the top level,
        // to convert them into gloabl variables.
        // This works great except for object destructing assignments, as follows
        // const obj = {a: 'prop', b:'name'};
        // var {a, b} = obj;
        // This will ger converted into `{a, b} = obj;`
        // But it needs to be `({a, b} = obj;)`
        // If we have object destructuring assignments, we need to wrap with `( .... )`
        if (item.type === 'VariableDeclaration') {
            if (['const', 'let', 'var'].includes(item.kind)) {
                rangesToFix.push(item);

                item.declarations.forEach((declaration) => {
                    if (declaration.id.type === 'Identifier') {
                        variablesToDeclareGlobally.push(declaration.id.name);
                    } else if (declaration.id.type === 'ObjectPattern') {
                        declaration.id.properties.forEach((prop) => {
                            if (prop.type !== 'Property') {
                                return;
                            }
                            variablesToDeclareGlobally.push(prop.value.name);
                        });
                    } else if (declaration.id.type === 'ArrayPattern') {
                        declaration.id.elements.forEach((ele) => {
                            if (ele.type !== 'Identifier') {
                                return;
                            }
                            variablesToDeclareGlobally.push(ele.name);
                        });
                    }
                });
            }
        } else if (item.type === 'ClassDeclaration') {
            // Look for `class` declarations and track them so we can change them to `this.<className> = class <className>`
            rangesToFix.push(item);
            variablesToDeclareGlobally.push(item.id.name);
        } else if (item.type === 'FunctionDeclaration') {
            // Look for `class` declarations and track them so we can change them to `this.<className> = class <className>`
            rangesToFix.push(item);
            variablesToDeclareGlobally.push(item.id.name);
        }
    });

    let updatedSource = updateCodeAndAdjustSourceMaps(source, rangesToFix, body, sourceMap);

    // Remember first line is empty, & that's reserved for declaration of global variables.
    // We add this after we process the code as we don't want the code to processs the code we injected.
    if (variablesToDeclareGlobally.length) {
        updatedSource = `var ${variablesToDeclareGlobally.join(', ')};${updatedSource}`;
    }
    return updatedSource;
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
    body: BodyDeclaration[],
    sourceMap: { original?: string; updated?: string }
): string {
    // if (positions.length === 0 || body.length === 0) {
    //     return source;
    // }
    // This is very slow, but shouldn't be too bad, we're not dealing with 100s of MB
    // besides this only happens when user runs a cell.
    const lines = source.split(/\r?\n/);
    type LineNumber = number;
    type OldColumn = number;
    type NewColumn = number;
    const linesUpdated = new Map<
        LineNumber,
        { adjustedColumns: Map<OldColumn, NewColumn>; firstOriginallyAdjustedColumn?: number; totalAdjustment: number }
    >();
    positions.forEach((item) => {
        const { loc, type } = item;
        switch (type) {
            case 'ClassDeclaration': {
                // const line = lines[loc.end.line - 1];
                const name = item.id.name;
                // if we have code such as `class HelloWord{ .... }`,
                // We inject `this.HelloWord = HelloWord;` in the first line of code.
                lines[1] = `${lines[1]}this.${name} = ${name};`;
                break;
            }
            case 'FunctionDeclaration': {
                // const line = lines[loc.end.line - 1];
                const name = item.id.name;
                // // if we have code such as `function sayHello(){ .... }`,
                // We inject `this.sayHello = sayHello;` in the first line of code.
                lines[1] = `${lines[1]}this.${name} = ${name};`;
                break;
            }
            case 'VariableDeclaration':
                {
                    const variableDeclaration = item as VariableDeclaration;
                    const { start, end } = loc;

                    if (variableDeclaration.kind === 'const') {
                        // Replace `const a = 1234;` with `( a = 1234);`
                        // We're just replacing the keyword `const` with `     (` ensuring we keep the same sapces.
                        // Preserve the position with empty spaces so that source maps don't get screwed up.
                        // Removing `const/var/let` keywords will make them global.
                        lines[start.line - 1] = lines[start.line - 1].replace('const', '    (');

                        // No need to update source maps, as the positions have not changed,
                        // we've added empty spaces to keep it the same (less screwing around with source maps).
                    } else {
                        // We're just replacing the keyword `var/let` with `  (` ensuring we keep the same sapces.
                        // Preserve the position with empty spaces so that source maps don't get screwed up.
                        // Removing `const/var/let` keywords will make them global.
                        lines[start.line - 1] = lines[start.line - 1].replace(variableDeclaration.kind, '  (');
                        // No need to update source maps, as the positions have not changed,
                        // we've added empty spaces to keep it the same (less screwing around with source maps).
                    }

                    // We could have multiple variables or constants
                    // E.g. `var a,b,c = 1234` needs to be changed to `  (a=undefined, b=undefined, c= 1243)`
                    variableDeclaration.declarations.forEach((declaraction) => {
                        if (declaraction.init) {
                            // Nothing to do.
                        } else {
                            // add `=undefined` after the variable name.
                            const declarationLine = lines[declaraction.id.loc.end.line - 1];
                            const currentAdjustments = linesUpdated.get(declaraction.id.loc.end.line) || {
                                adjustedColumns: new Map<OldColumn, NewColumn>(),
                                firstOriginallyAdjustedColumn: undefined,
                                totalAdjustment: 0
                            };
                            linesUpdated.set(declaraction.id.loc.end.line, currentAdjustments);
                            const totalAdjustment = currentAdjustments.totalAdjustment;
                            currentAdjustments.adjustedColumns.set(
                                declaraction.id.loc.end.column,
                                declaraction.id.loc.end.column + totalAdjustment + '=undefined'.length
                            );
                            lines[declaraction.id.loc.end.line - 1] = `${declarationLine.substring(
                                0,
                                declaraction.id.loc.end.column + totalAdjustment
                            )}=undefined${declarationLine.substring(declaraction.id.loc.end.column + totalAdjustment)}`;

                            // Update adjustments.
                            if (typeof currentAdjustments.firstOriginallyAdjustedColumn === 'undefined') {
                                currentAdjustments.firstOriginallyAdjustedColumn = declaraction.id.loc.end.column;
                            }
                            currentAdjustments.totalAdjustment += '=undefined'.length;
                        }
                    });

                    // Ok, now we need to add the `)`
                    const endLine = lines[end.line - 1];
                    const indexOfLastSimiColon = endLine.lastIndexOf(';');

                    // Remember, last character would be `;`, we need to add `)` before that.
                    // Also we're using typescript compiler, hence it would add the necessary `;`.
                    lines[end.line - 1] = `${endLine.substring(0, indexOfLastSimiColon)})${endLine.substring(
                        indexOfLastSimiColon
                    )}`;
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
    let lastLineUpdatedWithReturn = false;
    let lastLineNumber = -1;
    if (lastExpression.type === 'ExpressionStatement') {
        lines[lastExpression.loc.start.line - 1] = `return ${lines[lastExpression.loc.start.line - 1]}`;
        // Keep track to udpate source maps;
        const currentAdjustments = linesUpdated.get(lastExpression.loc.start.line) || {
            adjustedColumns: new Map<OldColumn, NewColumn>(),
            firstOriginallyAdjustedColumn: undefined,
            totalAdjustment: 0
        };
        linesUpdated.set(lastExpression.loc.start.line, currentAdjustments);

        if (typeof currentAdjustments.firstOriginallyAdjustedColumn === 'undefined') {
            currentAdjustments.firstOriginallyAdjustedColumn = lastExpression.loc.start.column;
        }
        currentAdjustments.totalAdjustment += 'return '.length;
        currentAdjustments.adjustedColumns.set(
            lastExpression.loc.start.column,
            lastExpression.loc.start.column + 'return '.length
        );
        lastLineUpdatedWithReturn = true;
        lastLineNumber = lastExpression.loc.start.line;
    }

    // If we don't have any original source maps, then nothing to update.
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
            generatedLine: mapping.generatedLine + 2, // We added a top empty line and one for start of IIFE
            name: mapping.name,
            originalColumn: mapping.originalColumn,
            originalLine: mapping.originalLine,
            source: mapping.source
        };
        // Check if we have adjusted the columns for this line.
        const adjustments = linesUpdated.get(mapping.generatedLine);
        if (adjustments?.adjustedColumns?.size) {
            const positionsInAscendingOrder = Array.from(adjustments.adjustedColumns.keys()).sort();
            positionsInAscendingOrder.forEach((adjustedColumn) => {
                const newColumn = adjustments.adjustedColumns.get(adjustedColumn)!;
                if (lastLineNumber === mapping.generatedLine && lastLineUpdatedWithReturn) {
                    newMapping.generatedColumn = newMapping.generatedColumn + newColumn;
                } else {
                    if (mapping.generatedColumn === adjustedColumn) {
                        // THIS IS wrong, what about subsequent columns...
                        newMapping.generatedColumn = newColumn;
                    }
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

    const requireStatements: string[] = [];
    imports.forEach((item: ts.ImportDeclaration) => {
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
            requireStatements.push(`require('${importFrom}')`);
            return;
        }
        if (importClause.isTypeOnly) {
            return;
        }
        if (importClause.name) {
            requireStatements.push(`${importClause.name.getText(program)} = require('${importFrom}')`);
        }
        if (importClause.namedBindings) {
            if (ts.isNamespaceImport(importClause.namedBindings)) {
                requireStatements.push(`${importClause.namedBindings.name.text} = require('${importFrom}')`);
            } else {
                const namedImportsForModule: string[] = [];
                importClause.namedBindings.elements.forEach((ele) => {
                    if (ele.propertyName) {
                        namedImportsForModule.push(`${ele.propertyName.text}:${ele.name.text}`);
                    } else {
                        namedImportsForModule.push(`${ele.name.text}`);
                    }
                });
                if (namedImportsForModule.length) {
                    requireStatements.push(`({${namedImportsForModule.join(', ')}} = require('${importFrom}'))`);
                }
            }
        }
    });
    return requireStatements.join(';');
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
    id:
        | { name: string; loc: BodyLocation; type: 'Identifier' | '<other>' }
        | {
              name: string;
              loc: BodyLocation;
              type: 'ObjectPattern';
              properties: { type: 'Property'; key: { name: string }; value: { name: string } }[];
          }
        | {
              name: string;
              loc: BodyLocation;
              type: 'ArrayPattern';
              elements: { name: string; type: 'Identifier' }[];
          };
    init?: { loc: BodyLocation };
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
