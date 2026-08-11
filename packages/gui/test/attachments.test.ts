import assert from "node:assert/strict";
import { test } from "vitest";
import {
	BASH_IMAGE_WARNING,
	canSubmit,
	createSubmitGate,
	dataUrlToPromptImage,
	filterImageFiles,
	isFileDrag,
	planSubmit,
	readImageFiles,
} from "../src/renderer/src/helpers/attachments.ts";
import type { PromptImage } from "../src/shared/ipc.ts";

const pixel: PromptImage = { type: "image", data: "cGl4ZWw=", mimeType: "image/png" };

test("canSubmit enables Send for text, for images only, and never while disabled", () => {
	assert.equal(canSubmit("", 0, false), false);
	assert.equal(canSubmit("   ", 0, false), false);
	assert.equal(canSubmit("", 1, false), true);
	assert.equal(canSubmit("   ", 2, false), true);
	assert.equal(canSubmit("hi", 0, false), true);
	assert.equal(canSubmit("hi", 1, true), false);
	assert.equal(canSubmit("", 1, true), false);
});

test("isFileDrag only accepts drags carrying files", () => {
	assert.equal(isFileDrag(["Files"]), true);
	assert.equal(isFileDrag(["text/plain", "Files"]), true);
	assert.equal(isFileDrag(["text/plain"]), false);
	assert.equal(isFileDrag([]), false);
});

test("filterImageFiles keeps image/* entries in order and drops the rest", () => {
	const files = [
		{ type: "image/png", name: "a.png" },
		{ type: "text/plain", name: "b.txt" },
		{ type: "image/jpeg", name: "c.jpg" },
		{ type: "", name: "d" },
	];
	assert.deepEqual(
		filterImageFiles(files).map((file) => file.name),
		["a.png", "c.jpg"],
	);
});

test('dataUrlToPromptImage produces engine ImageContent with type:"image"', () => {
	assert.deepEqual(dataUrlToPromptImage("data:image/png;base64,cGl4ZWw=", "image/png"), {
		type: "image",
		data: "cGl4ZWw=",
		mimeType: "image/png",
	});
	assert.equal(dataUrlToPromptImage("not-a-data-url", "image/png"), undefined);
	assert.equal(dataUrlToPromptImage("data:image/png;base64,", "image/png"), undefined);
});

test("readImageFiles resolves every file and preserves order", async () => {
	const files = [
		{ type: "image/png", name: "a.png" },
		{ type: "image/jpeg", name: "b.jpg" },
	];
	const images = await readImageFiles(files, {
		readDataUrl: async (file) => `data:${file.type};base64,${file.name === "a.png" ? "YQ==" : "Yg=="}`,
	});
	assert.deepEqual(images, [
		{ type: "image", data: "YQ==", mimeType: "image/png" },
		{ type: "image", data: "Yg==", mimeType: "image/jpeg" },
	]);
});

test("readImageFiles reports reader failures instead of dropping them silently", async () => {
	const errors: string[] = [];
	const files = [
		{ type: "image/png", name: "good.png" },
		{ type: "image/png", name: "bad.png" },
		{ type: "image/png", name: "garbage.png" },
	];
	const images = await readImageFiles(files, {
		onError: (message) => errors.push(message),
		readDataUrl: async (file) => {
			if (file.name === "bad.png") throw new Error("reader exploded");
			if (file.name === "garbage.png") return "no-comma-here";
			return "data:image/png;base64,YQ==";
		},
	});
	assert.deepEqual(images, [{ type: "image", data: "YQ==", mimeType: "image/png" }]);
	assert.deepEqual(errors, ["Failed to read image bad.png", "Failed to read image garbage.png"]);
});

test("readImageFiles settles only after every in-flight read completes", async () => {
	let resolveSlow: ((value: string) => void) | undefined;
	let settled = false;
	const pending = readImageFiles([{ type: "image/png", name: "slow.png" }], {
		readDataUrl: async () =>
			await new Promise<string>((resolve) => {
				resolveSlow = resolve;
			}),
	}).then((images) => {
		settled = true;
		return images;
	});
	await Promise.resolve();
	assert.equal(settled, false);
	assert.ok(resolveSlow);
	resolveSlow("data:image/png;base64,cGl4ZWw=");
	assert.deepEqual(await pending, [pixel]);
	assert.equal(settled, true);
});

test("planSubmit does nothing without text or images", () => {
	assert.deepEqual(planSubmit("", []), { kind: "none" });
	assert.deepEqual(planSubmit("   \n ", []), { kind: "none" });
});

test("planSubmit allows an image-only prompt", () => {
	assert.deepEqual(planSubmit("", [pixel]), { kind: "prompt", message: "", images: [pixel] });
});

test("planSubmit keeps images and warns on ! and !! bash submits", () => {
	assert.deepEqual(planSubmit("!ls -la", [pixel]), {
		kind: "bash",
		message: "!ls -la",
		command: "ls -la",
		excludeFromContext: false,
		keepImages: [pixel],
		warning: BASH_IMAGE_WARNING,
	});
	assert.deepEqual(planSubmit("!! git status", [pixel]), {
		kind: "bash",
		message: "!! git status",
		command: "git status",
		excludeFromContext: true,
		keepImages: [pixel],
		warning: BASH_IMAGE_WARNING,
	});
});

test("planSubmit omits the bash warning when nothing is attached", () => {
	assert.deepEqual(planSubmit("!ls", []), {
		kind: "bash",
		message: "!ls",
		command: "ls",
		excludeFromContext: false,
		keepImages: [],
	});
});

test("planSubmit passes attachments through on a normal prompt", () => {
	const images = [pixel];
	const plan = planSubmit("  hello  ", images);
	assert.deepEqual(plan, { kind: "prompt", message: "hello", images: [pixel] });
	assert.equal(plan.kind === "prompt" && plan.images, images);
});

test("createSubmitGate collapses submits that re-enter during an in-flight read", async () => {
	const gate = createSubmitGate();
	const sent: string[] = [];
	let releaseRead: (() => void) | undefined;
	const pendingRead = new Promise<void>((resolve) => {
		releaseRead = resolve;
	});
	const guardedSubmit = async (message: string): Promise<void> => {
		if (!gate.begin()) return;
		try {
			await pendingRead;
			sent.push(message);
		} finally {
			gate.end();
		}
	};

	const runs = [guardedSubmit("first"), guardedSubmit("second"), guardedSubmit("third")];
	assert.ok(releaseRead);
	releaseRead();
	await Promise.all(runs);
	assert.deepEqual(sent, ["first"]);

	await guardedSubmit("later");
	assert.deepEqual(sent, ["first", "later"]);
});

test("createSubmitGate holds the claim until it is released", () => {
	const gate = createSubmitGate();
	assert.equal(gate.begin(), true);
	assert.equal(gate.begin(), false);
	assert.equal(gate.begin(), false);
	gate.end();
	assert.equal(gate.begin(), true);
});

test("createSubmitGate is released on an early return and on a throw", async () => {
	const gate = createSubmitGate();

	const earlyReturn = async (): Promise<void> => {
		if (!gate.begin()) return;
		try {
			return;
		} finally {
			gate.end();
		}
	};
	await earlyReturn();
	assert.equal(gate.begin(), true, "gate must be free after an early return");
	gate.end();

	const throwing = async (): Promise<void> => {
		if (!gate.begin()) return;
		try {
			throw new Error("ipc failed");
		} finally {
			gate.end();
		}
	};
	await assert.rejects(throwing(), /ipc failed/);
	assert.equal(gate.begin(), true, "gate must be free after a throw");
});

test("createSubmitGate tolerates end() without a matching begin()", () => {
	const gate = createSubmitGate();
	gate.end();
	assert.equal(gate.begin(), true);
});
