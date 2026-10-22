/**
 * Resolves after the browser has had a chance to paint, so UI set just before (a loading indicator) is on
 * screen before long work blocks the main thread. Falls back to a timer where frames don't run, for example
 * while the window is still hidden.
 */
export function afterPaint(fallbackMs = 100) {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    requestAnimationFrame(() => setTimeout(finish, 0));
    setTimeout(finish, fallbackMs);
  });
}
