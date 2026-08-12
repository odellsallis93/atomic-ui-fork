import type { TerminalInputHandler } from "../../core/extensions/ui-types.ts";

export interface RpcTerminalInputResult {
	consumed: boolean;
	data?: string;
}

/** Mirrors pi-tui's ordered input-listener chain for an isolated host. */
export class RpcTerminalInputService {
	private readonly handlers = new Set<TerminalInputHandler>();

	add(handler: TerminalInputHandler): () => void {
		this.handlers.add(handler);
		return () => this.handlers.delete(handler);
	}

	intercept(data: string): RpcTerminalInputResult {
		let current = data;
		for (const handler of this.handlers) {
			const result = handler(current);
			if (result?.consume) return { consumed: true };
			if (result?.data !== undefined) current = result.data;
		}
		return current === data ? { consumed: false } : { consumed: false, data: current };
	}
}
