import type { Store } from "./port";
// Browser preview only; native builds use SQLite, not localStorage.
export const store: Store = {
  read<T>(key: string) {
    const value = localStorage.getItem(`neu-student:${key}`);
    return value ? (JSON.parse(value) as T) : undefined;
  },
  write(key, value) {
    localStorage.setItem(`neu-student:${key}`, JSON.stringify(value));
  },
  remove(key) {
    localStorage.removeItem(`neu-student:${key}`);
  },
};
