import { useState } from "react";
import type { AuthCatalog } from "../../../shared/ipc";
import { useModalFocus } from "../helpers/modal-focus";

export function AuthPanel(props: {
	catalog: AuthCatalog | null;
	busyProvider?: string;
	onClose: () => void;
	onLogin: (provider: string, authType: "api_key" | "oauth") => void;
	onLogout: (provider: string) => void;
	onCancel: (provider: string) => void;
	onRefresh: () => void;
}) {
	const [filter, setFilter] = useState("");
	const dialogRef = useModalFocus<HTMLDivElement>(undefined, props.onClose);
	const catalog = props.catalog;
	const providers = (catalog?.providers ?? []).filter((provider) =>
		provider.toLowerCase().includes(filter.trim().toLowerCase()),
	);
	const oauthIds = new Set((catalog?.oauthProviders ?? []).map((provider) => provider.id));
	const apiKeyIds = new Set((catalog?.apiKeyProviders ?? []).map((provider) => provider.id));
	const logoutIds = new Set(catalog?.logoutProviders ?? []);

	return (
		<div className="modal-backdrop">
			<div ref={dialogRef} className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="auth-title">
				<div className="modal-header">
					<h2 id="auth-title">Provider auth</h2>
					<button type="button" className="btn" onClick={props.onClose}>
						Close
					</button>
				</div>
				<input
					className="modal-input"
					aria-label="Filter providers"
					placeholder="Filter providers…"
					value={filter}
					onChange={(e) => setFilter(e.target.value)}
				/>
				<ul className="modal-list">
					{providers.map((provider) => {
						const oauth = catalog?.oauthProviders.find((item) => item.id === provider);
						const busy = props.busyProvider === provider;
						return (
							<li key={provider} className="auth-row">
								<div>
									<div className="session-name">{oauth?.name ?? provider}</div>
									<div className="session-meta">
										{provider}
										{oauthIds.has(provider) && apiKeyIds.has(provider)
											? " · OAuth + API key"
											: oauthIds.has(provider)
												? " · OAuth"
												: " · API key"}
										{oauth?.loginLabel ? ` · ${oauth.loginLabel}` : ""}
									</div>
								</div>
								<div className="session-row-actions auth-actions">
									{oauthIds.has(provider) ? (
										<button
											type="button"
											className="btn btn-primary"
											disabled={busy}
											onClick={() => props.onLogin(provider, "oauth")}
										>
											{busy ? "…" : "OAuth login"}
										</button>
									) : null}
									{apiKeyIds.has(provider) ? (
										<button
											type="button"
											className="btn"
											disabled={busy}
											onClick={() => props.onLogin(provider, "api_key")}
										>
											API key
										</button>
									) : null}
									{logoutIds.has(provider) ? (
										<button
											type="button"
											className="btn"
											disabled={busy}
											onClick={() => props.onLogout(provider)}
										>
											Logout
										</button>
									) : null}
									{busy ? (
										<button type="button" className="btn btn-danger" onClick={() => props.onCancel(provider)}>
											Cancel
										</button>
									) : null}
								</div>
							</li>
						);
					})}
					{providers.length === 0 ? <li className="modal-empty">No providers available</li> : null}
				</ul>
				<div className="modal-actions">
					<button type="button" className="btn" onClick={props.onRefresh}>
						Refresh catalog
					</button>
				</div>
			</div>
		</div>
	);
}
