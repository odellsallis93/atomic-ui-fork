// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";
import { Autocomplete } from "../src/renderer/src/components/Autocomplete.tsx";

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

test("autocomplete exposes a labelled listbox with one active descendant target", () => {
	act(() =>
		root.render(
			<Autocomplete
				items={[{ id: "websearch", label: "/websearch", description: "Configure web search" }]}
				activeIndex={0}
				onPick={() => {}}
			/>,
		),
	);
	const listbox = container.querySelector('[role="listbox"]');
	const option = container.querySelector('[role="option"]');
	const button = container.querySelector("button");
	assert.equal(listbox?.getAttribute("aria-label"), "Completions");
	assert.equal(option?.id, "composer-autocomplete-option-0");
	assert.equal(option?.getAttribute("aria-selected"), "true");
	assert.equal(option?.getAttribute("tabindex"), "-1");
	assert.equal(button?.textContent, "/websearchConfigure web search");
	assert.equal(button?.tabIndex, -1);
});
