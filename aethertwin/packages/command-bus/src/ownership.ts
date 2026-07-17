function freezeGraph(value: unknown, seen: WeakSet<object>): void {
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return;
  }

  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("CommandBus data must use plain objects and arrays");
  }

  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    freezeGraph(Reflect.get(value, key), seen);
  }
  Object.freeze(value);
}

export function deepFreeze<T>(value: T): T {
  freezeGraph(value, new WeakSet<object>());
  return value;
}

export function ownedCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}
