import { test } from "node:test";
import assert from "node:assert/strict";
import { centsToDollars, parseTags } from "./money.js";
test("rounds to cents", () => assert.equal(centsToDollars(1050), 10.5));
test("drops empty tags", () => assert.deepEqual(parseTags("a, ,b,"), ["a", "b"]));
test("no crash on empty input", () => assert.deepEqual(parseTags(""), []));