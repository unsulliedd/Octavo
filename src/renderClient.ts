// Sends render requests to the render worker. If the worker can't start or fails, the remaining and later
// requests render on the main thread instead.

import type { render } from "./render";
import { runRenderJob, type RenderRequest, type RenderResponse, type RenderResult } from "./renderJob";

type WorkerLike = Pick<Worker, "postMessage" | "terminate"> & {
  onmessage: ((e: MessageEvent<RenderResponse & { id: number }>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
};

type Pending = { req: RenderRequest; resolve: (r: RenderResult) => void; reject: (e: Error) => void };

export function createRenderer(
  startWorker: () => WorkerLike,
  /** Loads the pipeline for the main thread; only called when the worker isn't usable. */
  loadFallback: () => Promise<typeof render>,
  /** Called before a main-thread render, so a loading indicator can be drawn first. */
  beforeFallback: () => Promise<void> = async () => {},
) {
  let worker: WorkerLike | undefined;
  let failed = false;
  let nextId = 1;
  const pending = new Map<number, Pending>();

  const onMainThread = async ({ req, resolve, reject }: Pending) => {
    try {
      await beforeFallback();
      const res = await runRenderJob(req, await loadFallback());
      if (res.ok) resolve(res);
      else reject(new Error(res.error));
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  };

  const giveUpOnWorker = (e?: ErrorEvent) => {
    console.warn("Render worker failed; rendering on the main thread.", e?.message ?? "");
    failed = true;
    worker?.terminate();
    worker = undefined;
    const waiting = [...pending.values()];
    pending.clear();
    waiting.forEach(onMainThread);
  };

  const getWorker = () => {
    if (failed) return undefined;
    if (worker) return worker;
    try {
      worker = startWorker();
    } catch (e) {
      console.warn("Render worker couldn't start; rendering on the main thread.", e);
      failed = true;
      return undefined;
    }
    worker.onmessage = (e) => {
      const job = pending.get(e.data.id);
      if (!job) return;
      pending.delete(e.data.id);
      if (e.data.ok) job.resolve(e.data);
      else job.reject(new Error(e.data.error));
    };
    worker.onerror = giveUpOnWorker;
    return worker;
  };

  /** Markdown → HTML, the local image paths it shows, and whether it needs the KaTeX stylesheet. */
  return (md: string, dir: string, assetBase: string) =>
    new Promise<RenderResult>((resolve, reject) => {
      const job: Pending = { req: { id: nextId++, md, dir, assetBase }, resolve, reject };
      const w = getWorker();
      if (!w) return void onMainThread(job);
      pending.set(job.req.id, job);
      w.postMessage(job.req);
    });
}
