/** Rejects results from refreshes that started before the latest refresh. */
export class RefreshGeneration {
	private generation = 0;

	begin(): number {
		return ++this.generation;
	}

	isCurrent(generation: number): boolean {
		return generation === this.generation;
	}
}
