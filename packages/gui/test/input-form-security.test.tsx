// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";
import { InputFormModal } from "../src/renderer/src/components/InputFormModal";
import type { InputFormRequest } from "../src/shared/ipc";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement;

beforeEach(() => {
	container = document.createElement("div");
	document.body.append(container);
});

afterEach(() => {
	act(() => root?.unmount());
	root = undefined;
	container.remove();
});

test("masks credential fields beyond the api-key and password names", async () => {
	const request: InputFormRequest = {
		componentId: "credentials-1",
		title: "Credentials",
		fields: [
			{ name: "credential", type: "string", initialValue: "" },
			{ name: "access_token", type: "string", initialValue: "" },
			{ name: "private_key", type: "string", initialValue: "" },
			{ name: "verification_code", type: "string", initialValue: "" },
			{ name: "username", type: "string", initialValue: "" },
		],
	};
	root = createRoot(container);
	await act(async () => {
		root?.render(createElement(InputFormModal, { request, onSubmit: () => undefined, onCancel: () => undefined }));
	});

	assert.deepEqual(
		Array.from(container.querySelectorAll("input"), (input) => input.type),
		["password", "password", "password", "password", "text"],
	);
});
