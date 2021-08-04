import { CodeObject } from './server/types';
import * as ts from 'typescript';
import { NotebookCell, NotebookDocument, Uri, workspace } from 'vscode';
import { EOL } from 'os';
import { parse, print } from 'recast';

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
let tmpDirectory: string | undefined;
const mapOfSourceFilesToNotebookUri = new Map<string, Uri>();
const mapFromCellToPath = new WeakMap<NotebookCell, CodeObject>();

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
export function updateCellPathsInStackTraceOrOutput(document: NotebookDocument, error: Error | string): string {
    if (typeof error === 'object' && error.name === 'InvalidCode_CodeExecution') {
        error.name = 'SyntaxError';
        error.stack = '';
        return '';
    }
    let stackTrace = typeof error === 'object' && error ? error.stack || '' : error || '';
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

export function getCodeObject(cell: NotebookCell): CodeObject {
    const code = cell.document.getText();
    let details = createCodeObject(cell, code, '');
    // Even if the code is JS, transpile it (possibel user accidentally selected JS cell & wrote TS code)
    const result = ts.transpileModule(code, {
        compilerOptions: {
            sourceMap: true,
            inlineSourceMap: false,
            sourceRoot: path.basename(details.sourceMapFilename),
            // noImplicitUseStrict: true,
            importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Preserve,
            strict: false,
            fileName: details.sourceFilename,
            resolveJsonModule: true,
            target: ts.ScriptTarget.ES2019, // Minimum Node12
            module: ts.ModuleKind.CommonJS,
            alwaysStrict: false,
            checkJs: false,
            // esModuleInterop: true,
            allowJs: true,
            allowSyntheticDefaultImports: true
        }
    });

    let transpiledCode = result.outputText
        .replace('Object.defineProperty(exports, "__esModule", { value: true });', '')
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
        .replace('"use strict";', '');
    // If we have async code, then wrap with `(async () => ..., see below.
    //
    // (async () => { return (
    // x = await Promise.resolve('1'));
    // })()
    //
    // This happens today in the backend when running the code in the repl.
    // If we wrap, the we dont need to use the npm, and we can map the line numbers more precisely.
    // TIP: We should probably add some metadata that indicates the range for the real code (thus ignoring stuff we added)
    // Also fails if we have a trailing comment, adding a new line helps.
    transpiledCode = replaceTopLevelConstWithVar(transpiledCode) + EOL;
    // transpiledCode = processTopLevelAwait(transpiledCode) || transpiledCode;

    // Calling again will ensure the source & source maps are updated.
    details = createCodeObject(cell, transpiledCode, result.sourceMapText || '');
    console.debug(`Compiled TS cell ${cell.index} into ${details.code}`);
    return details;
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
function replaceTopLevelConstWithVar(source: string) {
    let parsedCode: ParsedCode;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options: any = { ecmaVersion: 2019 }; // Support minimum of Node 12 (which has support for ES2019)
    try {
        // If the parser fails, then we have a top level await.
        // In the catch block wrap the code.
        parsedCode = parse(source, options);
    } catch (ex) {
        try {
            const modified = `(async () => {${EOL}${source}${EOL}})()`;
            // Possible user can write TS code in a JS cell, hence parser could fall over.
            // E.g. ES6 imports isn't supprted in nodejs for js files, & parsing that could faill.
            parsedCode = parse(modified, options);
        } catch (ex) {
            console.error(`Failed to parse code ${source}`, ex);
            return source;
        }
    }
    if (parsedCode.type !== 'File' || !Array.isArray(parsedCode.program.body)) {
        return source;
    }
    const body = parsedCode.program.body[0];
    if (body.type === 'VariableDeclaration' && body.kind === 'const') {
        body.kind = 'var';
        const result = print(parsedCode);
        // TODO: Use the soruce maps (required for debugging, etc).
        return result.code;
    }
    if (
        body.type === 'ExpressionStatement' &&
        body.expression.type === 'CallExpression' &&
        body.expression.callee.type === 'ArrowFunctionExpression'
    ) {
        body.expression.callee.body.body.forEach((item) => {
            if (item.type === 'VariableDeclaration' && item.kind === 'const') {
                item.kind = 'var';
            }
        });
        const result = print(parsedCode);
        // TODO: Use the soruce maps (required for debugging, etc).
        return result.code;
    }
    return source;
}
function createCodeObject(cell: NotebookCell, sourceCode: string, sourceMapText: string) {
    const codeObject: CodeObject = mapFromCellToPath.get(cell) || {
        code: '',
        sourceFilename: '',
        sourceMapFilename: '',
        textDocumentVersion: -1
    };
    // const fileName = `${cell.index}_${path.basename(cell.notebook.uri.fsPath)}`;
    // const cellPath = path.join(path.dirname(cell.document.uri.fsPath), fileName);
    // map.set(cellPath, cell);
    // mapFromCellToPath.set(cell, cellPath);
    // return cellPath;

    if (!tmpDirectory) {
        tmpDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-nodebook-'));
    }
    codeObject.code = sourceCode;
    codeObject.sourceFilename =
        codeObject.sourceFilename || path.join(tmpDirectory, `nodebook_cell_${cell.document.uri.fragment}.js`);
    codeObject.sourceMapFilename = codeObject.sourceMapFilename || `${codeObject.sourceFilename}.map`;

    if (codeObject.textDocumentVersion !== cell.document.version) {
        fs.writeFileSync(codeObject.sourceFilename, sourceCode);
        // Possible source map has not yet been generated.
        if (sourceMapText) {
            fs.writeFileSync(codeObject.sourceMapFilename, sourceMapText);
        }
    }
    codeObject.textDocumentVersion = cell.document.version;
    mapOfSourceFilesToNotebookUri.set(codeObject.sourceFilename, cell.document.uri);
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

type ParsedCode = {
    type: 'File' | '<other>';
    program: {
        type: 'Program';
        body: (
            | { type: 'FunctionDeclaration'; body: BlockStatement }
            | ExpressionStatement
            | { type: 'VariableDeclaration'; kind: 'const' | 'var' | 'let' }
            | { type: '<other>' }
        )[];
    };
};
type BlockStatement = {
    body: ({ type: 'VariableDeclaration'; kind: 'const' | 'var' | 'let' } | { type: '<other>' })[];
};
type ExpressionStatement = {
    type: 'ExpressionStatement';
    expression:
        | {
              callee: { body: BlockStatement; type: 'ArrowFunctionExpression' };
              type: 'CallExpression';
          }
        | {
              type: '<other>';
          };
};
