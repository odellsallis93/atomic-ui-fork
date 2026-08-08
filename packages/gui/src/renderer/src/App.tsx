import { useEffect } from "react";
import { Composer } from "./components/Composer";
import { Footer } from "./components/Footer";
import { Transcript } from "./components/Transcript";
import { useSessionStore } from "./store/session-store";

function hasGuiApi(): boolean {
	return typeof window !== "undefined" && typeof window.atomicGui !== "undefined";
}

export function App() {
	const status = useSessionStore((s) => s.status);
	const entries = useSessionStore((s) => s.entries);
	const working = useSessionStore((s) => s.working);
	const workingLabel = useSessionStore((s) => s.workingLabel);
	const rawLines = useSessionStore((s) => s.rawLines);
	const showRawLog = useSessionStore((s) => s.showRawLog);
	const queue = useSessionStore((s) => s.queue);
	const composerText = useSessionStore((s) => s.composerText);
	const errorBanner = useSessionStore((s) => s.errorBanner);
	const usageLabel = useSessionStore((s) => s.usageLabel);
	const setStatus = useSessionStore((s) => s.setStatus);
	const setComposerText = useSessionStore((s) => s.setComposerText);
	const toggleRawLog = useSessionStore((s) => s.toggleRawLog);
	const appendRawLine = useSessionStore((s) => s.appendRawLine);
	const ingestEvent = useSessionStore((s) => s.ingestEvent);
	const setErrorBanner = useSessionStore((s) => s.setErrorBanner);
	const toggleEntryExpanded = useSessionStore((s) => s.toggleEntryExpanded);

	useEffect(() => {
		if (!hasGuiApi()) return;
		const api = window.atomicGui;
		void api.getStatus().then(setStatus);
		const offStatus = api.onStatus(setStatus);
		const offEvent = api.onEvent(ingestEvent);
		const offRaw = api.onRawLine(appendRawLine);
		return () => {
			offStatus();
			offEvent();
			offRaw();
		};
	}, [appendRawLine, ingestEvent, setStatus]);

	const ready = status.state === "ready";
	const starting = status.state === "starting";

	const startEngine = async (): Promise<void> => {
		if (!hasGuiApi()) {
			setErrorBanner("GUI host API unavailable (open via Electron).");
			return;
		}
		try {
			const next = await window.atomicGui.startEngine({ cwd: status.cwd });
			setStatus(next);
		} catch (error) {
			setErrorBanner(error instanceof Error ? error.message : String(error));
		}
	};

	const stopEngine = async (): Promise<void> => {
		if (!hasGuiApi()) return;
		await window.atomicGui.stopEngine();
	};

	const submit = async (behavior?: "steer" | "followUp"): Promise<void> => {
		const message = composerText.trim();
		if (!message || !hasGuiApi()) return;
		setComposerText("");
		const result = await window.atomicGui.prompt({
			message,
			...(behavior ? { streamingBehavior: behavior } : {}),
		});
		if (!result.ok) setErrorBanner(result.error ?? "Prompt failed");
	};

	const abort = async (): Promise<void> => {
		if (!hasGuiApi()) return;
		const result = await window.atomicGui.abort();
		if (!result.ok) setErrorBanner(result.error ?? "Abort failed");
	};

	return (
		<div className="app-shell">
			<header className="topbar">
				<div className="brand">
					<span className="brand-mark">∀ Atomic</span>
					<span className="brand-sub">GUI host</span>
				</div>
				<div className="status-chip">
					<span className={`status-dot ${status.state}`} />
					<span>{status.state}</span>
					{status.pid ? <span>pid {status.pid}</span> : null}
				</div>
				<div className="topbar-actions">
					<button type="button" className="btn" onClick={toggleRawLog}>
						{showRawLog ? "Hide log" : "Raw log"}
					</button>
					{ready ? (
						<button type="button" className="btn" onClick={() => void stopEngine()}>
							Stop engine
						</button>
					) : (
						<button
							type="button"
							className="btn btn-primary"
							disabled={starting}
							onClick={() => void startEngine()}
						>
							{starting ? "Starting…" : "Start engine"}
						</button>
					)}
				</div>
			</header>

			{errorBanner ? (
				<div className="error-banner" role="alert">
					{errorBanner}
				</div>
			) : null}

			<Transcript entries={entries} onToggle={toggleEntryExpanded} />

			{showRawLog ? <pre className="raw-log">{rawLines.join("\n")}</pre> : null}

			<Composer
				value={composerText}
				disabled={!ready}
				working={working}
				queue={queue}
				onChange={setComposerText}
				onSubmit={(behavior) => void submit(behavior)}
				onAbort={() => void abort()}
			/>

			<Footer
				cwd={status.cwd ?? processCwdFallback()}
				engineLabel={
					status.protocolVersion
						? `engine v${status.protocolVersion}`
						: status.cliPath
							? "engine unresolved"
							: "engine idle"
				}
				usageLabel={usageLabel}
				working={working}
				workingLabel={workingLabel}
			/>
		</div>
	);
}

function processCwdFallback(): string {
	return ".";
}
