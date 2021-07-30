// https://gist.github.com/jonathanlurie/04fa6343e64f750d03072ac92584b5df
/*
    Author: Jonathan Lurie - http://me.jonathanlurie.fr
    License: MIT

    The point of this little gist is to fix the issue of losing
    typed arrays when calling the default JSON serilization.
    The default mode has for effect to convert typed arrays into
    object like that: {0: 0.1, 1: 0.2, 2: 0.3} what used to be
    Float32Array([0.1, 0.2, 0.3]) and once it takes the shape of an
    object, there is no way to get it back in an automated way!

    The fix leverages the usually-forgotten functions that can be
    called as arguments of JSON.stringify and JSON.parse: the
    replacer and the reviver.
*/

// get the glogal context for compatibility with node and browser
const context = typeof window === 'undefined' ? global : window;

// flag that will be sliped in the json string
const FLAG_TYPED_ARRAY = 'FLAG_TYPED_ARRAY';

// eslint-disable-next-line @typescript-eslint/ban-types
export function serialize(obj: {}): string {
    return JSON.stringify(obj, function (key, value) {
        // the replacer function is looking for some typed arrays.
        // If found, it replaces it by a trio
        if (
            value instanceof Int8Array ||
            value instanceof Uint8Array ||
            value instanceof Uint8ClampedArray ||
            value instanceof Int16Array ||
            value instanceof Uint16Array ||
            value instanceof Int32Array ||
            value instanceof Uint32Array ||
            value instanceof Float32Array ||
            value instanceof Float64Array
        ) {
            const replacement = {
                constructor: value.constructor.name,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                data: Array.apply([], value as any),
                flag: FLAG_TYPED_ARRAY
            };
            return replacement;
        }
        return value;
    });
}
export function deserialize(jsonStr: string) {
    return JSON.parse(jsonStr, function (key, value) {
        // the reviver function looks for the typed array flag
        try {
            if ('flag' in value && value.flag === FLAG_TYPED_ARRAY) {
                // if found, we convert it back to a typed array
                return new context[value.constructor](value.data);
            }
        } catch (e) {
            //
        }

        // if flag not found no conversion is done
        return value;
    });
}
