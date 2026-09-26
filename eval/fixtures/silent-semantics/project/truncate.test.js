import { test } from "node:test";
import assert from "node:assert/strict";
import { truncate } from "./truncate.js";
test("truncates a long string", () => assert.equal(truncate("hello world", 8), "hello..."));