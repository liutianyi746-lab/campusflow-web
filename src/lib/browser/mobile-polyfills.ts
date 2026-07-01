type ArrayAtTarget = {
  at?: (index: number) => unknown;
  length: number;
  [index: number]: unknown;
};

function arrayAt(this: ArrayAtTarget, index: number): unknown {
  const length = Math.max(Number(this.length) || 0, 0);
  const relativeIndex = Math.trunc(Number(index) || 0);
  const targetIndex = relativeIndex >= 0 ? relativeIndex : length + relativeIndex;
  if (targetIndex < 0 || targetIndex >= length) return undefined;
  return this[targetIndex];
}

function defineMethod(target: object | undefined, name: string, value: unknown): void {
  if (!target || name in target) return;
  Object.defineProperty(target, name, {
    configurable: true,
    writable: true,
    value,
  });
}

defineMethod(Array.prototype, "at", arrayAt);

for (const name of [
  "Int8Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "Int16Array",
  "Uint16Array",
  "Int32Array",
  "Uint32Array",
  "Float32Array",
  "Float64Array",
  "BigInt64Array",
  "BigUint64Array",
]) {
  const typedArray = (globalThis as unknown as Record<string, { prototype?: object } | undefined>)[name];
  defineMethod(typedArray?.prototype, "at", arrayAt);
}

defineMethod(Array.prototype, "flatMap", function flatMap<T, U>(
  this: ArrayLike<T>,
  callback: (value: T, index: number, array: ArrayLike<T>) => U | U[],
  thisArg?: unknown,
): U[] {
  if (this == null) throw new TypeError("Array.prototype.flatMap called on null or undefined");
  if (typeof callback !== "function") throw new TypeError("flatMap callback must be a function");

  const source = Object(this) as ArrayLike<T>;
  const result: U[] = [];
  const length = Math.max(Number(source.length) || 0, 0);

  for (let index = 0; index < length; index += 1) {
    if (!(index in source)) continue;
    const mapped = callback.call(thisArg, source[index], index, source);
    if (Array.isArray(mapped)) {
      for (let innerIndex = 0; innerIndex < mapped.length; innerIndex += 1) {
        result.push(mapped[innerIndex]);
      }
    } else {
      result.push(mapped);
    }
  }

  return result;
});

defineMethod(String.prototype, "replaceAll", function replaceAll(
  this: string,
  searchValue: string | RegExp,
  replaceValue: string,
): string {
  const source = String(this);
  if (searchValue instanceof RegExp) {
    if (!searchValue.global) throw new TypeError("replaceAll regex must be global");
    return source.replace(searchValue, replaceValue);
  }
  return source.split(String(searchValue)).join(replaceValue);
});
