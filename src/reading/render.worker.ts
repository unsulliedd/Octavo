// Runs the render pipeline off the main thread, so the window stays responsive while a large document renders.

import { render } from "./render";
import { runRenderJob, type RenderRequest } from "./renderJob";

self.onmessage = async (e: MessageEvent<RenderRequest>) => {
  self.postMessage(await runRenderJob(e.data, render));
};
