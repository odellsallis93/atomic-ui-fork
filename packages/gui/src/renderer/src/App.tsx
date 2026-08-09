import { useCallback, useEffect, useRef } from "react";
import type { ExtensionUiResponse } from "../../shared/ipc";
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
import { SessionPicker } from "./components/SessionPicker";
import { SettingsPanel } from "./components/SettingsPanel";
import { ToastStack } from "./components/ToastStack";
import { Transcript } from "./components/Transcript";
import { TreeNavigator } from "./components/TreeNavigator";
import { TrustDialog } from "./components/TrustDialog";
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
	const rawLines = useSessionStore((s) => s.rawLines);
	const showRawLog = useSessionStore((s) => s.showRawLog);
	const hideThinking = useSessionStore((s) => s.hideThinking);
	const queue = useSessionStore((s) => s.queue);
	const composerText = useSessionStore((s) => s.composerText);
	const errorBanner = useSessionStore((s) => s.errorBanner);
	const usageLabel = useSessionStore((s) => s.usageLabel);
	const commands = useSessionStore((s) => s.commands);
	const extensionShortcuts = useSessionStore((s) => s.extensionShortcuts);
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
		const result = await window.atomicGui.getEntries();
		if (!result.ok || !result.data) {
			setErrorBanner(result.error ?? "Failed to load session transcript");
			return;
		}
		hydrateTranscript(result.data.entries);
	}, [hydrateTranscript, setErrorBanner]);

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
		const listed = await window.atomicGui.listSessions({ cwd: status.cwd });
		setSessions(listed);
		setModal("sessions");
	}, [setModal, setSessions, status.cwd]);

	const openTree = useCallback(async (): Promise<void> => {
		if (!hasGuiApi()) return;
		const result = await window.atomicGui.getTree();
		if (!result.ok || !result.data) {
			setErrorBanner(result.error ?? "Failed to load session tree");
			return;
		}
		setTree(result.data.nodes, result.data.leafId);
		setModal("tree");
	}, [setErrorBanner, setModal, setTree]);

	const openSettings = useCallback(async (): Promise<void> => {
		if (!hasGuiApi()) return;
		setThemes(await window.atomicGui.listThemes());
		const settings = await window.atomicGui.getSettings();
		setThemeName(settings.theme);
		setModal("settings");
	}, [setModal, setThemeName, setThemes]);

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
			if (!hasGuiApi() || status.state !== "ready") return;
			if (event.ctrlKey && event.key.toLowerCase() === "l") {
				event.preventDefault();
				void openModels();
			} else if (event.ctrlKey && event.key.toLowerCase() === "p") {
				event.preventDefault();
				void window.atomicGui.cycleModel("forward").then((result) => {
					if (!result.ok) setErrorBanner(result.error);
					else void refreshMetadata();
				});
			} else if (event.shiftKey && event.key === "Tab") {
				event.preventDefault();
				void window.atomicGui.cycleThinking().then((result) => {
					if (!result.ok) setErrorBanner(result.error);
					else void refreshMetadata();
				});
			} else if (event.ctrlKey && event.key.toLowerCase() === "t") {
				event.preventDefault();
				toggleThinking();
			} else if (event.ctrlKey && event.key.toLowerCase() === "o") {
				event.preventDefault();
				const lastTool = [...entries].reverse().find((entry) => entry.kind === "tool");
				if (lastTool) toggleEntryExpanded(lastTool.id);
			} else if (event.ctrlKey && event.key.toLowerCase() === ",") {
				event.preventDefault();
				void openSettings();
			} else if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "a") {
				event.preventDefault();
				void openAuth();
			} else {
				const key = shortcutKeyId(event);
				const shortcut = key
					? extensionShortcuts.find(
							(candidate) => normalizedShortcutKey(candidate.key) === normalizedShortcutKey(key),
						)
					: undefined;
				if (shortcut) {
					event.preventDefault();
					void window.atomicGui.invokeShortcut(shortcut.key).then((result) => {
						if (!result.ok) setErrorBanner(result.error ?? `Shortcut ${shortcut.key} failed`);
					});
				}
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [
		entries,
		extensionShortcuts,
		openAuth,
		openModels,
		openSettings,
		refreshMetadata,
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

	const submit = async (behavior?: "steer" | "followUp"): Promise<void> => {
		const message = composerText.trim();
		if (!message || !hasGuiApi()) return;
		pushPromptHistory(message);
		setComposerText("");

		if (message.startsWith("!!")) {
			const result = await window.atomicGui.bash(message.slice(2).trim(), true);
			if (!result.ok) setErrorBanner(result.error ?? "Bash failed");
			return;
		}
		if (message.startsWith("!")) {
			const result = await window.atomicGui.bash(message.slice(1).trim(), false);
			if (!result.ok) setErrorBanner(result.error ?? "Bash failed");
			return;
		}

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

	const respondDialog = async (response: ExtensionUiResponse): Promise<void> => {
		if (!hasGuiApi()) return;
		await window.atomicGui.respondExtensionUi(response);
		clearDialog();
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
			{customHeader ? <ChromeFrame frame={customHeader} slot="header" /> : null}
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
						disabled={!ready}
						onClick={() => {
							void window.atomicGui.compact().then((result) => {
								if (!result.ok) setErrorBanner(result.error);
								else void refreshMetadata();
							});
						}}
					>
						Compact
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

			{errorBanner ? (
				<div className="error-banner" role="alert">
					{errorBanner}
				</div>
			) : null}

			<Transcript entries={entries} hideThinking={hideThinking} onToggle={toggleEntryExpanded} />

			{showRawLog ? <pre className="raw-log">{rawLines.join("\n")}</pre> : null}

			{customEditor ? (
				<ChromeFrame
					frame={customEditor}
					slot="editor"
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
					onChange={setComposerText}
					onSubmit={(behavior) => void submit(behavior)}
					onAbort={() => void abort()}
					onHistoryUp={() => {
						historyUp();
					}}
					onHistoryDown={() => {
						historyDown();
					}}
					onSearchFiles={searchFiles}
					onSearchCommandCompletions={searchCommandCompletions}
				/>
			)}

			{customFooter ? (
				<ChromeFrame frame={customFooter} slot="footer" />
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
			<FrameOverlay
				frames={frames}
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
					currentPath={status.sessionFile}
					onClose={() => setModal("none")}
					onRefresh={(options) => {
						void window.atomicGui.listSessions({ cwd: status.cwd, all: options.all }).then(setSessions);
					}}
					onNew={() => {
						void window.atomicGui.newSession().then((result) => {
							if (!result.ok) setErrorBanner(result.error);
							else {
								resetTranscript();
								void refreshTranscript();
								setModal("none");
								void refreshMetadata();
							}
						});
					}}
					onClone={() => {
						void window.atomicGui.cloneSession().then((result) => {
							if (!result.ok) setErrorBanner(result.error);
							else {
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
							else {
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
						void window.atomicGui.navigateTree(entryId).then((result) => {
							if (!result.ok) setErrorBanner(result.error);
							else {
								if (result.data?.editorText) setComposerText(result.data.editorText);
								resetTranscript();
								void refreshTranscript();
								setModal("none");
								void refreshMetadata();
							}
						});
					}}
				/>
			) : null}

			{modal === "settings" ? (
				<SettingsPanel
					themes={themes}
					currentTheme={themeName}
					onClose={() => setModal("none")}
					onOpenAuth={() => void openAuth()}
					onSelectTheme={(name) => {
						void window.atomicGui.setTheme(name).then((theme) => {
							applyThemeCss(theme.cssVariables);
							setThemeName(theme.name);
							setModal("none");
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
					request={activeDialog}
					onRespond={(response) => void respondDialog(response)}
					onDismiss={() => clearDialog()}
				/>
			) : null}
		</div>
	);
}
