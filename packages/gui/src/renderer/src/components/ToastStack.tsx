import type { ToastItem } from "../store/session-store";

export function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
	if (toasts.length === 0) return null;
	return (
		<div className="toast-stack">
			{toasts.map((toast) => (
				<div key={toast.id} className={`toast toast-${toast.notifyType}`}>
					<span>{toast.message}</span>
					<button type="button" className="btn" onClick={() => onDismiss(toast.id)}>
						Dismiss
					</button>
				</div>
			))}
		</div>
	);
}
