/**
 * React wrapper around the bpmn-js NavigatedViewer (read-only + zoom/pan).
 *
 * Side-preview counterpart to BpmnModeler: create once per mount, import the
 * baseline XML whenever it changes, fit to viewport. No editing surface, no
 * dirty tracking — the preview always renders the file as saved.
 *
 * @module dsh-bpmn/client/BpmnViewer
 */

import NavigatedViewer from "bpmn-js/lib/NavigatedViewer";
import { useEffect, useLayoutEffect, useRef } from "react";

/** Minimal structural type for the canvas zoom call (see handoff notes). */
interface CanvasLike {
	zoom(newZoom: unknown, center?: unknown): unknown;
}

export interface BpmnViewerProps {
	/** Diagram XML to render; `null` renders nothing. */
	xml: string | null;
	/** Fired on import failures with a user-presentable message. */
	onError(message: string | null): void;
}

export function BpmnViewer({ xml, onError }: BpmnViewerProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const viewerRef = useRef<NavigatedViewer | null>(null);

	// Keep the latest callback without re-running effects on parent re-renders.
	const onErrorRef = useRef(onError);
	onErrorRef.current = onError;

	// Create the viewer exactly once per mount.
	useLayoutEffect(() => {
		if (containerRef.current === null) return;
		const viewer = new NavigatedViewer({ container: containerRef.current });
		viewerRef.current = viewer;
		return () => {
			viewer.destroy();
			viewerRef.current = null;
		};
	}, []);

	// Import the diagram whenever it changes.
	useEffect(() => {
		const viewer = viewerRef.current;
		if (viewer === null || xml === null || xml.length === 0) return;
		let cancelled = false;
		viewer
			.importXML(xml)
			.then(() => {
				if (cancelled) return;
				(viewer.get("canvas") as CanvasLike).zoom("fit-viewport", "auto");
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

	return <div className="dsh-bpmn-viewer" ref={containerRef} />;
}
