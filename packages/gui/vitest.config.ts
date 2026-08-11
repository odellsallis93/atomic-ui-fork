import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

/** Structural timeout: protocol-client tests spawn a fake engine child. */
export const ENGINE_CLIENT_SPAWN_TIMEOUT_MS = 15_000;

export default defineConfig({
	resolve: {
		alias: {
			"@shared": resolve("src/shared"),
		},
	},
	test: {
		environment: "node",
		include: ["test/**/*.test.{ts,tsx}"],
		testTimeout: 30_000,
	},
});
