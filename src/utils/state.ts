export type CompatibleState = {
  values?: Record<string, any>;
  data?: Record<string, any>;
  get?: (key: string) => any | Promise<any>;
  set?: (key: string, value: any) => any | Promise<any>;
  [key: string]: any;
};

export async function getStateValue<T = any>(
  state: CompatibleState | undefined | null,
  key: string,
  fallback?: T,
): Promise<T | undefined> {
  if (!state) {
    return fallback;
  }

  if (typeof state.get === "function") {
    try {
      const value = await state.get(key);
      if (value !== undefined) {
        return value as T;
      }
    } catch {
      // Fall back to the plain state object shape used in newer Eliza versions.
    }
  }

  const values = state.values ?? {};
  if (Object.prototype.hasOwnProperty.call(values, key)) {
    return values[key] as T;
  }

  const data = state.data ?? {};
  if (Object.prototype.hasOwnProperty.call(data, key)) {
    return data[key] as T;
  }

  if (Object.prototype.hasOwnProperty.call(state, key)) {
    return (state as Record<string, any>)[key] as T;
  }

  return fallback;
}

export async function setStateValue<T = any>(
  state: CompatibleState | undefined | null,
  key: string,
  value: T,
): Promise<T> {
  if (!state) {
    return value;
  }

  if (typeof state.set === "function") {
    try {
      await state.set(key, value);
    } catch {
      // Some Eliza versions expose a plain object instead of a set() method.
    }
  }

  state.values = state.values ?? {};
  state.data = state.data ?? {};
  state.values[key] = value;
  state.data[key] = value;
  (state as Record<string, any>)[key] = value;

  return value;
}
