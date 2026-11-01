import { afterEach, expect, test, vi } from "vitest";
import { render } from "./render";
import { createRenderer, RENDER_LIMIT, TOO_SLOW } from "./renderClient";
import { runRenderJob, type RenderRequest } from "./renderJob";

/** A stand-in worker that runs jobs with the real pipeline, answering in order or on demand. */
function fakeWorker() {
  const posted: RenderRequest[] = [];
  const w = {
    onmessage: null as ((e: MessageEvent) => void) | null,
    onerror: null as ((e: ErrorEvent) => void) | null,
    postMessage: (req: RenderRequest) => posted.push(req),
    terminate: vi.fn(),
    posted,
    async answer(i: number) {
      w.onmessage!({ data: await runRenderJob(posted[i], render) } as MessageEvent);
    },
  };
  return w;
}

afterEach(() => void vi.useRealTimers());

test("runRenderJob builds image URLs from the asset prefix and reports images and math", async () => {
  const res = await runRenderJob({ id: 7, md: "![a](../img/a%20b.png) $x$", dir: "C:\\docs\\notes", assetBase: "http://asset.localhost/" }, render);
  expect(res).toMatchObject({ id: 7, ok: true, images: ["C:\\docs\\img\\a b.png"], math: true });
  expect(res.ok && res.html).toContain('src="http://asset.localhost/C%3A%5Cdocs%5Cimg%5Ca%20b.png"');
  const plain = await runRenderJob({ id: 8, md: "# Hi", dir: "/d", assetBase: "x:" }, render);
  expect(plain).toMatchObject({ ok: true, images: [], math: false });
});

test("runRenderJob turns a failure into an error answer", async () => {
  const res = await runRenderJob({ id: 1, md: "x", dir: "/d", assetBase: "" }, async () => {
    throw new Error("boom");
  });
  expect(res).toEqual({ id: 1, ok: false, error: "Error: boom" });
});

test("a document too deep for the pipeline's stack gets a clear message", async () => {
  const res = await runRenderJob({ id: 1, md: ">".repeat(20000) + " deep", dir: "/d", assetBase: "" }, render);
  expect(res).toEqual({ id: 1, ok: false, error: "This document is nested too deeply to show." });
});

test("answers are matched to requests by id, in any order", async () => {
  const w = fakeWorker();
  const fallback = vi.fn();
  const renderDoc = createRenderer(() => w, fallback);
  const first = renderDoc("# One", "/d", "");
  const second = renderDoc("# Two", "/d", "");
  await w.answer(1);
  await w.answer(0);
  expect((await first).html).toContain("One");
  expect((await second).html).toContain("Two");
  expect(fallback).not.toHaveBeenCalled();
});

test("when the worker can't start, documents render on the main thread", async () => {
  const before = vi.fn(async () => {});
  const renderDoc = createRenderer(
    () => {
      throw new Error("no workers");
    },
    async () => render,
    before,
  );
  expect((await renderDoc("# Main", "/d", "")).html).toContain("Main");
  expect(before).toHaveBeenCalledOnce();
});

test("when the worker fails, waiting and later requests move to the main thread", async () => {
  const w = fakeWorker();
  const renderDoc = createRenderer(() => w, async () => render);
  const waiting = renderDoc("# Waiting", "/d", "");
  w.onerror!(new Event("error") as ErrorEvent);
  expect((await waiting).html).toContain("Waiting");
  expect((await renderDoc("# Later", "/d", "")).html).toContain("Later");
  expect(w.terminate).toHaveBeenCalled();
  expect(w.posted).toHaveLength(1);
});

test("a render that never ends fails with a message, and the next documents render in a new worker", async () => {
  vi.useFakeTimers();
  const workers = [fakeWorker(), fakeWorker()];
  let started = 0;
  const renderDoc = createRenderer(() => workers[started++], async () => render);
  const stuck = renderDoc("# Stuck", "/d", "");
  const waiting = renderDoc("# Waiting", "/d", "");
  const failed = expect(stuck).rejects.toThrow(TOO_SLOW);
  vi.advanceTimersByTime(RENDER_LIMIT);
  await failed;
  expect(workers[0].terminate).toHaveBeenCalledOnce();
  expect(workers[1].posted.map((r) => r.md)).toEqual(["# Waiting"]);
  vi.useRealTimers();
  await workers[1].answer(0);
  expect((await waiting).html).toContain("Waiting");
});

test("the time limit is for the render being worked on, not the ones waiting behind it", async () => {
  vi.useFakeTimers();
  const w = fakeWorker();
  const renderDoc = createRenderer(() => w, async () => render);
  const first = renderDoc("# One", "/d", "");
  const second = renderDoc("# Two", "/d", "");
  vi.advanceTimersByTime(RENDER_LIMIT - 1);
  vi.useRealTimers();
  await w.answer(0);
  await first;
  vi.useFakeTimers();
  vi.advanceTimersByTime(RENDER_LIMIT - 1);
  expect(w.terminate).not.toHaveBeenCalled();
  vi.useRealTimers();
  await w.answer(1);
  expect((await second).html).toContain("Two");
});

test("no time limit is left running once every render has answered", async () => {
  vi.useFakeTimers();
  const w = fakeWorker();
  const renderDoc = createRenderer(() => w, async () => render);
  const done = renderDoc("# One", "/d", "");
  vi.useRealTimers();
  await w.answer(0);
  await done;
  vi.useFakeTimers();
  vi.advanceTimersByTime(RENDER_LIMIT * 2);
  expect(w.terminate).not.toHaveBeenCalled();
});
