// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";
import { Footer } from "../src/renderer/src/components/Footer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

test("hides the footer working indicator when an extension disables built-in working UI", () => {
	act(() => {
		root.render(
			createElement(Footer, {
				cwd: "/workspace",
				engineLabel: "engine v3",
				usageLabel: "0 tokens",
				statusSegments: {},
				working: true,
				workingVisible: false,
				workingLabel: "Indexing",
			}),
		);
	});
	assert.equal(container.querySelector(".working"), null);
});
