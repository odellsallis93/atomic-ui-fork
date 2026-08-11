import { useCallback, useEffect, useRef, useState } from "react";
import type { ExtensionUiResponse, ForkMessageInfo, GuiSettingsSnapshot, PromptImage } from "../../shared/ipc";
import { AuthPanel } from "./components/AuthPanel";
import { ChromeFrame } from "./components/ChromeFrame";
import { Composer } from "./components/Composer";
import { DialogModal } from "./components/DialogModal";
import { Footer } from "./components/Footer";
import { FrameOverlay } from "./components/FrameOverlay";
import { FrameRenderHost } from "./components/FrameRenderHost";
import { HostSessionPickerModal } from "./components/HostSessionPickerModal";
import { InputFormModal } from "./components/InputFormModal";
import { ModelPicker } from "./components/ModelPicker";
import { OnboardingPanel } from "./components/OnboardingPanel";
import { SessionPicker } from "./components/SessionPicker";
import { SettingsPanel } from "./components/SettingsPanel";
import { ToastStack } from "./components/ToastStack";
import { ToolRenderHost } from "./components/ToolRenderHost";
import { Transcript } from "./components/Transcript";
import { TreeNavigator } from "./components/TreeNavigator";
import { TrustDialog } from "./components/TrustDialog";
import { createSubmitGate, planSubmit, readFileAsDataUrl, readImageFiles } from "./helpers/attachments";
import { actionForKey, keyboardShortcut, restoreFailedDraft } from "./helpers/composer-parity";
import { RefreshGeneration } from "./helpers/refresh-generation";
import { formatUsage, useSessionStore } from "./store/session-store";

function hasGuiApi(): boolean {
	return typeof window !== "undefined" && typeof window.atomicGui !== "undefined";
}

function applyThemeCss(vars: Record<string, string>): void {
	const root = document.documentElement;
	for (const [key, value] of Object.entries(vars)) {
		root.style.setProperty(key, value);
	}
}

function shortcutKeyId(event: KeyboardEvent): string | undefined {
	if (event.key === "Control" || event.key === "Alt" || event.key === "Shift" || event.key === "Meta")
		return undefined;
	const specialKeys: Record<string, string> = {
		ArrowDown: "down",
		ArrowLeft: "left",
		ArrowRight: "right",
		ArrowUp: "up",
		Backspace: "backspace",
		Delete: "delete",
		End: "end",
		Enter: "enter",
		Escape: "escape",
		Home: "home",
		PageDown: "pagedown",
		PageUp: "pageup",
		Tab: "tab",
		" ": "space",
	};
	const base = specialKeys[event.key] ?? (event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase());
	if (!base) return undefined;
	const modifiers = [
		event.ctrlKey ? "ctrl" : undefined,
		event.shiftKey ? "shift" : undefined,
		event.altKey ? "alt" : undefined,
		event.metaKey ? "super" : undefined,
	].filter((modifier): modifier is string => modifier !== undefined);
	return [...modifiers, base].join("+");
}

function normalizedShortcutKey(key: string): string {
	const parts = key.toLowerCase().split("+");
	const modifiers = new Set<string>(
		parts.filter((part) => part === "ctrl" || part === "shift" || part === "alt" || part === "super"),
	);
	const base = parts.filter((part) => !modifiers.has(part)).join("+");
	return [
		modifiers.has("ctrl") ? "ctrl" : undefined,
		modifiers.has("shift") ? "shift" : undefined,
		modifiers.has("alt") ? "alt" : undefined,
		modifiers.has("super") ? "super" : undefined,
		base,
	]
		.filter((part): part is string => part !== undefined)
		.join("+");
}

export function App() {
	const status = useSessionStore((s) => s.status);
	const entries = useSessionStore((s) => s.entries);
	const working = useSessionStore((s) => s.working);
	const workingLabel = useSessionStore((s) => s.workingLabel);
	const workingVisible = useSessionStore((s) => s.workingVisible);
	const workingIndicatorFrames = useSessionStore((s) => s.workingIndicatorFrames);
	const workingIndicatorIntervalMs = useSessionStore((s) => s.workingIndicatorIntervalMs);
	const rawLines = useSessionStore((s) => s.rawLines);
	const showRawLog = useSessionStore((s) => s.showRawLog);
	const hideThinking = useSessionStore((s) => s.hideThinking);
	const hiddenThinkingLabel = useSessionStore((s) => s.hiddenThinkingLabel);
	const queue = useSessionStore((s) => s.queue);
	const composerText = useSessionStore((s) => s.composerText);
	const errorBanner = useSessionStore((s) => s.errorBanner);
	const usageLabel = useSessionStore((s) => s.usageLabel);
	const commands = useSessionStore((s) => s.commands);
	const extensionShortcuts = useSessionStore((s) => s.extensionShortcuts);
	const keybindings = useSessionStore((s) => s.keybindings);
	const models = useSessionStore((s) => s.models);
	const sessions = useSessionStore((s) => s.sessions);
	const treeNodes = useSessionStore((s) => s.treeNodes);
	const treeLeafId = useSessionStore((s) => s.treeLeafId);
	const themes = useSessionStore((s) => s.themes);
	const themeName = useSessionStore((s) => s.themeName);
	const frames = useSessionStore((s) => s.frames);
	const customHeader = frames.find((frame) => !frame.hidden && frame.chromeSlot === "header");
	const customFooter = frames.find((frame) => !frame.hidden && frame.chromeSlot === "footer");
	const customEditor = frames.find((frame) => !frame.hidden && frame.chromeSlot === "editor");
	const authCatalog = useSessionStore((s) => s.authCatalog);
	const authBusyProvider = useSessionStore((s) => s.authBusyProvider);
	const trustStatus = useSessionStore((s) => s.trustStatus);
	const trustOptions = useSessionStore((s) => s.trustOptions);
	const inputForm = useSessionStore((s) => s.inputForm);
	const hostSessionPicker = useSessionStore((s) => s.hostSessionPicker);
	const modal = useSessionStore((s) => s.modal);
	const activeDialog = useSessionStore((s) => s.activeDialog);
	const widgets = useSessionStore((s) => s.widgets);
	const toasts = useSessionStore((s) => s.toasts);
	const statusSegments = useSessionStore((s) => s.statusSegments);
	const setStatus = useSessionStore((s) => s.setStatus);
	const setComposerText = useSessionStore((s) => s.setComposerText);
	const pushPromptHistory = useSessionStore((s) => s.pushPromptHistory);
	const historyUp = useSessionStore((s) => s.historyUp);
	const historyDown = useSessionStore((s) => s.historyDown);
	const toggleRawLog = useSessionStore((s) => s.toggleRawLog);
	const toggleThinking = useSessionStore((s) => s.toggleThinking);
	const appendRawLine = useSessionStore((s) => s.appendRawLine);
	const ingestEvent = useSessionStore((s) => s.ingestEvent);
	const ingestExtensionUi = useSessionStore((s) => s.ingestExtensionUi);
	const setErrorBanner = useSessionStore((s) => s.setErrorBanner);
	const toggleEntryExpanded = useSessionStore((s) => s.toggleEntryExpanded);
	const setCommands = useSessionStore((s) => s.setCommands);
	const setModels = useSessionStore((s) => s.setModels);
	const setSessions = useSessionStore((s) => s.setSessions);
	const setTree = useSessionStore((s) => s.setTree);
	const setThemes = useSessionStore((s) => s.setThemes);
	const setThemeName = useSessionStore((s) => s.setThemeName);
	const [guiSettings, setGuiSettings] = useState<GuiSettingsSnapshot | undefined>(undefined);
	const [thinkingLevels, setThinkingLevels] = useState<string[]>([]);
	const setAuthCatalog = useSessionStore((s) => s.setAuthCatalog);
	const setAuthBusyProvider = useSessionStore((s) => s.setAuthBusyProvider);
	const setTrust = useSessionStore((s) => s.setTrust);
	const clearInputForm = useSessionStore((s) => s.clearInputForm);
	const clearHostSessionPicker = useSessionStore((s) => s.clearHostSessionPicker);
	const setModal = useSessionStore((s) => s.setModal);
	const setUsageLabel = useSessionStore((s) => s.setUsageLabel);
	const clearDialog = useSessionStore((s) => s.clearDialog);
	const dismissToast = useSessionStore((s) => s.dismissToast);
	const dismissFrame = useSessionStore((s) => s.dismissFrame);
	const resetTranscript = useSessionStore((s) => s.resetTranscript);
	const hydrateTranscript = useSessionStore((s) => s.hydrateTranscript);
	const setExtensionShortcuts = useSessionStore((s) => s.setExtensionShortcuts);
	const pendingSessionPath = useRef<string | undefined>(undefined);
	const transcriptRefreshGeneration = useRef(new RefreshGeneration());
	const treeRefreshGeneration = useRef(new RefreshGeneration());
	const [attachedImages, setAttachedImages] = useState<PromptImage[]>([]);
	const [forkMessages, setForkMessages] = useState<ForkMessageInfo[]>([]);
	const [compacting, setCompacting] = useState(false);
	const [composerFocusRequest, setComposerFocusRequest] = useState(0);
	const attachedImagesRef = useRef<PromptImage[]>(attachedImages);
	const pendingImageReads = useRef<Set<Promise<void>>>(new Set());
	const submitGate = useRef(createSubmitGate());
	/** Mirrors attachment state into a ref so async submit paths never read a stale snapshot. */
	const setAttached = useCallback((next: PromptImage[] | ((current: PromptImage[]) => PromptImage[])): void => {
		const value = typeof next === "function" ? next(attachedImagesRef.current) : next;
		attachedImagesRef.current = value;
		setAttachedImages(value);
	}, []);

	const refreshMetadata = useCallback(async (): Promise<void> => {
		if (!hasGuiApi()) return;
		const [commandsResult, modelsResult, statsResult, stateResult, shortcutsResult] = await Promise.all([
			window.atomicGui.getCommands(),
			window.atomicGui.getModels(),
			window.atomicGui.getSessionStats(),
			window.atomicGui.refreshState(),
			window.atomicGui.getShortcuts(),
		]);
		if (commandsResult.ok && commandsResult.data) setCommands(commandsResult.data);
		if (modelsResult.ok && modelsResult.data) setModels(modelsResult.data);
		if (statsResult.ok && statsResult.data) {
			setUsageLabel(formatUsage(statsResult.data.tokens, statsResult.data.cost, statsResult.data.contextPercent));
		}
		if (stateResult.ok && stateResult.data) setStatus(stateResult.data);
		if (shortcutsResult.ok && shortcutsResult.data) setExtensionShortcuts(shortcutsResult.data);
	}, [setCommands, setExtensionShortcuts, setModels, setStatus, setUsageLabel]);

	const refreshTranscript = useCallback(async (): Promise<void> => {
		if (!hasGuiApi()) return;
		const generation = transcriptRefreshGeneration.current.begin();
		const result = await window.atomicGui.getEntries();
		if (!transcriptRefreshGeneration.current.isCurrent(generation)) return;
		if (!result.ok || !result.data) {
			setErrorBanner(result.error ?? "Failed to load session transcript");
			return;
		}
		hydrateTranscript(result.data.entries, result.data.leafId);
	}, [hydrateTranscript, setErrorBanner]);

	const refreshTree = useCallback(async (): Promise<void> => {
		if (!hasGuiApi()) return;
		const generation = treeRefreshGeneration.current.begin();
		const result = await window.atomicGui.getTree();
		if (!treeRefreshGeneration.current.isCurrent(generation)) return;
		if (!result.ok || !result.data) {
			setErrorBanner(result.error ?? "Failed to load session tree");
			return;
		}
		setTree(result.data.nodes, result.data.leafId);
	}, [setErrorBanner, setTree]);

	const refreshSessionView = useCallback(async (): Promise<void> => {
		await Promise.all([refreshTranscript(), refreshTree()]);
	}, [refreshTranscript, refreshTree]);

	useEffect(() => {
		if (!hasGuiApi()) return;
		const api = window.atomicGui;
		void api.getStatus().then(setStatus);
		void (async () => {
			const settings = await api.getSettings();
			setThemeName(settings.theme);
			const theme = await api.getThemeCss(settings.theme);
			applyThemeCss(theme.cssVariables);
			setThemes(await api.listThemes());
		})();
		const offStatus = api.onStatus(setStatus);
		const offEvent = api.onEvent(ingestEvent);
		const offRaw = api.onRawLine(appendRawLine);
		const offUi = api.onExtensionUi(ingestExtensionUi);
		return () => {
			offStatus();
			offEvent();
			offRaw();
			offUi();
		};
	}, [appendRawLine, ingestEvent, ingestExtensionUi, setStatus, setThemeName, setThemes]);

	useEffect(() => {
		if (status.state !== "ready") return;
		void refreshMetadata();
		const timer = window.setInterval(() => {
			void window.atomicGui.getSessionStats().then((result) => {
				if (result.ok && result.data) {
					setUsageLabel(formatUsage(result.data.tokens, result.data.cost, result.data.contextPercent));
				}
			});
		}, 5000);
		return () => window.clearInterval(timer);
	}, [refreshMetadata, setUsageLabel, status.state]);

	const ready = status.state === "ready";
	const starting = status.state === "starting";

	const openModels = useCallback(async (): Promise<void> => {
		if (!hasGuiApi()) return;
		const result = await window.atomicGui.getModels();
		if (result.ok && result.data) setModels(result.data);
		setModal("models");
	}, [setModal, setModels]);

	const openSessions = useCallback(async (): Promise<void> => {
		if (!hasGuiApi()) return;
		const [listed, forkResult] = await Promise.all([
			window.atomicGui.listSessions({ cwd: status.cwd }),
			window.atomicGui.getForkMessages(),
		]);
		setSessions(listed);
		setForkMessages(forkResult.ok && forkResult.data ? forkResult.data : []);
		setModal("sessions");
	}, [setModal, setSessions, status.cwd]);

	const openTree = useCallback(async (): Promise<void> => {
		await refreshTree();
		setModal("tree");
	}, [refreshTree, setModal]);

	const focusComposer = useCallback((): void => {
		window.requestAnimationFrame(() => setComposerFocusRequest((request) => request + 1));
	}, []);

	const openSettings = useCallback(async (): Promise<void> => {
		if (!hasGuiApi()) return;
		setThemes(await window.atomicGui.listThemes());
		const settings = await window.atomicGui.getSettings();
		setGuiSettings(settings);
		setThemeName(settings.theme);
		if (status.state === "ready") {
			const levels = await window.atomicGui.getAvailableThinkingLevels();
			if (levels.ok && levels.data) setThinkingLevels(levels.data);
		}
		setModal("settings");
	}, [setModal, setThemeName, setThemes, status.state]);

	const openAuth = useCallback(async (): Promise<void> => {
		if (!hasGuiApi()) return;
		const result = await window.atomicGui.getAuthCatalog();
		if (result.ok && result.data) {
			setAuthCatalog(result.data);
			setModels(result.data.models);
		}
		setModal("auth");
	}, [setAuthCatalog, setModal, setModels]);

	const maybePromptTrust = useCallback(async (): Promise<void> => {
		if (!hasGuiApi()) return;
		const statusResult = await window.atomicGui.getTrustStatus(status.cwd);
		if (!statusResult?.needsTrustPrompt) return;
		const options = await window.atomicGui.getTrustOptions(status.cwd);
		setTrust(statusResult, options);
		setModal("trust");
	}, [setModal, setTrust, status.cwd]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent): void => {
			if (!hasGuiApi() || status.state !== "ready" || modal !== "none" || event.defaultPrevented) return;
			const shortcutKey = shortcutKeyId(event);
			const extensionShortcut = shortcutKey
				? extensionShortcuts.find(
						(candidate) => normalizedShortcutKey(candidate.key) === normalizedShortcutKey(shortcutKey),
					)
				: undefined;
			if ((event.target as HTMLElement | null)?.closest(".composer-editor") && !extensionShortcut) return;
			const configuredAction = actionForKey(keybindings, keyboardShortcut(event) ?? "", "transcript");
			if (configuredAction === "app.model.select") {
				event.preventDefault();
				void openModels();
				return;
			}
			if (configuredAction === "app.model.cycleForward" || configuredAction === "app.model.cycleBackward") {
				event.preventDefault();
				void window.atomicGui
					.cycleModel(configuredAction === "app.model.cycleForward" ? "forward" : "backward")
					.then((result) => {
						if (!result.ok) setErrorBanner(result.error);
						else void refreshMetadata();
					});
				return;
			}
			if (configuredAction === "app.thinking.cycle") {
				event.preventDefault();
				void window.atomicGui.cycleThinking().then((result) => {
					if (!result.ok) setErrorBanner(result.error);
					else void refreshMetadata();
				});
				return;
			}
			if (configuredAction === "app.thinking.toggle") {
				event.preventDefault();
				toggleThinking();
				return;
			}
			if (configuredAction === "app.tools.expand") {
				event.preventDefault();
				const lastTool = [...entries].reverse().find((entry) => entry.kind === "tool");
				if (lastTool) toggleEntryExpanded(lastTool.id);
				return;
			}
			if (event.ctrlKey && event.key.toLowerCase() === ",") {
				event.preventDefault();
				void openSettings();
			} else if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "a") {
				event.preventDefault();
				void openAuth();
			} else if (extensionShortcut) {
				event.preventDefault();
				void window.atomicGui.invokeShortcut(extensionShortcut.key).then((result) => {
					if (!result.ok) setErrorBanner(result.error ?? `Shortcut ${extensionShortcut.key} failed`);
				});
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [
		entries,
		extensionShortcuts,
		keybindings,
		openAuth,
		openModels,
		openSettings,
		refreshMetadata,
		modal,
		setErrorBanner,
		status.state,
		toggleEntryExpanded,
		toggleThinking,
	]);

	const startEngine = async (sessionPath?: string): Promise<void> => {
		if (!hasGuiApi()) {
			setErrorBanner("GUI host API unavailable (open via Electron).");
			return;
		}
		try {
			await maybePromptTrust();
			if (useSessionStore.getState().modal === "trust") {
				pendingSessionPath.current = sessionPath;
				return;
			}
			const next = await window.atomicGui.startEngine({ cwd: status.cwd, sessionPath });
			setStatus(next);
			resetTranscript();
			await refreshTranscript();
			await refreshMetadata();
		} catch (error) {
			setErrorBanner(error instanceof Error ? error.message : String(error));
		}
	};

	const stopEngine = async (): Promise<void> => {
		if (!hasGuiApi()) return;
		await window.atomicGui.stopEngine();
	};

	const submit = async (behavior?: "steer" | "followUp", submittedMessage = composerText): Promise<void> => {
		if (!hasGuiApi()) return;
		// One submit at a time: the read-wait below yields, so a second Enter would otherwise
		// re-enter with the same composer text and send it twice.
		if (!submitGate.current.begin()) return;
		try {
			// Wait out in-flight image reads so an early submit cannot drop or leak attachments.
			while (pendingImageReads.current.size > 0) {
				await Promise.all([...pendingImageReads.current]);
			}
			const plan = planSubmit(submittedMessage, attachedImagesRef.current);
			if (plan.kind === "none") return;
			// Drop any banner from the previous submit so a stale advisory cannot outlive it.
			setErrorBanner(undefined);
			pushPromptHistory(plan.message);
			setComposerText("");

			if (plan.kind === "bash") {
				setAttached(plan.keepImages);
				if (plan.warning) setErrorBanner(plan.warning);
				const requestId = crypto.randomUUID();
				ingestEvent({
					type: "bash_execution_start",
					id: requestId,
					command: plan.command,
					excludeFromContext: plan.excludeFromContext,
				});
				const result = await window.atomicGui.bash(plan.command, plan.excludeFromContext, requestId);
				ingestEvent({
					type: "bash_execution_end",
					id: requestId,
					output: result.data?.output,
					exitCode: result.data?.exitCode,
					cancelled: result.data?.cancelled,
					truncated: result.data?.truncated,
					fullOutputPath: result.data?.fullOutputPath,
				});
				if (!result.ok) setErrorBanner(result.error ?? "Bash failed");
				return;
			}

			if (!behavior) {
				const resumed = await window.atomicGui.runEngineCommand({ type: "resume_queued_messages" });
				if (!resumed.ok) {
					setAttached(plan.images);
					setComposerText(restoreFailedDraft(submittedMessage, useSessionStore.getState().composerText));
					setErrorBanner(resumed.error ?? "Could not resume queued messages");
					return;
				}
			}
			setAttached([]);
			const result = await window.atomicGui.prompt({
				message: plan.message,
				...(behavior ? { streamingBehavior: behavior } : {}),
				...(plan.images.length > 0 ? { images: plan.images } : {}),
			});
			if (!result.ok) {
				if (!result.requestAccepted) {
					setAttached(plan.images);
					setComposerText(restoreFailedDraft(submittedMessage, useSessionStore.getState().composerText));
				}
				setErrorBanner(result.error ?? "Prompt failed");
			}
		} finally {
			submitGate.current.end();
		}
	};

	const addPastedImages = useCallback(
		(files: File[]): void => {
			if (files.length === 0) return;
			const tracked: Promise<void> = readImageFiles(files, {
				readDataUrl: readFileAsDataUrl,
				onError: setErrorBanner,
			})
				.then((images) => {
					if (images.length > 0) setAttached((current) => [...current, ...images]);
				})
				.catch(() => undefined)
				.finally(() => {
					pendingImageReads.current.delete(tracked);
				});
			pendingImageReads.current.add(tracked);
		},
		[setAttached, setErrorBanner],
	);

	const dequeue = async (): Promise<void> => {
		if (!hasGuiApi()) return;
		const result = await window.atomicGui.runEngineCommand<{ steering: string[]; followUp: string[] }>({
			type: "clear_queue",
		});
		if (!result.ok) {
			setErrorBanner(result.error ?? "Could not restore queued messages");
			return;
		}
		const queued = [...(result.data?.steering ?? []), ...(result.data?.followUp ?? [])];
		setComposerText(restoreFailedDraft(queued.join("\n\n"), useSessionStore.getState().composerText));
	};

	const abort = async (restoreQueue = false): Promise<boolean> => {
		if (!hasGuiApi()) return false;
		const paused = await window.atomicGui.runEngineCommand({ type: "pause_queued_messages" });
		if (!paused.ok) {
			setErrorBanner(paused.error ?? "Could not pause queued messages");
			return false;
		}
		if (restoreQueue) await dequeue();
		const result = await window.atomicGui.abort();
		if (!result.ok) {
			setErrorBanner(result.error ?? "Abort failed");
			return false;
		}
		for (let attempt = 0; attempt < 100 && useSessionStore.getState().working; attempt += 1) {
			await new Promise((resolve) => window.setTimeout(resolve, 50));
		}
		if (useSessionStore.getState().working) {
			setErrorBanner("The current response has not settled yet.");
			return false;
		}
		return true;
	};

	const clear = (): void => {
		if (working || queue.length > 0) void abort(true);
		else setComposerText("");
	};

	const openExternalEditor = async (text: string): Promise<void> => {
		if (!hasGuiApi()) return;
		const result = await window.atomicGui.editExternally(text);
		if (result.ok) setComposerText(result.text);
		else setErrorBanner(result.error);
	};

	const respondDialog = async (response: ExtensionUiResponse): Promise<void> => {
		if (!hasGuiApi()) return;
		await window.atomicGui.respondExtensionUi(response);
		clearDialog(response.id);
	};

	const searchFiles = useCallback(
		async (query: string) => {
			if (!hasGuiApi()) return [];
			return await window.atomicGui.searchFiles(query, status.cwd);
		},
		[status.cwd],
	);

	const searchCommandCompletions = useCallback(async (commandName: string, argumentPrefix: string) => {
		if (!hasGuiApi()) return [];
		const result = await window.atomicGui.getCommandCompletions(commandName, argumentPrefix);
		return result.ok && result.data ? result.data : [];
	}, []);

	return (
		<div className="app-shell">
			{customHeader ? <ChromeFrame frame={customHeader} slot="header" modalOpen={modal !== "none"} /> : null}

			<header className="topbar">
				<div className="brand">
					<span className="brand-mark">∀ Atomic</span>
					<span className="brand-sub">GUI host · {themeName}</span>
				</div>
				<div className="status-chip">
					<span className={`status-dot ${status.state}`} />
					<span>{status.state}</span>
					{status.pid ? <span>pid {status.pid}</span> : null}
				</div>
				<div className="topbar-actions">
					<button type="button" className="btn" disabled={!ready} onClick={() => void openSessions()}>
						Sessions
					</button>
					<button type="button" className="btn" disabled={!ready} onClick={() => void openTree()}>
						Tree
					</button>
					<button type="button" className="btn" disabled={!ready} onClick={() => void openModels()}>
						Models
					</button>
					<button
						type="button"
						className="btn"
						disabled={!ready || working || compacting}
						onClick={() => {
							void (async () => {
								setCompacting(true);
								try {
									const result = await window.atomicGui.compact();
									if (!result.ok) setErrorBanner(result.error);
									else await refreshSessionView();
								} finally {
									setCompacting(false);
								}
							})();
						}}
					>
						{compacting ? "Compacting…" : "Compact"}
					</button>
					<button type="button" className="btn" disabled={!ready} onClick={() => void openAuth()}>
						Auth
					</button>
					<button type="button" className="btn" onClick={() => void openSettings()}>
						Settings
					</button>
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

			{!ready ? (
				<OnboardingPanel
					ready={ready}
					onStart={() => void startEngine()}
					onTrust={() => void maybePromptTrust()}
					onAuth={() => void openAuth()}
					onModels={() => void openModels()}
				/>
			) : null}
			{errorBanner ? (
				<div className="error-banner" role="alert">
					{errorBanner}
				</div>
			) : null}

			<Transcript
				entries={entries}
				leafId={treeLeafId}
				hideThinking={hideThinking}
				hiddenThinkingLabel={hiddenThinkingLabel}
				onToggle={toggleEntryExpanded}
			/>

			{showRawLog ? <pre className="raw-log">{rawLines.join("\n")}</pre> : null}

			{customEditor ? (
				<ChromeFrame
					frame={customEditor}
					slot="editor"
					modalOpen={modal !== "none"}
					onInput={(data) =>
						void window.atomicGui.sendEngineCommand({
							type: "engine_custom_input",
							componentId: customEditor.componentId,
							data,
						})
					}
				/>
			) : (
				<Composer
					value={composerText}
					disabled={!ready}
					working={working && workingVisible}
					queue={queue}
					commands={commands}
					widgets={widgets}
					images={attachedImages}
					keybindings={keybindings}
					extensionShortcuts={extensionShortcuts}
					focusRequest={composerFocusRequest}
					onChange={setComposerText}
					onSubmit={(behavior, message) => void submit(behavior, message)}
					onAbort={(restoreQueue) => void abort(restoreQueue)}
					onClear={clear}
					onDequeue={() => void dequeue()}
					onExternalEditor={(text) => void openExternalEditor(text)}
					onModelSelect={() => void openModels()}
					onModelCycle={(direction) =>
						void window.atomicGui.cycleModel(direction).then((result) => {
							if (!result.ok) setErrorBanner(result.error);
							else void refreshMetadata();
						})
					}
					onThinkingCycle={() =>
						void window.atomicGui.cycleThinking().then((result) => {
							if (!result.ok) setErrorBanner(result.error);
							else void refreshMetadata();
						})
					}
					onThinkingToggle={toggleThinking}
					onToolsExpand={() => {
						const lastTool = [...entries].reverse().find((entry) => entry.kind === "tool");
						if (lastTool) toggleEntryExpanded(lastTool.id);
					}}
					onExtensionShortcut={(key) =>
						void window.atomicGui.invokeShortcut(key).then((result) => {
							if (!result.ok) setErrorBanner(result.error ?? `Shortcut ${key} failed`);
						})
					}
					onHistoryUp={() => {
						historyUp();
					}}
					onHistoryDown={() => {
						historyDown();
					}}
					onSearchFiles={searchFiles}
					onSearchCommandCompletions={searchCommandCompletions}
					onPasteImages={addPastedImages}
					onRemoveImage={(index) =>
						setAttached((images) => images.filter((_image, itemIndex) => itemIndex !== index))
					}
				/>
			)}

			{customFooter ? (
				<ChromeFrame frame={customFooter} slot="footer" modalOpen={modal !== "none"} />
			) : (
				<Footer
					cwd={status.cwd ?? "."}
					engineLabel={
						status.protocolVersion
							? `engine v${status.protocolVersion}`
							: status.cliPath
								? "engine unresolved"
								: "engine idle"
					}
					modelLabel={status.modelLabel}
					thinkingLevel={status.thinkingLevel}
					sessionName={status.sessionName}
					usageLabel={usageLabel}
					statusSegments={statusSegments}
					working={working}
					workingLabel={workingLabel}
					workingIndicatorFrames={workingIndicatorFrames}
					workingIndicatorIntervalMs={workingIndicatorIntervalMs}
				/>
			)}

			<ToastStack toasts={toasts} onDismiss={dismissToast} />

			<FrameRenderHost
				frames={frames}
				onRender={(componentId, requestId, width, rows) => {
					void window.atomicGui.sendEngineCommand({
						type: "engine_custom_render",
						componentId,
						requestId,
						width,
						rows,
					});
				}}
			/>
			<ToolRenderHost
				entries={entries}
				onRender={(command) => {
					void window.atomicGui.sendEngineCommand(command);
				}}
				onDispose={(componentId) => {
					void window.atomicGui.sendEngineCommand({ type: "engine_render_dispose", componentId });
				}}
			/>
			<FrameOverlay
				frames={frames}
				modalOpen={modal !== "none"}
				onDismiss={(componentId) => {
					dismissFrame(componentId);
					void window.atomicGui.sendEngineCommand({ type: "engine_custom_dispose", componentId });
				}}
				onInput={(componentId, data) => {
					void window.atomicGui.sendEngineCommand({ type: "engine_custom_input", componentId, data });
				}}
				onRender={(componentId, requestId, width, rows) => {
					void window.atomicGui.sendEngineCommand({
						type: "engine_custom_render",
						componentId,
						requestId,
						width,
						rows,
					});
				}}
			/>

			{modal === "sessions" ? (
				<SessionPicker
					sessions={sessions}
					forkMessages={forkMessages}
					currentPath={status.sessionFile}
					onClose={() => setModal("none")}
					onRefresh={(options) => {
						void window.atomicGui.listSessions({ cwd: status.cwd, all: options.all }).then(setSessions);
					}}
					onNew={() => {
						void window.atomicGui.newSession().then((result) => {
							if (!result.ok) setErrorBanner(result.error);
							else if (!result.data?.cancelled) {
								resetTranscript();
								void refreshTranscript();
								setModal("none");
								void refreshMetadata();
							}
						});
					}}
					onFork={(entryId) => {
						void window.atomicGui.forkSession(entryId).then((result) => {
							if (!result.ok) setErrorBanner(result.error);
							else if (!result.data?.cancelled) {
								if (result.data?.text) setComposerText(result.data.text);
								resetTranscript();
								void refreshTranscript();
								setModal("none");
								void refreshMetadata();
							}
						});
					}}
					onImport={(inputPath) => {
						if (!window.confirm(`Import and replace the active session with ${inputPath}?`)) return;
						void window.atomicGui.importSession(inputPath).then((result) => {
							if (!result.ok) setErrorBanner(result.error);
							else if (!result.data?.cancelled) {
								resetTranscript();
								void refreshSessionView();
								setModal("none");
								void refreshMetadata();
							}
						});
					}}
					onClone={() => {
						void window.atomicGui.cloneSession().then((result) => {
							if (!result.ok) setErrorBanner(result.error);
							else if (!result.data?.cancelled) {
								resetTranscript();
								void refreshTranscript();
								setModal("none");
								void refreshMetadata();
							}
						});
					}}
					onExport={() => {
						void window.atomicGui.exportHtml().then((result) => {
							if (!result.ok) setErrorBanner(result.error);
							else {
								useSessionStore.getState().ingestExtensionUi({
									id: `export-${Date.now()}`,
									method: "notify",
									message: `Exported HTML → ${result.data?.path ?? "(unknown path)"}`,
									notifyType: "info",
								});
							}
						});
					}}
					onRename={(session, name) => {
						void window.atomicGui.renameSession(session.path, name).then(async (result) => {
							if (!result.ok) setErrorBanner(result.error);
							else {
								setSessions(await window.atomicGui.listSessions({ cwd: status.cwd }));
								void refreshMetadata();
							}
						});
					}}
					onDelete={(session) => {
						if (!window.confirm(`Delete session ${session.name || session.id}?`)) return;
						void window.atomicGui.deleteSession(session.path).then(async (result) => {
							if (!result.ok) setErrorBanner(result.error);
							else {
								if (session.path === status.sessionFile) resetTranscript();
								setSessions(await window.atomicGui.listSessions({ cwd: status.cwd }));
								void refreshMetadata();
							}
						});
					}}
					onSelect={(session) => {
						void (async () => {
							if (!ready) {
								await startEngine(session.path);
								setModal("none");
								return;
							}
							const result = await window.atomicGui.switchSession(session.path);
							if (!result.ok) setErrorBanner(result.error);
							else if (!result.data?.cancelled) {
								resetTranscript();
								void refreshTranscript();
								setModal("none");
								void refreshMetadata();
							}
						})();
					}}
				/>
			) : null}

			{modal === "models" ? (
				<ModelPicker
					models={models}
					currentLabel={status.modelLabel}
					onClose={() => setModal("none")}
					onSelect={(model) => {
						void window.atomicGui.setModel(model.provider, model.id).then((result) => {
							if (!result.ok) setErrorBanner(result.error);
							else {
								setModal("none");
								void refreshMetadata();
							}
						});
					}}
				/>
			) : null}

			{modal === "tree" ? (
				<TreeNavigator
					nodes={treeNodes}
					leafId={treeLeafId}
					onClose={() => setModal("none")}
					onNavigate={(entryId) => {
						void (async () => {
							if (useSessionStore.getState().working && !(await abort())) return;
							const result = await window.atomicGui.navigateTree(entryId);
							if (!result.ok) setErrorBanner(result.error);
							else if (!result.data?.cancelled) {
								const editorText = result.data?.editorText;
								if (editorText !== undefined && !useSessionStore.getState().composerText.trim())
									setComposerText(editorText);
								resetTranscript();
								await refreshSessionView();
								setModal("none");
								focusComposer();
								void refreshMetadata();
							}
						})();
					}}
					onLabel={(entryId, label) => {
						void window.atomicGui.setTreeLabel(entryId, label).then(async (result) => {
							if (!result.ok) setErrorBanner(result.error);
							else await refreshSessionView();
						});
					}}
				/>
			) : null}

			{modal === "settings" ? (
				<SettingsPanel
					themes={themes}
					currentTheme={themeName}
					settings={guiSettings}
					thinkingLevels={thinkingLevels}
					currentThinkingLevel={status.thinkingLevel}
					onClose={() => setModal("none")}
					onOpenAuth={() => void openAuth()}
					onSelectTheme={(name) => {
						void window.atomicGui.setTheme(name).then((theme) => {
							applyThemeCss(theme.cssVariables);
							setThemeName(theme.name);
						});
					}}
					onSetThinkingLevel={(level) => {
						void window.atomicGui.setThinkingLevel(level).then((result) => {
							if (!result.ok) setErrorBanner(result.error);
							else void refreshMetadata();
						});
					}}
					onSetSteeringMode={(mode) => {
						void window.atomicGui.setSteeringMode(mode).then((result) => {
							if (!result.ok) setErrorBanner(result.error);
						});
					}}
					onSetFollowUpMode={(mode) => {
						void window.atomicGui.setFollowUpMode(mode).then((result) => {
							if (!result.ok) setErrorBanner(result.error);
						});
					}}
					onSetAutoCompaction={(enabled) => {
						void window.atomicGui.setAutoCompaction(enabled).then((result) => {
							if (!result.ok) setErrorBanner(result.error);
						});
					}}
					onSetAutoRetry={(enabled) => {
						void window.atomicGui.setAutoRetry(enabled).then((result) => {
							if (!result.ok) setErrorBanner(result.error);
						});
					}}
				/>
			) : null}

			{modal === "auth" ? (
				<AuthPanel
					catalog={authCatalog}
					busyProvider={authBusyProvider}
					onClose={() => setModal("none")}
					onRefresh={() => {
						void window.atomicGui.getAuthCatalog().then((result) => {
							if (result.ok && result.data) setAuthCatalog(result.data);
						});
					}}
					onLogin={(provider, authType) => {
						setAuthBusyProvider(provider);
						void window.atomicGui.loginProvider(provider, authType).then((result) => {
							setAuthBusyProvider(undefined);
							if (!result.ok) setErrorBanner(result.error);
							else {
								useSessionStore.getState().ingestExtensionUi({
									id: `login-${Date.now()}`,
									method: "notify",
									message: `Logged in to ${provider}`,
									notifyType: "info",
								});
								void window.atomicGui.getAuthCatalog().then((catalog) => {
									if (catalog.ok && catalog.data) {
										setAuthCatalog(catalog.data);
										setModels(catalog.data.models);
									}
								});
							}
						});
					}}
					onLogout={(provider) => {
						void window.atomicGui.logoutProvider(provider).then((result) => {
							if (!result.ok) setErrorBanner(result.error);
							else void openAuth();
						});
					}}
					onCancel={(provider) => {
						void window.atomicGui.cancelLoginProvider(provider).then(() => setAuthBusyProvider(undefined));
					}}
				/>
			) : null}

			{modal === "trust" && trustStatus ? (
				<TrustDialog
					status={trustStatus}
					options={trustOptions}
					onChoose={(optionId) => {
						void window.atomicGui.applyTrust(optionId, status.cwd).then((next) => {
							setTrust(next, trustOptions);
							setModal("none");
							const sessionPath = pendingSessionPath.current;
							pendingSessionPath.current = undefined;
							void startEngine(sessionPath);
						});
					}}
				/>
			) : null}

			{modal === "inputForm" && inputForm ? (
				<InputFormModal
					request={inputForm}
					onCancel={() => {
						void window.atomicGui.cancelInputForm(inputForm.componentId);
						clearInputForm();
					}}
					onSubmit={(values) => {
						void window.atomicGui.submitInputForm(inputForm.componentId, values);
						clearInputForm();
					}}
				/>
			) : null}

			{modal === "hostSessionPicker" && hostSessionPicker ? (
				<HostSessionPickerModal
					sessions={hostSessionPicker.sessions}
					showRenameHint={hostSessionPicker.showRenameHint}
					errorMessage={hostSessionPicker.errorMessage}
					onClose={() => {
						void window.atomicGui.sendEngineCommand({
							type: "engine_session_picker_cancel",
							componentId: hostSessionPicker.componentId,
						});
						clearHostSessionPicker();
					}}
					onSelect={(path) => {
						void window.atomicGui.sendEngineCommand({
							type: "engine_session_picker_select",
							componentId: hostSessionPicker.componentId,
							path,
						});
						clearHostSessionPicker();
					}}
					onDelete={(path) => {
						void window.atomicGui.sendEngineCommand({
							type: "engine_session_picker_delete",
							componentId: hostSessionPicker.componentId,
							path,
						});
					}}
				/>
			) : null}

			{modal === "dialog" && activeDialog ? (
				<DialogModal
					key={activeDialog.id}
					request={activeDialog}
					onRespond={(response) => void respondDialog(response)}
					onDismiss={() => clearDialog(activeDialog.id)}
				/>
			) : null}
		</div>
	);
}
