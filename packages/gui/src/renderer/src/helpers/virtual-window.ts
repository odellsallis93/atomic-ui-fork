export const DEFAULT_ENTRY_HEIGHT = 120;
export const VIRTUAL_OVERSCAN_PX = 800;

export interface VirtualWindow {
	start: number;
	end: number;
	totalHeight: number;
	offsets: ReadonlyArray<number>;
}

class FenwickTree {
	private readonly tree: number[];

	constructor(values: readonly number[]) {
		this.tree = new Array(values.length + 1).fill(0);
		for (let index = 0; index < values.length; index += 1) this.add(index, values[index] ?? 0);
	}

	add(index: number, delta: number): void {
		for (let cursor = index + 1; cursor < this.tree.length; cursor += cursor & -cursor) {
			this.tree[cursor] = (this.tree[cursor] ?? 0) + delta;
		}
	}

	prefix(length: number): number {
		let total = 0;
		for (let cursor = Math.min(length, this.tree.length - 1); cursor > 0; cursor -= cursor & -cursor) {
			total += this.tree[cursor] ?? 0;
		}
		return total;
	}
}

/** Retained variable-height layout. Height updates and window queries stay sublinear. */
export class VirtualWindowLayout {
	readonly ids: readonly string[];
	readonly offsets: ReadonlyArray<number>;
	private readonly indexById: ReadonlyMap<string, number>;
	private readonly heights: number[];
	private readonly tree: FenwickTree;

	constructor(
		ids: readonly string[],
		measuredHeights: ReadonlyMap<string, number> = new Map(),
		estimatedHeight = DEFAULT_ENTRY_HEIGHT,
	) {
		this.ids = ids;
		this.indexById = new Map(ids.map((id, index) => [id, index]));
		this.heights = ids.map((id) => measuredHeights.get(id) ?? estimatedHeight);
		this.tree = new FenwickTree(this.heights);
		this.offsets = new Proxy([] as number[], {
			get: (target, property, receiver) => {
				if (property === "length") return this.ids.length + 1;
				if (typeof property === "string" && /^\d+$/.test(property)) return this.offset(Number(property));
				return Reflect.get(target, property, receiver);
			},
		}) as ReadonlyArray<number>;
	}

	setHeight(id: string, height: number): boolean {
		const index = this.indexById.get(id);
		if (index === undefined || !Number.isFinite(height) || height <= 0 || this.heights[index] === height)
			return false;
		const previous = this.heights[index] ?? 0;
		this.heights[index] = height;
		this.tree.add(index, height - previous);
		return true;
	}

	matchesIds(ids: readonly string[]): boolean {
		if (ids.length !== this.ids.length) return false;
		for (let index = 0; index < ids.length; index += 1) {
			if (ids[index] !== this.ids[index]) return false;
		}
		return true;
	}

	private offset(index: number): number {
		return this.tree.prefix(Math.max(0, Math.min(index, this.ids.length)));
	}

	private firstOffsetAtOrAfter(value: number): number {
		let low = 0;
		let high = this.ids.length;
		while (low < high) {
			const middle = Math.floor((low + high) / 2);
			if (this.offset(middle) < value) low = middle + 1;
			else high = middle;
		}
		return low;
	}

	private firstRowEndingAfter(value: number): number {
		let low = 0;
		let high = this.ids.length;
		while (low < high) {
			const middle = Math.floor((low + high) / 2);
			if (this.offset(middle + 1) <= value) low = middle + 1;
			else high = middle;
		}
		return low;
	}

	getWindow(scrollTop: number, viewportHeight: number, overscan = VIRTUAL_OVERSCAN_PX): VirtualWindow {
		const before = Math.max(0, scrollTop - overscan);
		const after = scrollTop + viewportHeight + overscan;
		const start = Math.min(this.ids.length, this.firstRowEndingAfter(before));
		const end = Math.max(start, Math.min(this.ids.length, this.firstOffsetAtOrAfter(after)));
		return { start, end, totalHeight: this.offset(this.ids.length), offsets: this.offsets };
	}
}

/** Compatibility helper for callers that do not retain a layout. */
export function getVirtualWindow(
	entryCount: number,
	scrollTop: number,
	viewportHeight: number,
	heights: ReadonlyMap<string, number>,
	ids: readonly string[],
	estimatedHeight = DEFAULT_ENTRY_HEIGHT,
	overscan = VIRTUAL_OVERSCAN_PX,
): VirtualWindow {
	return new VirtualWindowLayout(ids.slice(0, entryCount), heights, estimatedHeight).getWindow(
		scrollTop,
		viewportHeight,
		overscan,
	);
}

/** Returns the entry that owns a document offset. */
export function getEntryIndexAtOffset(offsets: readonly number[], scrollTop: number): number {
	let low = 0;
	let high = Math.max(0, offsets.length - 2);
	while (low < high) {
		const middle = Math.ceil((low + high) / 2);
		if ((offsets[middle] ?? 0) <= scrollTop) low = middle;
		else high = middle - 1;
	}
	return low;
}

export function isNearTranscriptEnd(
	scrollTop: number,
	viewportHeight: number,
	scrollHeight: number,
	threshold = 32,
): boolean {
	return scrollHeight - scrollTop - viewportHeight <= threshold;
}
