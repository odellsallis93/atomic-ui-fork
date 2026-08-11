import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const SENSITIVE_KEY =
	/(?:api[-_]?key|access[-_]?token|auth(?:entication|orization)?|credential|password|passphrase|secret|private[-_]?key|client[-_]?secret|refresh[-_]?token|verification[-_]?code|user[-_]?code)/i;

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
		return parsed.protocol === "https:" || (parsed.protocol === "http:" && isLocalOrigin(parsed));
	} catch {
		return false;
	}
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
