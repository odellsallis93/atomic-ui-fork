import assert from "node:assert/strict";
import { test } from "vitest";
import { RefreshGeneration } from "../src/renderer/src/helpers/refresh-generation";

test("only the latest refresh may apply its result", () => {
	const refreshes = new RefreshGeneration();
	const older = refreshes.begin();
	const latest = refreshes.begin();

	assert.equal(refreshes.isCurrent(older), false);
	assert.equal(refreshes.isCurrent(latest), true);
});
