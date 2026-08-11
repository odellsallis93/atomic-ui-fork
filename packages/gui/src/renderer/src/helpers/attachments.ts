/** Pure helpers for composer image intake, send gating, and submit routing. */

import type { PromptImage } from "../../../shared/ipc.ts";

/** Structural subset of `File` used by intake helpers so they stay testable in Node. */
export interface ImageFileLike {
	type: string;
	name?: string;
}

/** Warning shown when a bash submit carries pending image attachments. */
export const BASH_IMAGE_WARNING = "Bash runs without image attachments — your images are still attached.";

/** True when the Send button should be active: text or at least one attached image. */
export function canSubmit(text: string, imageCount: number, disabled: boolean): boolean {
	if (disabled) return false;
	return text.trim().length > 0 || imageCount > 0;
}

/** True when a drag event carries files (as opposed to text or other data). */
export function isFileDrag(types: readonly string[]): boolean {
	return types.includes("Files");
}

/** Keeps only entries whose MIME type is an image. */
export function filterImageFiles<F extends ImageFileLike>(files: Iterable<F>): F[] {
	return Array.from(files).filter((file) => file.type.startsWith("image/"));
}

/** Converts a `data:` URL into the engine's `ImageContent` shape, or undefined when unusable. */
export function dataUrlToPromptImage(dataUrl: string, mimeType: string): PromptImage | undefined {
	const comma = dataUrl.indexOf(",");
	if (comma === -1) return undefined;
	const data = dataUrl.slice(comma + 1);
	if (data.length === 0) return undefined;
	return { type: "image", data, mimeType };
}

/** Reads a browser `File`/`Blob` as a data URL, rejecting on reader failure. */
export function readFileAsDataUrl(file: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result;
			if (typeof result !== "string") {
				reject(new Error("Reader produced a non-text result"));
				return;
			}
			resolve(result);
		};
		reader.onerror = () => reject(reader.error ?? new Error("Reader failed"));
		reader.onabort = () => reject(new Error("Reader aborted"));
		reader.readAsDataURL(file);
	});
}

/**
 * Reads every file to a prompt image. Resolves only once all reads settle, so callers can
 * gate submit on the returned promise. Failed reads are reported through `onError` and skipped.
 */
export async function readImageFiles<F extends ImageFileLike>(
	files: readonly F[],
	options: { readDataUrl: (file: F) => Promise<string>; onError?: (message: string) => void },
): Promise<PromptImage[]> {
	const results = await Promise.all(
		files.map(async (file): Promise<PromptImage | undefined> => {
			try {
				const image = dataUrlToPromptImage(await options.readDataUrl(file), file.type);
				if (!image) options.onError?.(`Failed to read image ${file.name ?? "attachment"}`);
				return image;
			} catch {
				options.onError?.(`Failed to read image ${file.name ?? "attachment"}`);
				return undefined;
			}
		}),
	);
	return results.filter((image): image is PromptImage => image !== undefined);
}

/** What a composer submit should do with the current text and attachments. */
export type SubmitPlan =
	| { kind: "none" }
	| {
			kind: "bash";
			message: string;
			command: string;
			excludeFromContext: boolean;
			keepImages: PromptImage[];
			warning?: string;
	  }
	| { kind: "prompt"; message: string; images: PromptImage[] };

/**
 * Routes a submit. `!!`/`!` run bash without attachments but keep them for the next prompt,
 * with a warning when any were pending. Image-only prompts are allowed.
 */
export function planSubmit(text: string, images: PromptImage[]): SubmitPlan {
	const message = text.trim();
	if (message.length === 0 && images.length === 0) return { kind: "none" };
	const bashPrefix = message.startsWith("!!") ? "!!" : message.startsWith("!") ? "!" : undefined;
	if (bashPrefix) {
		return {
			kind: "bash",
			message,
			command: message.slice(bashPrefix.length).trim(),
			excludeFromContext: bashPrefix === "!!",
			keepImages: images,
			...(images.length > 0 ? { warning: BASH_IMAGE_WARNING } : {}),
		};
	}
	return { kind: "prompt", message, images };
}
