import { addMessageHandler, removeMessageHandler, sendMessage } from '../comms';
import { v4 as uuid } from 'uuid';
import { ReadLineQuestionResponse } from '../types';

export class ReadLineProxy {
    static initialize(readLine: typeof import('readline')) {
        const originalCreateInterface = readLine.createInterface;
        readLine.createInterface = function () {
            const rlInterface = originalCreateInterface.apply(readLine, arguments as any);
            const originalQuesttion = rlInterface.question;
            rlInterface.question = function (query: string) {
                const questionArgs = Array.prototype.slice.call(arguments);
                const callback = questionArgs.find((item) => typeof item === 'function');
                if (callback) {
                    const requestId = uuid();
                    sendMessage({
                        type: 'readlineRequest',
                        question: query,
                        requestId
                    });
                    function callbackHandler(message: ReadLineQuestionResponse) {
                        if (message.requestId === requestId) {
                            removeMessageHandler('readlineResponse', callbackHandler);
                            callback(message.answer);
                        }
                    }
                    addMessageHandler('readlineResponse', callbackHandler);
                }
                return originalQuesttion.apply(rlInterface, arguments as any);
            };

            return rlInterface;
        };
    }
}
