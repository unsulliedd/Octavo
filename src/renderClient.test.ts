import { expect, test, vi } from "vitest";
import { render } from "./render";
import { createRenderer } from "./renderClient";
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
