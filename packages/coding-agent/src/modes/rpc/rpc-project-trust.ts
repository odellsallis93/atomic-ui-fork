import { getAgentDir } from "../../config.ts";
import {
	getProjectTrustOptions,
	getProjectTrustPath,
	hasProjectTrustInputs,
	type ProjectTrustOption,
	ProjectTrustStore,
} from "../../core/trust-manager.ts";

export interface RpcProjectTrustStatus {
	cwd: string;
	needsTrustPrompt: boolean;
	decision: boolean | null;
	hasProjectResources: boolean;
}

export interface RpcProjectTrustOption {
	id: "trust" | "trust-parent" | "trust-session" | "deny" | "deny-session";
	label: string;
	trusted: boolean;
	sessionOnly: boolean;
}

export interface RpcProjectTrustDecision {
	status: RpcProjectTrustStatus;
	/** Present only for a non-persistent choice; the host applies it to the next engine launch. */
	sessionOnly?: boolean;
}

function store(agentDir = getAgentDir()): ProjectTrustStore {
	return new ProjectTrustStore(agentDir);
}

function statusFor(cwd: string, trustStore: ProjectTrustStore): RpcProjectTrustStatus {
	const hasProjectResources = hasProjectTrustInputs(cwd);
	const decision = trustStore.get(cwd);
	return {
		cwd: getProjectTrustPath(cwd),
		hasProjectResources,
		decision,
		needsTrustPrompt: hasProjectResources && decision === null,
	};
}

function optionId(option: ProjectTrustOption): RpcProjectTrustOption["id"] {
	if (option.updates.length === 0) return option.trusted ? "trust-session" : "deny-session";
	if (option.trusted && option.updates.length > 1) return "trust-parent";
	return option.trusted ? "trust" : "deny";
}

function optionsFor(cwd: string): Array<{ option: ProjectTrustOption; public: RpcProjectTrustOption }> {
	return getProjectTrustOptions(cwd, { includeSessionOnly: true }).map((option) => {
		const id = optionId(option);
		return {
			option,
			public: { id, label: option.label, trusted: option.trusted, sessionOnly: option.updates.length === 0 },
		};
	});
}

/** Engine-owned trust status/options. No trust-store path or raw JSON crosses the RPC boundary. */
export function getRpcProjectTrustStatus(cwd: string, agentDir?: string): RpcProjectTrustStatus {
	return statusFor(cwd, store(agentDir));
}

export function getRpcProjectTrustOptions(cwd: string): RpcProjectTrustOption[] {
	return optionsFor(cwd).map(({ public: option }) => option);
}

export function setRpcProjectTrust(
	cwd: string,
	optionIdValue: RpcProjectTrustOption["id"],
	agentDir?: string,
): RpcProjectTrustDecision {
	const trustStore = store(agentDir);
	const selected = optionsFor(cwd).find(({ public: option }) => option.id === optionIdValue);
	if (!selected) throw new Error(`Unknown trust option: ${optionIdValue}`);
	if (selected.option.updates.length > 0) trustStore.setMany(selected.option.updates);
	const status = statusFor(cwd, trustStore);
	return {
		status:
			selected.option.updates.length === 0
				? { ...status, decision: selected.option.trusted, needsTrustPrompt: false }
				: status,
		...(selected.option.updates.length === 0 ? { sessionOnly: selected.option.trusted } : {}),
	};
}
