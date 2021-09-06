export class ArqueroFormatter {
    private static arqueroTable?: any;
    public static isArqueroTable(table: any) {
        try {
            const proto = table.__proto__ || table.prototype;
            return proto && ArqueroFormatter.arqueroTable === proto;
        } catch {
            //
        }
        return false;
    }
    public static initialize(arquero: typeof import('arquero')) {
        var table = arquero.table({ colA: ['a', 'b', 'c'], colB: [3, 4, 5] });
        const proto = (table as any).__proto__ || (table as any).protptype;
        if (!proto) {
            return;
        }
        ArqueroFormatter.arqueroTable = proto;
        proto.print = function (opts) {
            const { display } = require('node-kernel');
            display.html(this.toHTML(opts));
        };
    }
}
