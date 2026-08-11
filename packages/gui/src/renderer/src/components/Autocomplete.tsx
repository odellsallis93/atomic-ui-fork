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
		<div id="composer-autocomplete" className="autocomplete" role="listbox" aria-label="Completions">
			{props.items.map((item, index) => (
				<div
					key={item.id}
					id={`composer-autocomplete-option-${index}`}
					role="option"
					tabIndex={-1}
					aria-selected={index === props.activeIndex}
				>
					<button
						type="button"
						className={`autocomplete-item${index === props.activeIndex ? " active" : ""}`}
						tabIndex={-1}
						onClick={() => props.onPick(item)}
					>
						<span className="autocomplete-label">{item.label}</span>
						{item.description ? <span className="autocomplete-desc">{item.description}</span> : null}
					</button>
				</div>
			))}
		</div>
	);
}
