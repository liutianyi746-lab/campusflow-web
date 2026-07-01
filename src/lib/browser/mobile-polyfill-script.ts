export const MOBILE_POLYFILL_SCRIPT = `
(function () {
  function defineMethod(target, name, value) {
    if (!target || name in target) return;
    Object.defineProperty(target, name, {
      configurable: true,
      writable: true,
      value: value
    });
  }

  function arrayAt(index) {
    var length = Math.max(Number(this && this.length) || 0, 0);
    var relativeIndex = Math.trunc ? Math.trunc(Number(index) || 0) : (Number(index) || 0) < 0 ? Math.ceil(Number(index) || 0) : Math.floor(Number(index) || 0);
    var targetIndex = relativeIndex >= 0 ? relativeIndex : length + relativeIndex;
    if (targetIndex < 0 || targetIndex >= length) return undefined;
    return this[targetIndex];
  }

  defineMethod(Array.prototype, "at", arrayAt);

  var typedArrayNames = [
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
    "BigUint64Array"
  ];
  for (var index = 0; index < typedArrayNames.length; index += 1) {
    var typedArray = window[typedArrayNames[index]];
    defineMethod(typedArray && typedArray.prototype, "at", arrayAt);
  }

  defineMethod(Array.prototype, "flatMap", function (callback, thisArg) {
    if (this == null) throw new TypeError("Array.prototype.flatMap called on null or undefined");
    if (typeof callback !== "function") throw new TypeError("flatMap callback must be a function");
    var source = Object(this);
    var length = Math.max(Number(source.length) || 0, 0);
    var result = [];
    for (var itemIndex = 0; itemIndex < length; itemIndex += 1) {
      if (!(itemIndex in source)) continue;
      var mapped = callback.call(thisArg, source[itemIndex], itemIndex, source);
      if (Array.isArray(mapped)) {
        for (var innerIndex = 0; innerIndex < mapped.length; innerIndex += 1) {
          result.push(mapped[innerIndex]);
        }
      } else {
        result.push(mapped);
      }
    }
    return result;
  });

  defineMethod(String.prototype, "replaceAll", function (searchValue, replaceValue) {
    var source = String(this);
    if (searchValue instanceof RegExp) {
      if (!searchValue.global) throw new TypeError("replaceAll regex must be global");
      return source.replace(searchValue, replaceValue);
    }
    return source.split(String(searchValue)).join(replaceValue);
  });
})();
`;
