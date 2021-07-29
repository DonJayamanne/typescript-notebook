import { CodeObject } from '../types';
import * as repl from 'repl';

export abstract class MagicCommandHandler {
    abstract isMagicCommand(code: CodeObject): boolean;
    abstract handleCommand(coode: CodeObject, replServer: repl.REPLServer): Promise<void>;
}
