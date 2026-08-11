// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, test } from "vitest";
import { ToolRenderHost } from "../src/renderer/src/components/ToolRenderHost.tsx";
import { Transcript } from "../src/renderer/src/components/Transcript.tsx";
import type { TranscriptEntry } from "../src/renderer/src/store/session-store.ts";
import { useSessionStore } from "../src/renderer/src/store/session-store.ts";

export const LONG_TRANSCRIPT_ROWS = 10_000;
export const LONG_TRANSCRIPT_RENDER_BUDGET_MS = 1_500;
export const FAST_STREAM_DELTAS = 120;
export const FAST_STREAM_BUDGET_MS = 2_500;
export const BUDGET_SAMPLES = 3;

/** jsdom has no layout engine; this keeps the lower-bound probe deterministic. */
class LowerBoundResizeObserver {
	static observers = new Set<LowerBoundResizeObserver>();
	private readonly targets = new Set<Element>();

	constructor(private readonly callback: ResizeObserverCallback) {
		LowerBoundResizeObserver.observers.add(this);
	}

	observe(target: Element): void {
		this.targets.add(target);
	}

	disconnect(): void {
		this.targets.clear();
		LowerBoundResizeObserver.observers.delete(this);
	}

	static flush(): void {
		for (const observer of LowerBoundResizeObserver.observers) {
			if (observer.targets.size) observer.callback([], observer as unknown as ResizeObserver);
		}
	}
}

function makeEntries(count: number): TranscriptEntry[] {
	return Array.from({ length: count }, (_, index) => ({
		id: `entry-${index}`,
		kind: "user",
		text: `entry-${index}`,
		streaming: false,
		expanded: false,
	}));
}

function StoreTranscriptHarness({ onRender }: { onRender: () => void }) {
	const entries = useSessionStore((state) => state.entries);
	return (
		<>
			<Transcript
				entries={entries}
				leafId="performance-leaf"
				hideThinking={false}
				hiddenThinkingLabel="Thinking hidden"
				onToggle={() => {}}
			/>
			<ToolRenderHost entries={entries} onRender={onRender} onDispose={() => {}} />
		</>
	);
}

function median(samples: readonly number[]): number {
	return [...samples].sort((left, right) => left - right)[Math.floor(samples.length / 2)] ?? 0;
}

function assertBudget(label: string, samples: readonly number[], budget: number): void {
	const measuredMedian = median(samples);
	assert.ok(
		measuredMedian <= budget,
		`${label} median ${measuredMedian.toFixed(1)}ms (budget ${budget}ms; samples ${samples.map((sample) => sample.toFixed(1)).join(", ")}ms)`,
	);
	assert.ok(
		Math.max(...samples) <= budget * 2,
		`${label} outlier exceeded 2x budget (samples ${samples.map((sample) => sample.toFixed(1)).join(", ")}ms)`,
	);
}

let container: HTMLDivElement;
let root: Root;
let layoutReads = 0;
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });

beforeEach(() => {
	layoutReads = 0;
	LowerBoundResizeObserver.observers.clear();
	Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: LowerBoundResizeObserver });
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
				if (this.classList.contains("transcript"))
					return { bottom: 720, height: 720, left: 0, right: 960, top: 0, width: 960, x: 0, y: 0 } as DOMRect;
				if (this.classList.contains("transcript-virtual-row")) {
					layoutReads += 1;
					const override = Number(this.dataset.testHeight);
					const index = Number(this.dataset.entryId?.split("-").at(-1) ?? 0);
					const height = Number.isFinite(override)
						? override
						: 72 + (Number.isFinite(index) ? index % 5 : 0) * 18;
					return { bottom: height, height, left: 0, right: 960, top: 0, width: 960, x: 0, y: 0 } as DOMRect;
				}
				return { bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0, x: 0, y: 0 } as DOMRect;
			},
		},
	});
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	useSessionStore.setState({ entries: [], working: false, workingLabel: "thinking" });
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	LowerBoundResizeObserver.observers.clear();
	act(() => useSessionStore.setState({ entries: [], working: false, workingLabel: "thinking" }));
});

function render(entries: TranscriptEntry[]): void {
	root.render(
		<Transcript
			entries={entries}
			leafId="performance-leaf"
			hideThinking={false}
			hiddenThinkingLabel="Thinking hidden"
			onToggle={() => {}}
		/>,
	);
}

test("isolated long-transcript render stays within its deterministic lower-bound budget", () => {
	const samples: number[] = [];
	for (let sample = 0; sample < BUDGET_SAMPLES; sample += 1) {
		const entries = makeEntries(LONG_TRANSCRIPT_ROWS);
		const started = performance.now();
		act(() => render(entries));
		samples.push(performance.now() - started);
		if (sample === 0) {
			const firstRow = container.querySelector<HTMLElement>(".transcript-virtual-row");
			const virtualizer = container.querySelector<HTMLElement>(".transcript-virtualizer");
			assert.ok(firstRow && virtualizer);
			const before = Number.parseFloat(virtualizer.style.height);
			firstRow.dataset.testHeight = "240";
			act(() => LowerBoundResizeObserver.flush());
			assert.ok(Number.parseFloat(virtualizer.style.height) > before, "variable row resize updates layout height");
		}
	}
	const mountedRows = container.querySelectorAll(".transcript-virtual-row").length;
	assert.ok(mountedRows < 40, `virtualizer mounted ${mountedRows} rows`);
	assert.ok(layoutReads <= BUDGET_SAMPLES * 40, `layout read ${layoutReads} mounted rows, not all ${LONG_TRANSCRIPT_ROWS}`);
	assertBudget("isolated long-transcript render", samples, LONG_TRANSCRIPT_RENDER_BUDGET_MS);
});

test("store upserts and ToolRenderHost stay within the measured fast-stream budget", () => {
	const samples: number[] = [];
	let renderCount = 0;
	act(() => root.render(<StoreTranscriptHarness onRender={() => (renderCount += 1)} />));
	for (let sample = 0; sample < BUDGET_SAMPLES; sample += 1) {
		act(() => useSessionStore.setState({ entries: makeEntries(LONG_TRANSCRIPT_ROWS), working: false, workingLabel: "thinking" }));
		act(() =>
			useSessionStore.getState().ingestEvent({
				type: "tool_execution_start",
				toolCallId: "streaming-tool",
				toolName: "fixture-tool",
				args: { query: "budget" },
			}),
		);
		const started = performance.now();
		for (let index = 0; index < FAST_STREAM_DELTAS; index += 1) {
			act(() =>
				useSessionStore.getState().ingestEvent({
					type: "tool_execution_update",
					toolCallId: "streaming-tool",
					toolName: "fixture-tool",
					args: { query: "budget" },
					partialResult: { progress: "x".repeat(index + 1) },
				}),
			);
		}
		samples.push(performance.now() - started);
	}
	const finalEntry = useSessionStore.getState().entries.find((entry) => entry.id === "streaming-tool");
	assert.ok(finalEntry?.text.includes("x".repeat(FAST_STREAM_DELTAS)));
	assert.ok(renderCount >= FAST_STREAM_DELTAS * BUDGET_SAMPLES, `ToolRenderHost rendered ${renderCount} stream updates`);
	assert.ok(layoutReads <= BUDGET_SAMPLES * 40, `stream layout read ${layoutReads} mounted rows, not all ${LONG_TRANSCRIPT_ROWS}`);
	assertBudget("store upserts with ToolRenderHost", samples, FAST_STREAM_BUDGET_MS);
});
