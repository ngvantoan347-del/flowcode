import { test } from "node:test";
import assert from "node:assert/strict";
import { sumTo } from "./sum.js";
test("sumTo(5)", () => assert.equal(sumTo(5), 15));
test("sumTo(1)", () => assert.equal(sumTo(1), 1));