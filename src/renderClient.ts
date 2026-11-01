// Sends render requests to the render worker. If the worker can't start or fails, the remaining and later
// requests render on the main thread instead.

import type { render } from "./render";
import { runRenderJob, type RenderRequest, type RenderResponse, type RenderResult } from "./renderJob";

type WorkerLike = Pick<Worker, "postMessage" | "terminate"> & {
  onmessage: ((e: MessageEvent<RenderResponse & { id: number }>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
};

/** A render that takes longer than this is stopped, so a document that can't finish doesn't hold up the others. */
export const RENDER_LIMIT = 60_000;
export const TOO_SLOW = "This document is too complex to show: rendering it took too long.";

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
  let limit: ReturnType<typeof setTimeout> | undefined;

  /** Times the render the worker is on, the oldest one waiting. */
  const watch = () => {
    clearTimeout(limit);
    if (pending.size) limit = setTimeout(stopRender, RENDER_LIMIT);
  };

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
    clearTimeout(limit);
    const waiting = [...pending.values()];
    pending.clear();
    waiting.forEach(onMainThread);
  };

  /** The render the worker is on takes too long: it fails, and the others go to a new worker. */
  const stopRender = () => {
    worker?.terminate();
    worker = undefined;
    const [stuck, ...waiting] = pending.values();
    pending.clear();
    stuck?.reject(new Error(TOO_SLOW));
    waiting.forEach(send);
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
      watch();
      if (e.data.ok) job.resolve(e.data);
      else job.reject(new Error(e.data.error));
    };
    worker.onerror = giveUpOnWorker;
    return worker;
  };

  function send(job: Pending) {
    const w = getWorker();
    if (!w) return void onMainThread(job);
    pending.set(job.req.id, job);
    w.postMessage(job.req);
    if (pending.size === 1) watch();
  }

  /** Markdown → HTML, the local image paths it shows, and whether it needs the KaTeX stylesheet. */
  return (md: string, dir: string, assetBase: string) =>
    new Promise<RenderResult>((resolve, reject) => {
      send({ req: { id: nextId++, md, dir, assetBase }, resolve, reject });
    });
}
