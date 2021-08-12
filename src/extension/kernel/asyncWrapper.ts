// Source https://github.com/nodejs/node/blob/master/lib/internal/repl/await.js

'use strict';

import { Parser as parser } from 'acorn';
import * as walk from 'acorn-walk';
import { EOL } from 'os';

function isTopLevelDeclaration(state) {
    return (
        state.ancestors[state.ancestors.length - 2] === state.body ||
        state.ancestors[state.ancestors.length - 2] === state.tryStatementBody
    );
}

type State = {
    body: BodyDeclaration;
    tryStatementBody: BodyDeclaration;
    lines: string[];
    containsAwait: boolean;
    containsReturn: boolean;
    hoistedDeclarations: string[];
    variablesToDeclare: string[];
    ancestors: BaseNode<string>[];
    getAdjustment: (line: number) => {
        adjustedColumns: Map<OldColumn, NewColumn>;
        firstOriginallyAdjustedColumn?: number;
        totalAdjustment: number;
    };
};
export type LineNumber = number;
export type OldColumn = number;
export type NewColumn = number;

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};
const visitorsWithoutAncestors = {
    ClassDeclaration(node, state: State, c) {
        if (isTopLevelDeclaration(state)) {
            state.hoistedDeclarations.push(`this.${node.id.name} = ${node.id.name}; `);
            state.variablesToDeclare.push(node.id.name);
        }

        walk.base.ClassDeclaration(node, state, c);
    },
    ForOfStatement(node, state: State, c) {
        if (node.await === true) {
            state.containsAwait = true;
        }
        walk.base.ForOfStatement(node, state, c);
    },
    FunctionDeclaration(node, state) {
        state.hoistedDeclarations.push(`this.${node.id.name} = ${node.id.name}; `);
        state.variablesToDeclare.push(node.id.name);
    },
    FunctionExpression: noop,
    ArrowFunctionExpression: noop,
    MethodDefinition: noop,
    AwaitExpression(node, state: State, c) {
        state.containsAwait = true;
        walk.base.AwaitExpression(node, state, c);
    },
    ReturnStatement(node, state: State, c) {
        state.containsReturn = true;
        walk.base.ReturnStatement(node, state, c);
    },
    VariableDeclaration(node: VariableDeclaration, state: State, c) {
        const variableKind = node.kind;
        const isIterableForDeclaration = ['ForOfStatement', 'ForInStatement'].includes(
            state.ancestors[state.ancestors.length - 2].type
        );

        if (variableKind === 'var' || isTopLevelDeclaration(state)) {
            const line = state.lines[node.loc.start.line - 1];
            // Replace `var xyz = 1234` with `xyz = 1234` or `xyz=undefined`
            // Replace `var xyz ` with `xyz = undefined`
            // Replace `var xyz, abc ` with `xyz = undefined, abc = undefined`
            // Replace `var xyz = 1234` with `xyz = 1234` or `xyz=undefined` depending on the number of declarations we have
            // Remember for each declaration we already wrap with `(..)`, hence if we have just one variable, then
            // no need of wrapping with `(..)`, else we unnecessarily end up with two.
            const replacement = node.declarations.length === 1 ? '' : '';
            state.lines[node.loc.start.line - 1] = line.replace(node.kind, replacement);
            const adjustment = state.getAdjustment(node.loc.start.line);
            // Track adjustments.
            adjustment.firstOriginallyAdjustedColumn =
                adjustment.firstOriginallyAdjustedColumn ?? node.loc.start.column;
            adjustment.totalAdjustment += replacement.length - node.kind.length;

            if (!isIterableForDeclaration) {
                node.declarations.forEach((decl) => {
                    // The name of the variable will start and end in the same line, hence we can use either `start.line` or `end.line`
                    const declarationLine = state.lines[decl.id.loc.start.line - 1];
                    let currentAdjustments = state.getAdjustment(decl.id.loc.start.line);
                    let totalAdjustment = currentAdjustments.totalAdjustment;

                    if (decl.id.type === 'ArrayPattern' || decl.id.type === 'ObjectPattern') {
                        // 1. First add the leading `(` (only if we have array or object patterns, i.e `var {a} = ...`)
                        state.lines[decl.id.loc.start.line - 1] = `${declarationLine.substring(
                            0,
                            decl.id.loc.start.column + totalAdjustment
                        )}(${declarationLine.substring(decl.id.loc.start.column + totalAdjustment)}`;

                        // 1.a Track this adjustment
                        currentAdjustments.adjustedColumns.set(
                            decl.id.loc.start.column,
                            decl.id.loc.start.column + totalAdjustment + '('.length
                        );
                        currentAdjustments.firstOriginallyAdjustedColumn =
                            currentAdjustments.firstOriginallyAdjustedColumn ?? decl.id.loc.start.column;
                        currentAdjustments.totalAdjustment += '('.length;
                    }

                    // 2. Next add the trailing `)` (if we don't have a variable initialize, then initialize to `undefined`)
                    const trailingBrackets =
                        decl.id.type === 'ArrayPattern' || decl.id.type === 'ObjectPattern' ? ')' : '';
                    const textToAdd = decl.init ? trailingBrackets : `=undefined${trailingBrackets}`;
                    const endLine = state.lines[decl.loc.end.line - 1];
                    currentAdjustments = state.getAdjustment(decl.loc.end.line);
                    totalAdjustment = currentAdjustments.totalAdjustment;
                    state.lines[decl.loc.end.line - 1] = `${endLine.substring(
                        0,
                        decl.loc.end.column + totalAdjustment
                    )}${textToAdd}${endLine.substring(decl.loc.end.column + totalAdjustment)}`;

                    // 2.a Track this adjustment
                    currentAdjustments.adjustedColumns.set(
                        decl.loc.end.column,
                        decl.loc.end.column + totalAdjustment + textToAdd.length
                    );
                    currentAdjustments.firstOriginallyAdjustedColumn =
                        currentAdjustments.firstOriginallyAdjustedColumn ?? decl.loc.end.column;
                    currentAdjustments.totalAdjustment += textToAdd.length;
                });
            }
            // eslint-disable-next-line no-inner-declarations
            function registerVariableDeclarationIdentifiers(node) {
                switch (node.type) {
                    case 'Identifier':
                        state.variablesToDeclare.push(node.name);
                        break;
                    case 'ObjectPattern':
                        node.properties.forEach((property) => {
                            registerVariableDeclarationIdentifiers(property.value);
                        });
                        break;
                    case 'ArrayPattern':
                        node.elements.forEach((element) => {
                            registerVariableDeclarationIdentifiers(element);
                        });
                        break;
                }
            }

            node.declarations.forEach((decl) => {
                registerVariableDeclarationIdentifiers(decl.id);
            });
        }

        walk.base.VariableDeclaration(node as any, state, c);
    }
};

// Hijack the node visitors, Remember, code is copied from node repo.
// If its good for them, its good for us.
const visitors = {};
for (const nodeType of Object.keys(walk.base)) {
    const callback = visitorsWithoutAncestors[nodeType] || walk.base[nodeType];
    visitors[nodeType] = (node, state, c) => {
        const isNew = node !== state.ancestors[state.ancestors.length - 1];
        if (isNew) {
            state.ancestors.push(node);
        }
        callback(node, state, c);
        if (isNew) {
            state.ancestors.pop();
        }
    };
}

/**
 * Changes code to support top level awaits.
 * @param {boolean} [supportBreakingOnExceptionsInDebugger]
 * `Defaults to false`
 * This flag enables exception breakpionts when debugging by simply wrapping the code in a try..catch.
 * Currently a flag so we can turn this on/off.
 */
export function processTopLevelAwait(expectedImports: string, src: string, supportBreakingOnExceptionsInDebugger?: boolean) {
    let wrapPrefix: string;
    let wrapped: string;
    if (supportBreakingOnExceptionsInDebugger) {
        // for some reason not having a try..catch won't allow debugger to break on unhandled exceptions.
        wrapPrefix = '(async () => { try { ';
        wrapped = `${expectedImports}${EOL}${wrapPrefix}${EOL}${src}${EOL}} catch (__compilerEx){throw __compilerEx;}})()`;
    } else {
        wrapPrefix = '(async () => { ';
        wrapped = `${expectedImports}${EOL}${wrapPrefix}${EOL}${src}${EOL}})()`;
    }
    let root;
    try {
        root = parser.parse(wrapped, { ecmaVersion: 'latest', locations: true });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
        // If the parse error is before the first "await", then use the execution
        // error. Otherwise we must emit this parse error, making it look like a
        // proper syntax error.
        const awaitPos = src.indexOf('await');
        const errPos = e.pos - wrapPrefix.length;
        if (awaitPos > errPos) throw e;
        // Convert keyword parse errors on await into their original errors when
        // possible.
        if (errPos === awaitPos + 6 && e.message.includes('Expecting Unicode escape sequence')) return null;
        if (errPos === awaitPos + 7 && e.message.includes('Unexpected token')) return null;
        const line = e.loc.line;
        const column = line === 1 ? e.loc.column - wrapPrefix.length : e.loc.column;
        let message =
            '\n' +
            src.split('\n')[line - 1] +
            '\n' +
            ' '.repeat(column) +
            '^\n\n' +
            e.message.replace(new RegExp(/ \([^)]+\)/), '');
        // V8 unexpected token errors include the token string.
        if (message.endsWith('Unexpected token'))
            message +=
                " '" +
                // Wrapper end may cause acorn to report error position after the source
                (src[e.pos - wrapPrefix.length] ?? src[src.length - 1]) +
                "'";
        // eslint-disable-next-line no-restricted-syntax
        throw new SyntaxError(message);
    }
    let body = root.body[root.body.length - 1].expression.callee.body;
    let tryStatementBody: undefined | any;
    if (
        supportBreakingOnExceptionsInDebugger &&
        'body' in body &&
        Array.isArray(body.body) &&
        body.body.length === 1 &&
        body.body[0].type === 'TryStatement'
    ) {
        tryStatementBody = body;
        body = body.body[0].block;
    }
    const linesUpdated = new Map<
        LineNumber,
        { adjustedColumns: Map<OldColumn, NewColumn>; firstOriginallyAdjustedColumn?: number; totalAdjustment: number }
    >();
    const state: State = {
        body,
        tryStatementBody,
        ancestors: [],
        lines: wrapped.split(/\r?\n/),
        hoistedDeclarations: [],
        variablesToDeclare: [],
        containsAwait: false,
        containsReturn: false,
        getAdjustment
    };
    function getAdjustment(line: number) {
        if (linesUpdated.has(line)) {
            return linesUpdated.get(line)!;
        }
        const declarationAdjustments = {
            adjustedColumns: new Map<OldColumn, NewColumn>(),
            firstOriginallyAdjustedColumn: undefined,
            totalAdjustment: 0
        };
        linesUpdated.set(line, declarationAdjustments);
        return declarationAdjustments;
    }
    walk.recursive(body as any, state, visitors);

    // // Do not transform if
    // // 1. False alarm: there isn't actually an await expression.
    // // 2. There is a top-level return, which is not allowed.
    // if (!state.containsAwait || state.containsReturn) {
    //     return null;
    // }

    const last = body.body[body.body.length - 1] as ExpressionStatement;
    let lastLineNumber = -1;
    if (last.type === 'ExpressionStatement') {
        lastLineNumber = last.loc.start.line;
        const lastLine = state.lines[last.loc.start.line - 1];
        const currentAdjustments = state.getAdjustment(last.loc.start.line);
        state.lines[last.loc.start.line - 1] = `${lastLine.substring(
            0,
            last.loc.start.column + currentAdjustments.totalAdjustment
        )}return (${lastLine.substring(last.loc.start.column + currentAdjustments.totalAdjustment)}`;
        currentAdjustments.totalAdjustment += 'return ('.length;
        currentAdjustments.firstOriginallyAdjustedColumn =
            currentAdjustments.firstOriginallyAdjustedColumn ?? last.loc.start.column;
        // Keep track to udpate source maps;

        // Ok, now we need to add the `)`
        const endLine = state.lines[last.loc.end.line - 1];
        const indexOfLastSimiColon = endLine.lastIndexOf(';');

        // Remember, last character would be `;`, we need to add `)` before that.
        // Also we're using typescript compiler, hence it would add the necessary `;`.
        state.lines[last.loc.end.line - 1] = `${endLine.substring(0, indexOfLastSimiColon)})${endLine.substring(
            indexOfLastSimiColon
        )}`;
    }

    // Add the variable declarations & hoisted functions/vars.
    const variables = state.variablesToDeclare.length ? `var ${state.variablesToDeclare.join(',')};` : '';
    const hoisted = state.hoistedDeclarations.length ? state.hoistedDeclarations.join(' ') : '';
    state.lines[1] = `${variables}${state.lines[1]}${hoisted}`;
    return {
        updatedCode: state.lines.join(EOL),
        linesUpdated,
        lastLineNumber
    };
}

type BaseNode<T> = {
    type: T;
    start: number;
    end: number;
    loc: BodyLocation;
    range?: [number, number];
};
type TokenLocation = { line: number; column: number };
type BodyLocation = { start: TokenLocation; end: TokenLocation };
// type LocationToFix = FunctionDeclaration | ClassDeclaration | VariableDeclaration;
type FunctionDeclaration = BaseNode<'FunctionDeclaration'> & {
    body: BlockStatement;
    id: { name: string; loc: BodyLocation };
    // loc: BodyLocation;
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
type BodyDeclaration =
    | ExpressionStatement
    | VariableDeclaration
    | ClassDeclaration
    | FunctionDeclaration
    | OtherNodes
    | BlockStatement;
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
