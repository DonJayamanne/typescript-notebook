import * as assert from 'assert';
import { commands, Uri, workspace } from 'vscode';
import { IDisposable } from '../../extension/types';
import * as tmp from 'tmp';
import * as fs from 'fs';
import { getCodeObject } from '../../extension/kernel/compiler';
import { parse, prettyPrint } from 'recast';
suite('Top level await compiler tests', () => {
    const testCases: [string, string][] = [
        ['0', '(async () => {    return 0;})();'],
        ['await 0', '(async () => {return (await 0);})()'],
        ['await 0;', '(async () => {return (await 0);})()'],
        ['(await 0)', '(async () => {return ((await 0));})()'],
        ['(await 0);', '(async () => {return ((await 0));})()'],
        [
            'async function foo() { await 0; }',
            'var foo;(async () => {this.foo = foo;async function foo() { await 0; }})()'
        ],
        ['async () => await 0', '(async () => {return (async () => await 0);})()'],
        [
            'class A { async method() { await 0 } }',
            'var A;(async () => {this.A = A;class A {    async method() { await 0; }}})()'
        ],
        ['await 0; return 0;', '(async () => {await 0;return 0;})()'],
        ['var a = await 1', 'var a;(async () => { a = await 1;})()'],
        ['let a = await 1', 'var a;(async () => { a = await 1;})()'],
        ['const a = await 1', 'var a;(async () => { a = await 1;})()'],
        [
            'for (var i = 0; i < 1; ++i) { console.log(await Promise.resolve(1)); }',
            'var i; (async () => { for (i = 0; i < 1; ++i) { console.log(await Promise.resolve(1)); } })()'
        ],
        ['for (let i = 0; i < 1; ++i) { await i }', '(async () => { for (let i = 0; i < 1; ++i) { await i } })()'],
        [
            'var {a} = {a:1}, [b] = [1], {c:{d}} = {c:{d: await 1}}',
            'var a, b, d; (async () => { ({a} = {a:1}), ([b] = [1]), ' + '({c:{d}} = {c:{d: await 1}}) })()'
        ],
        ['let [a, b, c] = await ([1, 2, 3])', 'var a, b, c; (async () => { [a, b, c] = await ([1, 2, 3]) })()'],
        [
            'let {a,b,c} = await ({a: 1, b: 2, c: 3})',
            'var a, b, c; (async () => {  ({a,b,c} = ' + 'await ({a: 1, b: 2, c: 3})) })()'
        ],
        [
            'let {a: [b]} = {a: [await 1]}, [{d}] = [{d: 3}]',
            'var b, d; (async () => {  ( ({a: [b]} = {a: [await 1]}),' + ' ([{d}] = [{d: 3}])) })()'
        ],
        /* eslint-disable no-template-curly-in-string */
        // // This test doesn't work, for some reason the parser fails here.
        // [
        //     'console.log(`' + '${(await { a: 1 }).a' + '}`)',
        //     '(async () => { return (console.log(`' + '${(await { ' + 'a: 1 }).a}`)) })()'
        // ],
        /* eslint-enable no-template-curly-in-string */
        ['await 0; function foo() {}', 'var foo; (async () => {this.foo = foo; await 0; function foo() {} })()'],
        ['await 0; class Foo {}', 'var Foo;(async () => {this.Foo = Foo;await 0; class Foo {} })()'],
        [
            'if (await true) { function foo() {} }',
            'var foo;(async () => {this.foo = foo; if (await true) { function foo() {} } })()'
        ],
        ['if (await true) { class Foo{} }', '(async () => { if (await true) { class Foo{} } })()'],
        ['if (await true) { var a = 1; }', 'var a; (async () => { if (await true) {  (a = 1); } })()'],
        ['if (await true) { let a = 1; }', '(async () => { if (await true) { let a = 1; } })()'],
        [
            'var a = await 1; let b = 2; const c = 3;',
            'var a, b, c;(async () => { ( a = await 1); ( b = 2); ( c = 3);})()'
        ],
        ['let o = await 1, p', 'var o, p;(async () => { ( o = await 1, p=undefined);})()'],
        ['await 1234;', '(async () => { return await 1234;})()'],
        ['await Promise.resolve(1234);', '(async () => { return await Promise.resolve(1234);})()'],
        [
            'await (async () => Promise.resolve(1234))()',
            '(async () => {    return await (async () => Promise.resolve(1234))();})();'
        ],
        [
            'await (async () => { let p = await 1; return p; })()',
            '(async () => {    return await (async () => {        let p = await 1;        return p;    })();})();'
        ],
        ['{ let p = await 1; }', '(async () => {{  let p = await 1;}})()'],
        ['var p = await 1', 'var p;(async () => {    p = await 1;})();'],
        [
            'await (async () => { var p = await 1; return p; })()',
            '(async () => { return (await (async () => ' + '{ var p = await 1; return p; })()) })()'
        ],
        ['{ var p = await 1; }', 'var p;(async () => {    {        p = await 1;    }})();'],
        [
            'for await (var i of asyncIterable) { console.log(i); }',
            'var i;(async () => { for await ( i of asyncIterable) {    console.log(i);}})()'
        ],
        [
            'for await (var [i] of asyncIterable) { i; }',
            'var i;(async () => { for await ( [i] of asyncIterable) {    i;}})()'
        ],
        [
            'for await (var {i} of asyncIterable) { i; }',
            'var i;(async () => { for await ( { i } of asyncIterable) {    i;}})()'
        ],
        [
            'for await (var [{i}, [j]] of asyncIterable) { i; }',
            'var i,j;(async () => { for await ( [{ i }, [j]] of asyncIterable) {    i;}})()'
        ],
        ['for await (let i of asyncIterable) { i; }', '(async () => { for await (let i of asyncIterable) {    i;}})()'],
        [
            'for await (const i of asyncIterable) { i; }',
            '(async () => { for await (const i of asyncIterable) {    i;}})()'
        ],
        ['for (var i of [1,2,3]) { await 1; }', 'var i; (async () => { for (i of [1,2,3]) { await 1; } })()'],
        ['for (var [i] of [[1], [2]]) { await 1; }', 'var i; (async () => { for ([i] of [[1], [2]]) { await 1; } })()'],
        [
            'for (var {i} of [{i: 1}, {i: 2}]) { await 1; }',
            'var i; (async () => { for ({i} of [{i: 1}, {i: 2}]) { await 1; } })()'
        ],
        [
            'for (var [{i}, [j]] of [[{i: 1}, [2]]]) { await 1; }',
            'var i, j; (async () => { for ([{i}, [j]] of [[{i: 1}, [2]]])' + ' { await 1; } })()'
        ],
        ['for (let i of [1,2,3]) { await 1; }', '(async () => { for (let i of [1,2,3]) { await 1; } })()'],
        ['for (const i of [1,2,3]) { await 1; }', '(async () => { for (const i of [1,2,3]) { await 1; } })()'],
        ['for (var i in {x:1}) { await 1 }', 'var i; (async () => { for (i in {x:1}) { await 1 } })()'],
        ['for (var [a,b] in {xy:1}) { await 1 }', 'var a, b; (async () => { for ([a,b] in {xy:1}) { await 1 } })()'],
        ['for (let i in {x:1}) { await 1 }', '(async () => { for (let i in {x:1}) { await 1 } })()'],
        ['for (const i in {x:1}) { await 1 }', '(async () => { for (const i in {x:1}) { await 1 } })()']
    ];
    const disposables: IDisposable[] = [];
    suiteTeardown(async () => {
        disposables.forEach((item) => {
            try {
                item.dispose();
            } catch (ex) {
                //
            }
        });
        await commands.executeCommand('workbench.action.closeAllEditors');
    });
    test('Sample test', () => {
        assert.equal(-1, [1, 2, 3].indexOf(5));
        assert.equal(-1, [1, 2, 3].indexOf(0));
        // const x = getCodeObject(undefined as any);
    });
    [true, false].forEach((supportsExceptionBreakpoints) => {
        suite(`${supportsExceptionBreakpoints ? 'With' : 'Without'} exception breakpoints`, () => {
            testCases.forEach(([code, expected]) => {
                test(`test - ${code}`, async () => {
                    const nb = await createNotebook(code);
                    const codeObject = getCodeObject(nb.cellAt(0), code, supportsExceptionBreakpoints);

                    // When supporting breakpoints in debugger, all we do is wrap the code in a try..catch..
                    if (supportsExceptionBreakpoints) {
                        expected = expected.replace('(async () => {', '(async () => { try {');
                        expected =
                            expected.substring(0, expected.lastIndexOf('})()')) +
                            '} catch (__compilerEx){throw __compilerEx;}})()';
                    }
                    // recast parser fails when parsing async iterables,
                    // hence don't use re-cast for testing where possible, i.e. compare the code as is.
                    if (expected === codeObject.code) {
                        return assert.strictEqual(expected, codeObject.code);
                    }
                    const lines = codeObject.code.split(/\r?\n/);
                    if (expected === lines.join('')) {
                        return assert.strictEqual(expected, lines.join(''));
                    }
                    if (expected === lines.map((item) => item.trim()).join('')) {
                        return assert.strictEqual(expected, lines.map((item) => item.trim()).join(''));
                    }
                    let prettyExpectedCode = '';
                    let prettyGeneratedCode = '';
                    try {
                        prettyExpectedCode = getPrettyfiedCode(expected);
                        prettyGeneratedCode = getPrettyfiedCode(codeObject.code);
                    } catch (ex) {
                        return assert.strictEqual(expected, lines.join(''), 'Failed to parse code');
                    }
                    assert.strictEqual(prettyExpectedCode, prettyGeneratedCode);
                });
            });
        });
    });
    function getPrettyfiedCode(source: string) {
        const parsedCode = parse(source, { ecmaVersion: 'latest' } as any);
        return prettyPrint(parsedCode).code.split(/\r?\n/).join('').trim();
    }
    async function createNotebook(source: string) {
        const result = tmp.fileSync({ postfix: '.jsnb' });
        disposables.push({
            dispose: () => result.removeCallback()
        });
        fs.writeFileSync(result.name, JSON.stringify({ cells: [{ source, language: 'javascript' }] }));
        return workspace.openNotebookDocument(Uri.file(result.name));
    }
});
