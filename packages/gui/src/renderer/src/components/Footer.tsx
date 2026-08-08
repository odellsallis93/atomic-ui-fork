import { WorkingIndicator } from "./WorkingIndicator";

export function Footer(props: {
	cwd: string;
	engineLabel: string;
	usageLabel: string;
	working: boolean;
	workingLabel: string;
}) {
	return (
		<footer className="footer">
			<div className="footer-left">
				<span>{props.engineLabel}</span>
				<span title={props.cwd}>{props.cwd}</span>
			</div>
			<div className="footer-right">
				{props.working ? <WorkingIndicator label={props.workingLabel} /> : null}
				<span>{props.usageLabel}</span>
			</div>
		</footer>
	);
}
