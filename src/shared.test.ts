import { expect, test } from "vitest";
import { shareInFlight } from "./shared";

test("concurrent calls for one key share a single run; later calls start a new one", async () => {
  const calls: string[] = [];
  const load = shareInFlight(async (key) => {
    calls.push(key);
    await new Promise((r) => setTimeout(r, 5));
    return `${key}#${calls.length}`;
  });

  const [a, b, c] = await Promise.all([load("x"), load("x"), load("y")]);
  expect(a).toBe(b);
  expect(c).not.toBe(a);
  expect(calls).toEqual(["x", "y"]);

  await load("x");
  expect(calls).toEqual(["x", "y", "x"]);
});

test("a failed run is shared too and doesn't stick", async () => {
  let fail = true;
  const load = shareInFlight(async () => {
    if (fail) throw new Error("boom");
    return "ok";
  });
  await expect(Promise.all([load("k"), load("k")])).rejects.toThrow("boom");
  fail = false;
  await expect(load("k")).resolves.toBe("ok");
});
