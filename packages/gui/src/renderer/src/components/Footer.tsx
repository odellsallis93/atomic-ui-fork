import { WorkingIndicator } from "./WorkingIndicator";

export function Footer(props: {
	cwd: string;
	engineLabel: string;
	modelLabel?: string;
	thinkingLevel?: string;
	sessionName?: string;
	usageLabel: string;
	statusSegments: Record<string, string>;
	working: boolean;
	workingVisible: boolean;
	workingLabel: string;
	workingIndicatorFrames?: string[];
	workingIndicatorIntervalMs?: number;
}) {
	const segments = Object.entries(props.statusSegments);
	return (
		<footer className="footer">
			<div className="footer-left">
				<span>{props.engineLabel}</span>
				{props.modelLabel ? <span>{props.modelLabel}</span> : null}
				{props.thinkingLevel ? <span>think:{props.thinkingLevel}</span> : null}
				{props.sessionName ? <span>{props.sessionName}</span> : null}
				<span title={props.cwd}>{props.cwd}</span>
				{segments.map(([key, value]) => (
					<span key={key}>
						{key}:{value}
					</span>
				))}
			</div>
			<div className="footer-right">
				{props.working && props.workingVisible ? (
					<WorkingIndicator
						label={props.workingLabel}
						frames={props.workingIndicatorFrames}
						intervalMs={props.workingIndicatorIntervalMs}
					/>
				) : null}
				<span>{props.usageLabel}</span>
			</div>
		</footer>
	);
}
