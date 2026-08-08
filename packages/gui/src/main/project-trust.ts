import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

export type TrustDecision = boolean | null;

export interface TrustStatus {
	cwd: string;
	needsTrustPrompt: boolean;
	decision: TrustDecision;
	hasProjectResources: boolean;
}

export interface TrustOption {
	id: string;
	label: string;
	trusted: boolean;
	/** Absolute path to persist, or null for session-only. */
	persistPath: string | null;
}

const TRUST_RESOURCES = [
	"settings.json",
	"extensions",
	"skills",
	"prompts",
	"themes",
	"SYSTEM.md",
	"APPEND_SYSTEM.md",
] as const;

function agentDir(env: NodeJS.ProcessEnv = process.env): string {
	const override = env.ATOMIC_AGENT_DIR?.trim() || env.PI_AGENT_DIR?.trim();
	if (override) return resolve(override);
	return join(homedir(), ".atomic", "agent");
}

function trustFilePath(env: NodeJS.ProcessEnv = process.env): string {
	return join(agentDir(env), "trust.json");
}

function normalizeCwd(cwd: string): string {
	return resolve(cwd);
}

function readTrustFile(env: NodeJS.ProcessEnv = process.env): Record<string, boolean | null> {
	const path = trustFilePath(env);
	if (!existsSync(path)) return {};
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
		const out: Record<string, boolean | null> = {};
		for (const [key, value] of Object.entries(parsed)) {
			if (value === true || value === false || value === null) out[key] = value;
		}
		return out;
	} catch {
		return {};
	}
}

function writeTrustFile(data: Record<string, boolean | null>, env: NodeJS.ProcessEnv = process.env): void {
	const path = trustFilePath(env);
	mkdirSync(dirname(path), { recursive: true });
	const sorted: Record<string, boolean | null> = {};
	for (const key of Object.keys(data).sort()) {
		const value = data[key];
		if (value === true || value === false || value === null) sorted[key] = value;
	}
	writeFileSync(path, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
}

function findDecision(data: Record<string, boolean | null>, cwd: string): TrustDecision {
	let current = normalizeCwd(cwd);
	while (true) {
		const value = data[current];
		if (value === true || value === false) return value;
		const parent = dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}

export function hasProjectTrustInputs(cwd: string): boolean {
	const root = normalizeCwd(cwd);
	for (const configDir of [".atomic", ".pi"]) {
		for (const entry of TRUST_RESOURCES) {
			if (existsSync(join(root, configDir, entry))) return true;
		}
	}
	for (const name of ["AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"]) {
		if (existsSync(join(root, name))) return true;
	}
	if (existsSync(join(root, ".agents", "skills"))) return true;
	return false;
}

export function getTrustStatus(cwd: string, env: NodeJS.ProcessEnv = process.env): TrustStatus {
	const normalized = normalizeCwd(cwd);
	const hasProjectResources = hasProjectTrustInputs(normalized);
	const decision = findDecision(readTrustFile(env), normalized);
	return {
		cwd: normalized,
		hasProjectResources,
		decision,
		needsTrustPrompt: hasProjectResources && decision === null,
	};
}

export function getTrustOptions(cwd: string): TrustOption[] {
	const trustPath = normalizeCwd(cwd);
	const parent = dirname(trustPath);
	const options: TrustOption[] = [
		{ id: "trust", label: "Trust", trusted: true, persistPath: trustPath },
	];
	if (parent !== trustPath) {
		options.push({
			id: "trust-parent",
			label: `Trust parent folder (${parent})`,
			trusted: true,
			persistPath: parent,
		});
	}
	options.push(
		{ id: "trust-session", label: "Trust (this session only)", trusted: true, persistPath: null },
		{ id: "deny", label: "Do not trust", trusted: false, persistPath: trustPath },
		{ id: "deny-session", label: "Do not trust (this session only)", trusted: false, persistPath: null },
	);
	return options;
}

export function applyTrustDecision(
	cwd: string,
	optionId: string,
	env: NodeJS.ProcessEnv = process.env,
): TrustStatus {
	const option = getTrustOptions(cwd).find((item) => item.id === optionId);
	if (!option) throw new Error(`Unknown trust option: ${optionId}`);
	if (option.persistPath) {
		const data = readTrustFile(env);
		data[normalizeCwd(option.persistPath)] = option.trusted;
		// When trusting parent, clear a more-specific deny/null for cwd so nearest lookup sees parent.
		if (option.id === "trust-parent") {
			delete data[normalizeCwd(cwd)];
		}
		writeTrustFile(data, env);
	}
	const status = getTrustStatus(cwd, env);
	if (!option.persistPath) {
		return { ...status, decision: option.trusted, needsTrustPrompt: false };
	}
	return status;
}
