import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
	main: {
		plugins: [externalizeDepsPlugin()],
		build: {
			rollupOptions: {
				input: {
					index: resolve("src/main/index.ts"),
				},
			},
		},
	},
	preload: {
		plugins: [externalizeDepsPlugin()],
		build: {
			rollupOptions: {
				input: {
					index: resolve("src/preload/index.ts"),
				},
				output: {
					format: "cjs",
					entryFileNames: "[name].js",
				},
			},
		},
	},
	renderer: {
		root: resolve("src/renderer"),
		plugins: [react()],
		resolve: {
			alias: {
				"@shared": resolve("src/shared"),
				"@renderer": resolve("src/renderer/src"),
			},
		},
		build: {
			rollupOptions: {
				input: {
					index: resolve("src/renderer/index.html"),
				},
			},
		},
	},
});
