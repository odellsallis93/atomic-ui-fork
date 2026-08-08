import { widgetLinesToHtml } from "../helpers/ansi-widgets";
import type { WidgetItem } from "../store/session-store";

export function Widgets({ widgets, placement }: { widgets: WidgetItem[]; placement: "aboveEditor" | "belowEditor" }) {
	const items = widgets.filter((widget) => widget.placement === placement);
	if (items.length === 0) return null;
	return (
		<div className="widget-stack">
			{items.map((widget) => (
				// biome-ignore lint/security/noDangerouslySetInnerHtml: ANSI→HTML from engine widgets; escaped in ansi.ts
				<pre
					key={widget.key}
					className="widget-block"
					dangerouslySetInnerHTML={{ __html: widgetLinesToHtml(widget.lines) }}
				/>
			))}
		</div>
	);
}
