import type { GuiHostApi } from "../../shared/ipc.ts";

declare global {
	interface Window {
		atomicGui: GuiHostApi;
	}
}
