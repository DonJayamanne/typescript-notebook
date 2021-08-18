import * as vm from 'vm';
import * as path from 'path';

const tsNodePath = path.join(__dirname, '..', '..', '..', 'resources', 'scripts', 'node_modules', 'ts-node');
export function register(context: vm.Context) {
    vm.runInNewContext(`require('${tsNodePath.replace(/\\/g, '/')}').register()`, context, {
        displayErrors: true
    });
}
