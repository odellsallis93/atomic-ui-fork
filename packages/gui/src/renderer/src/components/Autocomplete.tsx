export interface AutocompleteItem {
	id: string;
	label: string;
	insertText?: string;
	description?: string;
}

export function Autocomplete(props: {
	items: AutocompleteItem[];
	activeIndex: number;
	onPick: (item: AutocompleteItem) => void;
}) {
	if (props.items.length === 0) return null;
	return (
		<ul className="autocomplete">
			{props.items.map((item, index) => (
				<li key={item.id}>
					<button
						type="button"
						className={`autocomplete-item${index === props.activeIndex ? " active" : ""}`}
						onClick={() => props.onPick(item)}
					>
						<span className="autocomplete-label">{item.label}</span>
						{item.description ? <span className="autocomplete-desc">{item.description}</span> : null}
					</button>
				</li>
			))}
		</ul>
	);
}
