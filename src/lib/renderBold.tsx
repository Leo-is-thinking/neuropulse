import type { ReactNode } from "react";

/** Turns `**word**` into <strong>. */
export function renderBold(text: string): ReactNode[] {
	return text
		.split(/\*\*(.+?)\*\*/g)
		.map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));
}
