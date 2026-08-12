import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const SENSITIVE_KEY =
	/(?:api[-_]?key|access[-_]?token|auth(?:entication|orization)?|bearer|client[-_]?secret|credential|passphrase|password|private[-_]?key|refresh[-_]?token|secret|token|verification[-_]?code|user[-_]?code|key|code)/i;

function isLocalOrigin(url: URL): boolean {
	return (url.protocol === "http:" || url.protocol === "https:") && LOCAL_HOSTNAMES.has(url.hostname);
}

/** Only the packaged document or the local dev server may navigate the app window. */
export function isAllowedAppNavigation(url: string, packagedIndexPath: string, devRendererUrl?: string): boolean {
	if (url === "about:blank") return true;
	try {
		const target = new URL(url);
		if (target.protocol === "file:") return resolve(fileURLToPath(target)) === resolve(packagedIndexPath);
		if (!devRendererUrl) return false;
		const dev = new URL(devRendererUrl);
		return isLocalOrigin(dev) && target.origin === dev.origin;
	} catch {
		return false;
	}
}

/** Links leave the app only through the user's system browser, and only over HTTPS (or local HTTP). */
export function isSafeExternalUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		if (parsed.username || parsed.password) return false;
		return parsed.protocol === "https:" || (parsed.protocol === "http:" && isLocalOrigin(parsed));
	} catch {
		return false;
	}
}

/** IPC may only be invoked by the current app window's loaded renderer. */
export function isTrustedIpcSender(
	senderId: number,
	expectedSenderId: number,
	senderUrl: string,
	packagedIndexPath: string,
	devRendererUrl?: string,
): boolean {
	return (
		senderId === expectedSenderId &&
		senderUrl !== "about:blank" &&
		isAllowedAppNavigation(senderUrl, packagedIndexPath, devRendererUrl)
	);
}

function redactValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(redactValue);
	if (typeof value !== "object" || value === null) return value;
	const result: Record<string, unknown> = {};
	for (const [key, child] of Object.entries(value)) {
		result[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redactValue(child);
	}
	return result;
}

/** Prevent the optional renderer raw log from retaining protocol fields that hold secrets. */
export function redactSensitiveProtocolLine(line: string): string {
	try {
		return JSON.stringify(redactValue(JSON.parse(line)));
	} catch {
		return line;
	}
}

/**
 * The raw diagnostic panel must not duplicate a complete durable transcript
 * across Electron IPC. The typed get_entries response already carries those
 * entries to its caller; the log keeps the useful pagination metadata instead.
 */
export function summarizeRawProtocolLine(line: string): string {
	try {
		const value = JSON.parse(line) as {
			type?: unknown;
			command?: unknown;
			success?: unknown;
			id?: unknown;
			data?: { entries?: unknown; leafId?: unknown; total?: unknown; nextOffset?: unknown };
		};
		if (
			value.type === "response" &&
			value.command === "get_entries" &&
			value.success === true &&
			Array.isArray(value.data?.entries)
		) {
			return JSON.stringify({
				type: "response",
				command: "get_entries",
				success: true,
				...(typeof value.id === "string" ? { id: value.id } : {}),
				data: {
					entryCount: value.data.entries.length,
					...(typeof value.data.leafId === "string" || value.data.leafId === null
						? { leafId: value.data.leafId }
						: {}),
					...(typeof value.data.total === "number" ? { total: value.data.total } : {}),
					...(typeof value.data.nextOffset === "number" || value.data.nextOffset === null
						? { nextOffset: value.data.nextOffset }
						: {}),
				},
			});
		}
	} catch {
		// Preserve malformed diagnostic output as-is, consistent with redaction.
	}
	return redactSensitiveProtocolLine(line);
}
