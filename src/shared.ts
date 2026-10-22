/**
 * Wraps an async loader so concurrent calls for the same key share one run. Once that run settles, the
 * next call starts a fresh one, so a reload still reads the file again.
 */
export function shareInFlight<T>(load: (key: string) => Promise<T>) {
  const running = new Map<string, Promise<T>>();
  return (key: string): Promise<T> => {
    const existing = running.get(key);
    if (existing) return existing;
    const run = load(key).finally(() => running.delete(key));
    running.set(key, run);
    return run;
  };
}
