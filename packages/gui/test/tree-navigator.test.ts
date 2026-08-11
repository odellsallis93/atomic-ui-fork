import assert from "node:assert/strict";
import { test } from "vitest";
import { treeRows } from "../src/renderer/src/components/TreeNavigator.tsx";

const nodes = [
	{
		id: "parent",
		kind: "message",
		summary: "parent",
		children: [{ id: "child", kind: "message", summary: "needle", children: [] }],
	},
	{
		id: "meta",
		kind: "model_change",
		summary: "model",
		children: [{ id: "leaf", kind: "message", summary: "active", children: [] }],
	},
];

test("tree search reveals folded matches and retains the active leaf", () => {
	assert.deepEqual(
		treeRows(nodes, "leaf", new Set(["parent"]), "needle").map((row) => row.id),
		["parent", "child", "leaf"],
	);
});

test("tree hides bookkeeping nodes but retains an active bookkeeping leaf", () => {
	assert.deepEqual(
		treeRows(nodes, "leaf", new Set(), "").map((row) => row.id),
		["parent", "child", "leaf"],
	);
	assert.ok(treeRows(nodes, "meta", new Set(), "").some((row) => row.id === "meta"));
});
