/**
 * React wrapper around the bpmn-js Modeler with the properties panel.
 *
 * Owns the modeler lifecycle: create once per mount, import XML whenever the
 * `xml` prop switches to a different baseline, expose `saveXML` to the parent
 * through the ready callback, and report canvas edits as dirty flags. The
 * bpmn-js-properties-panel mounts into its own pane next to the canvas
 * (handoff-6); its stylesheet ships via `virtual:bpmn-vendor-css`.
 *
 * @module dsh-bpmn/client/BpmnModeler
 */

import Modeler from "bpmn-js/lib/Modeler";
import {
	BpmnPropertiesPanelModule,
	BpmnPropertiesProviderModule,
} from "bpmn-js-properties-panel";
import { useEffect, useLayoutEffect, useRef } from "react";
import classes from "./styles/workbench.module.css";

/** Imperative surface the workbench keeps a ref to. */
export interface BpmnModelerApi {
	/** Serialize the current canvas to formatted BPMN 2.0 XML. */
	saveXML(): Promise<string>;
}

export interface BpmnModelerProps {
	/** Baseline XML for the active diagram; `null` renders an empty canvas. */
	xml: string | null;
	/** Fired with `true` when the canvas diverges from the baseline. */
	onDirtyChange(dirty: boolean): void;
	/** Fired once the modeler is attached; parents store the api ref. */
	onReady(api: BpmnModelerApi): void;
	/** Fired on import failures with a user-presentable message. */
	onError(message: string | null): void;
}

/** Minimal structural type for the canvas zoom call (see handoff notes). */
interface CanvasLike {
	zoom(newZoom: unknown, center?: unknown): unknown;
}

export function BpmnModeler({
	xml,
	onDirtyChange,
	onReady,
	onError,
}: BpmnModelerProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const propertiesRef = useRef<HTMLDivElement | null>(null);
	const modelerRef = useRef<Modeler | null>(null);

	// Keep latest callbacks without re-running effects on parent re-renders.
	const onDirtyChangeRef = useRef(onDirtyChange);
	const onReadyRef = useRef(onReady);
	const onErrorRef = useRef(onError);
	onDirtyChangeRef.current = onDirtyChange;
	onReadyRef.current = onReady;
	onErrorRef.current = onError;

	// Create the modeler exactly once per mount. Both the canvas and the
	// properties panel containers must exist by then — layout effects run
	// after DOM commit, so the refs are set.
	useLayoutEffect(() => {
		if (containerRef.current === null || propertiesRef.current === null) return;
		const modeler = new Modeler({
			container: containerRef.current,
			additionalModules: [
				BpmnPropertiesPanelModule,
				BpmnPropertiesProviderModule,
			],
			propertiesPanel: { parent: propertiesRef.current },
		});
		modelerRef.current = modeler;

		const handleChanged = () => onDirtyChangeRef.current(true);
		modeler.on("commandStack.changed", handleChanged);

		onReadyRef.current({
			saveXML: async () => {
				const result = await modeler.saveXML({ format: true });
				return result.xml ?? "";
			},
		});

		return () => {
			modeler.off("commandStack.changed", handleChanged);
			modeler.destroy();
			modelerRef.current = null;
		};
	}, []);

	// Import the baseline whenever it changes.
	useEffect(() => {
		const modeler = modelerRef.current;
		if (modeler === null) return;
		if (xml === null || xml.length === 0) {
			onDirtyChangeRef.current(false);
			return;
		}
		let cancelled = false;
		modeler
			.importXML(xml)
			.then(() => {
				if (cancelled) return;
				(modeler.get("canvas") as CanvasLike).zoom("fit-viewport", "auto");
				onDirtyChangeRef.current(false);
				onErrorRef.current(null);
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				onErrorRef.current(
					error instanceof Error ? error.message : String(error),
				);
			});
		return () => {
			cancelled = true;
		};
	}, [xml]);

	return (
		<div className={classes.modelerWrap} data-testid="dsh-bpmn-modeler">
			<div className={classes.modelerPane} ref={containerRef} />
			<div
				className={classes.propertiesPane}
				ref={propertiesRef}
				data-testid="dsh-bpmn-properties"
			/>
		</div>
	);
}
