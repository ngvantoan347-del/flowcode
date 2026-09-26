import { test } from "node:test";
import assert from "node:assert/strict";
import { loadAll } from "./load.js";
test("starts every fetch before awaiting any", async () => {
  const started = [];
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const fetcher = async (id) => {
    started.push(id);
    await gate;
    return id;
  };
  const pending = loadAll(fetcher, ["a", "b", "c"]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ["a", "b", "c"], "all fetches must be in flight together");
  release();
  assert.deepEqual(await pending, { a: "a", b: "b", c: "c" });
});