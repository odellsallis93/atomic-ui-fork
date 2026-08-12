export function OnboardingPanel(props: {
	ready: boolean;
	onStart: () => void;
	onTrust: () => void;
	onAuth: () => void;
	onModels: () => void;
}) {
	return (
		<section className="onboarding-panel" aria-label="First run setup">
			<div>
				<h2>Start with engine-owned setup</h2>
				<p className="settings-hint">
					Trust, provider auth, and model selection are resolved by the engine. The GUI never displays saved
					credentials or writes secrets.
				</p>
			</div>
			<div className="onboarding-actions">
				<button type="button" className="btn btn-primary" onClick={props.onStart} disabled={props.ready}>
					1. Review trust and start
				</button>
				<button type="button" className="btn" onClick={props.onTrust}>
					Review trust
				</button>
				<button type="button" className="btn" onClick={props.onAuth} disabled={!props.ready}>
					2. Provider auth (after start)
				</button>
				<button type="button" className="btn" onClick={props.onModels} disabled={!props.ready}>
					3. Choose model
				</button>
			</div>
		</section>
	);
}
