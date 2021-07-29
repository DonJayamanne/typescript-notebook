export type IDisposable = {
    dispose: () => void;
};

/**
 * Minko Gechev
 * In TypeScript, you can use Readonly<T> to prevent the reassignment of properties of an object. Using conditional types, you can implement your own DeepReadonly<T> with the snippet below!
 */
type DeepReadonlyArray<T> = ReadonlyArray<DeepReadonly<T>>;

type DeepReadonlyObject<T> = {
    readonly [P in keyof T]: DeepReadonly<T[P]>;
};

export type DeepReadonly<T> = T extends (infer R)[]
    ? DeepReadonlyArray<R>
    : // eslint-disable-next-line @typescript-eslint/ban-types
    T extends Function
    ? T
    : // eslint-disable-next-line @typescript-eslint/ban-types
    T extends object
    ? DeepReadonlyObject<T>
    : T;

export type ReadWrite<T> = {
    -readonly [P in keyof T]: T[P];
};
