// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";
import { Transcript } from "../src/renderer/src/components/Transcript.tsx";
import type { TranscriptEntry } from "../src/renderer/src/store/session-store.ts";

class TestResizeObserver {
	static observers: TestResizeObserver[] = [];
	readonly targets = new Set<Element>();

	constructor(private readonly callback: ResizeObserverCallback) {
		TestResizeObserver.observers.push(this);
	}

	observe(target: Element) {
		this.targets.add(target);
	}

	disconnect() {
		this.targets.clear();
	}

	static measureRows() {
		for (const observer of TestResizeObserver.observers) {
			for (const target of observer.targets) {
				if (target.classList.contains("transcript-virtual-row")) observer.callback([], observer as unknown as ResizeObserver);
			}
		}
	}
}

function makeEntries(count: number, kind: TranscriptEntry["kind"] = "user"): TranscriptEntry[] {
	return Array.from({ length: count }, (_, index) => ({
		id: `entry-${index}`,
		kind,
		text: `entry-${index}`,
		streaming: false,
		expanded: false,
	}));
}

let container: HTMLDivElement;
	Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
let root: Root;

beforeEach(() => {
	TestResizeObserver.observers = [];
	Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: TestResizeObserver });
	Object.defineProperties(HTMLElement.prototype, {
		clientHeight: {
			configurable: true,
			get() {
				return this.classList.contains("transcript") ? 720 : 0;
			},
		},
		scrollHeight: {
			configurable: true,
			get() {
				if (!this.classList.contains("transcript")) return 0;
				const virtualizer = this.querySelector(".transcript-virtualizer");
				return virtualizer instanceof HTMLElement ? Number.parseFloat(virtualizer.style.height) : 0;
			},
		},
		getBoundingClientRect: {
			configurable: true,
			value(this: HTMLElement) {
				const height = Number(this.dataset.testHeight ?? "120");
				return { bottom: height, height, left: 0, right: 0, top: 0, width: 0, x: 0, y: 0 } as DOMRect;
			},
		},
	});
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

test("keeps a manual 10,000-row anchor stable while ResizeObserver measures rows above it", () => {
	const entries = makeEntries(10_000);
	act(() => {
		root.render(<Transcript entries={entries} leafId="leaf-a" hideThinking={false} hiddenThinkingLabel="hidden" onToggle={() => {}} />);
	});
	const scroller = container.querySelector<HTMLElement>(".transcript");
	assert.ok(scroller);

	act(() => {
		scroller.scrollTop = 600_000;
		scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
	});
	for (const row of container.querySelectorAll<HTMLElement>(".transcript-virtual-row")) row.dataset.testHeight = "240";
	act(() => TestResizeObserver.measureRows());

	assert.equal(scroller.scrollTop, 600_840, "seven measured overscan rows above the anchor retain its document position");
	assert.ok(container.textContent?.includes("entry-5000"), "the original top entry remains mounted after measurement");
});

test("manual scroll survives streaming, expansion resize, and a leaf measurement reset", () => {
	const entries = makeEntries(10_000, "tool");
	const streamingEntries = [...entries, { ...entries.at(-1)!, id: "streaming-entry", streaming: true }];
	act(() => {
		root.render(<Transcript entries={entries} leafId="leaf-a" hideThinking={false} hiddenThinkingLabel="hidden" onToggle={() => {}} />);
	});
	const scroller = container.querySelector<HTMLElement>(".transcript");
	assert.ok(scroller);
	act(() => {
		scroller.scrollTop = 600_000;
		scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
		root.render(
			<Transcript
				entries={streamingEntries}
				leafId="leaf-a"
				hideThinking={false}
				hiddenThinkingLabel="hidden"
				onToggle={() => {}}
			/>,
		);
	});
	assert.equal(scroller.scrollTop, 600_000, "streaming append does not pull a manual reader to the end");

	const expandedEntries = streamingEntries.map((entry) => (entry.id === "entry-4993" ? { ...entry, expanded: true } : entry));
	act(() => {
		root.render(<Transcript entries={expandedEntries} leafId="leaf-a" hideThinking={false} hiddenThinkingLabel="hidden" onToggle={() => {}} />);
	});
	assert.ok(container.textContent?.includes("collapse"), "the expanded tool row remains rendered near the reader");
	const firstRow = container.querySelector<HTMLElement>(".transcript-virtual-row");
	assert.ok(firstRow);
	firstRow.dataset.testHeight = "240";
	act(() => TestResizeObserver.measureRows());
	assert.ok(scroller.scrollTop > 600_000, "an expansion-driven resize above the viewport preserves the anchor");

	act(() => {
		root.render(<Transcript entries={makeEntries(10_000)} leafId="leaf-b" hideThinking={false} hiddenThinkingLabel="hidden" onToggle={() => {}} />);
	});
	assert.equal(scroller.scrollTop, scroller.scrollHeight, "switching active leaves clears measurements before restoring its auto-follow state");
});

test("populates the viewport after an initially empty transcript", () => {
	act(() => {
		root.render(<Transcript entries={[]} leafId="leaf-a" hideThinking={false} hiddenThinkingLabel="hidden" onToggle={() => {}} />);
	});
	act(() => {
		root.render(<Transcript entries={makeEntries(100)} leafId="leaf-a" hideThinking={false} hiddenThinkingLabel="hidden" onToggle={() => {}} />);
	});
	assert.ok(container.querySelectorAll(".transcript-virtual-row").length > 7, "the mounted scroller supplies its viewport height");
});

test("keeps shared real heights when switching leaves", () => {
	const entries = makeEntries(20);
	act(() => {
		root.render(<Transcript entries={entries} leafId="leaf-a" hideThinking={false} hiddenThinkingLabel="hidden" onToggle={() => {}} />);
	});
	for (const row of container.querySelectorAll<HTMLElement>(".transcript-virtual-row")) row.dataset.testHeight = "240";
	act(() => TestResizeObserver.measureRows());
	const before = container.querySelector<HTMLElement>(".transcript-virtualizer")?.style.height;
	act(() => {
		root.render(<Transcript entries={entries} leafId="leaf-b" hideThinking={false} hiddenThinkingLabel="hidden" onToggle={() => {}} />);
	});
	assert.equal(container.querySelector<HTMLElement>(".transcript-virtualizer")?.style.height, before);
});

test("keeps disclosures and focused controls mounted across a virtual scroll", () => {
	const entries = makeEntries(10_000, "tool");
	entries[0] = { ...entries[0]!, kind: "assistant", thinking: "reasoning" };
	act(() => {
		root.render(<Transcript entries={entries} leafId="leaf-a" hideThinking={false} hiddenThinkingLabel="hidden" onToggle={() => {}} />);
	});
	const details = container.querySelector<HTMLDetailsElement>("details.thinking");
	assert.ok(details);
	act(() => {
		details.open = true;
		details.dispatchEvent(new Event("toggle", { bubbles: true }));
	});
	const button = container.querySelector<HTMLButtonElement>("button");
	assert.ok(button);
	act(() => {
		button.focus();
		container.querySelector<HTMLElement>(".transcript")!.scrollTop = 600_000;
		container.querySelector<HTMLElement>(".transcript")!.dispatchEvent(new Event("scroll", { bubbles: true }));
	});
	assert.equal(document.activeElement, button, "the focused entry stays mounted outside the virtual window");
	act(() => {
		container.querySelector<HTMLElement>(".transcript")!.scrollTop = 0;
		container.querySelector<HTMLElement>(".transcript")!.dispatchEvent(new Event("scroll", { bubbles: true }));
	});
	assert.equal(container.querySelector<HTMLDetailsElement>("details.thinking")?.open, true, "disclosure state survives remount");
});

test("renders repeated ANSI lines without duplicate content keys", () => {
	const entries = [{ ...makeEntries(1, "tool")[0]!, remoteRenderLines: ["│  │", "│  │", ""] }];
	act(() => {
		root.render(<Transcript entries={entries} leafId="leaf-a" hideThinking={false} hiddenThinkingLabel="hidden" onToggle={() => {}} />);
	});
	assert.equal(container.querySelectorAll(".ansi-line").length, 3);
});
