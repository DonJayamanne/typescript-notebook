import { CodeObject } from './server/types';
import * as ts from 'typescript';
import { NotebookCell, Uri } from 'vscode';
import { EOL } from 'os';
import { parse, print } from 'recast';
import * as path from 'path';

export class JavaScriptTypeScriptCompiler {
    public getCodeObject(cell: NotebookCell): CodeObject {
        const code = cell.document.getText();
        // if (cell.document.languageId === 'javascript') {
        //     return this.createCodeObject(code);
        // }

        // Even if the code is JS, transpile it (possibel user accidentally selected JS cell & wrote TS code)
        const transpiledCode = ts
            .transpileModule(code, {
                compilerOptions: {
                    sourceMap: true,
                    inlineSourceMap: true,
                    // noImplicitUseStrict: true,
                    // importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Preserve,
                    // strict: false,
                    allowJs: true,
                    allowSyntheticDefaultImports: true
                }
            })
            .outputText.replace('Object.defineProperty(exports, "__esModule", { value: true });', '')
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

        console.debug(`Compiled TS cell ${cell.index} into ${transpiledCode}`);
        const fileName = `${cell.index}_${path.basename(cell.notebook.uri.fsPath)}}`;
        const uri = Uri.file(path.join(path.dirname(cell.document.uri.fsPath), fileName));
        return this.createCodeObject(transpiledCode, uri);
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
    private removeTrailingComments(code: string) {
        const lines = code.split(/\r?\n/).reverse();
        let nonEmptyLineFound = false;
        const reversedLines = lines.map((line) => {
            const isEmpty = line.trim().length === 0 || line.trim().startsWith('//');
            nonEmptyLineFound = nonEmptyLineFound || !isEmpty;
            return nonEmptyLineFound ? line : '';
        });
        return reversedLines.reverse().join(EOL);
    }
    private createCodeObject(source: string, uri: Uri): CodeObject {
        // If we have async code, then wrap with `(async () => ..., see below.
        //
        // (async () => { return (
        // x = await Promise.resolve('1'));
        // })()
        //
        // This happens today in the backend when running the code in the repl.
        // If we wrap, the we dont need to use the npm, and we can map the line numbers more precisely.
        // TIP: We should probably add some metadata that indicates the range for the real code (thus ignoring stuff we added)

        return {
            code: this.replaceTopLevelConstWithVar(this.removeTrailingComments(source)),
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            fileName: uri.fsPath
        };
    }
    /**
     * We cannot have top level constants.
     * Running the cell again will cause errors.
     * Solution, convert const to var.
     */
    private replaceTopLevelConstWithVar(source: string) {
        const modified = `async function xyz() {${EOL}${source}${EOL}}`;
        try {
            // Possible user can write TS code in a JS cell, hence parser could fall over.
            // E.g. ES6 imports isn't supprted in nodejs for js files, & parsing that could faill.
            const parsedCode = parse(modified) as ParsedCode;
            if (
                parsedCode.type === 'File' &&
                Array.isArray(parsedCode.program.body) &&
                parsedCode.program.body[0].type === 'FunctionDeclaration'
            ) {
                parsedCode.program.body[0].body.body.forEach((item) => {
                    if (item.type === 'VariableDeclaration' && item.kind === 'const') {
                        item.kind = 'var';
                    }
                });
                const code = print(parsedCode).code.split(/\r?\n/);
                code.shift(); // Remove the function declaration we added along with the closing brackets.
                code.pop();
                return code.join(EOL);
            }
        } catch (ex) {
            //
        }
        return source;
    }
}

type ParsedCode = {
    type: 'File' | '<other>';
    program: {
        type: 'Program';
        body: ({ type: 'FunctionDeclaration'; body: BlockStatement } | { type: '<other>' })[];
    };
};
type BlockStatement = {
    body: ({ type: 'VariableDeclaration'; kind: 'const' | 'var' | 'let' } | { type: '<other>' })[];
};
