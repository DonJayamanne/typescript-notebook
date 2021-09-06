export class ArqueroFormatter {
    public static initialize(arquero: typeof import('arquero')) {
        var table = arquero.table({ colA: ['a', 'b', 'c'], colB: [3, 4, 5] });
        const proto = (table as any).__proto__ || (table as any).protptype;
        if (!proto) {
            return;
        }
        proto.print = function (opts) {
            const { display } = require('node-kernel');
            display.html(this.toHTML(opts));
        };
    }
}
