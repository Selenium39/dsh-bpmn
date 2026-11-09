/**
 * Sidebar footer entry that opens the BPMN workbench.
 *
 * Registered into `sidebar.footer.action` by the client apply. Props are the
 * store share the slot renderer injects (`useStore` + baked `actions`).
 * TODO: switch the hardcoded zh copy to the locale service (handoff-5 tail).
 *
 * @module dsh-bpmn/client/BpmnToggle
 */

import type { PropsStore } from "@deepseek-ai/dsh-client-ui-slots";
import type { BpmnStoreHandle } from "./store.js";

export type BpmnToggleProps = PropsStore<BpmnStoreHandle>;

export function BpmnToggle({ actions }: BpmnToggleProps) {
	return (
		<button
			type="button"
			title="BPMN 建模器"
			onClick={() => actions.openPanel()}
		>
			<svg
				aria-hidden="true"
				width="16"
				height="16"
				viewBox="0 0 16 16"
				fill="currentColor"
			>
				{/* Simplified flow glyph: two nodes and a connecting path. */}
				<rect x="1" y="2" width="5" height="3.2" rx="0.8" />
				<rect x="10" y="10.8" width="5" height="3.2" rx="0.8" />
				<path d="M6 3.6h2.5a2 2 0 0 1 2 2v6.4h-1.6V5.6a.4.4 0 0 0-.4-.4H6z" />
			</svg>
		</button>
	);
}
