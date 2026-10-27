export interface Store {
  read<T>(key: string): T | undefined;
  write<T>(key: string, value: T): void;
  remove(key: string): void;
}
export class MemoryStore implements Store {
  data = new Map<string, string>();
  read<T>(key: string): T | undefined {
    const value = this.data.get(key);
    return value ? (JSON.parse(value) as T) : undefined;
  }
  write<T>(key: string, value: T) {
    this.data.set(key, JSON.stringify(value));
  }
  remove(key: string) {
    this.data.delete(key);
  }
}
