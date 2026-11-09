/**
 * Side preview (v0.2): read-only BPMN popup over the conversation.
 *
 * Two responsibilities, one always-mounted `shell.overlay` entry:
 *
 * 1. Capture-phase interception of in-conversation `.bpmn` references —
 *    markdown local links, produced-file chips, file mentions and inline
 *    code paths (the same surfaces artifact-viewer intercepts) — resolved
 *    against the current workspace root and loaded through the host RPC.
 * 2. The preview card itself: title bar, read-only NavigatedViewer canvas
 *    and an "open in modeler" hand-off into the workbench store.
 *
 * The component renders null while no preview is open, but stays mounted so
 * the interception listener lives for the whole session.
 *
 * @module dsh-bpmn/client/BpmnPreview
 */

import type {
	PropsRuntime,
	PropsStore,
} from "@deepseek-ai/dsh-client-ui-slots";
import { useCallback, useEffect } from "react";
import { BpmnViewer } from "./BpmnViewer.js";
import type { BpmnWorkbenchFace } from "./rpc-types.js";
import type { BpmnStoreHandle } from "./store.js";
import classes from "./styles/workbench.module.css";

export type BpmnPreviewProps = PropsRuntime<"shell.overlay"> &
	PropsStore<BpmnStoreHandle> &
	BpmnWorkbenchFace;

/** URL schemes that are somebody else's navigation, never a local file. */
const EXTERNAL_SCHEME = /^(?:https?|ftp|mailto|data|blob|tel|ws|wss):/i;

/**
 * Extract a candidate file reference from a click target, following the
 * artifact-viewer interception surfaces. Returns the raw path or href; BPMN
 * filtering and workspace resolution happen in the caller.
 */
function findFileRef(target: EventTarget | null): string | null {
	if (!(target instanceof Element)) return null;

	const anchor = target.closest("a");
	if (anchor !== null) {
		const href = anchor.getAttribute("href");
		if (href !== null && href.length > 0 && !EXTERNAL_SCHEME.test(href)) {
			return href.toLowerCase().startsWith("file://") ? href.slice(7) : href;
		}
	}

	const button = target.closest("button");
	if (button !== null) {
		if (
			button.closest("[data-produced-files-row]") !== null ||
			button.className.toString().includes("fileMention")
		) {
			return button.getAttribute("title");
		}
	}

	const code = target.closest("code");
	if (code !== null && code.closest("pre") === null) {
		return code.textContent?.trim() ?? null;
	}

	return null;
}

/** Whether a raw reference can name a BPMN file at all. */
function isBpmnRef(raw: string): boolean {
	return raw.toLowerCase().endsWith(".bpmn");
}

/** Normalize separators and percent-encoding on an intercepted reference. */
function cleanRef(raw: string): string {
	const cleaned = raw.replaceAll("\\", "/");
	try {
		return decodeURI(cleaned);
	} catch {
		return cleaned;
	}
}

/**
 * Resolve an intercepted absolute path to a workspace-relative path, or null
 * when the file lives outside the current workspace root.
 */
function toWorkspaceRelative(abs: string, projectPath: string): string | null {
	const root = projectPath.replace(/\/+$/, "");
	const target = abs.replace(/\/+$/, "");
	if (!target.startsWith("/")) return null;
	if (target === root) return null;
	if (!target.startsWith(`${root}/`)) return null;
	return target.slice(root.length + 1);
}

/** Last path segment for display. */
function baseName(path: string): string {
	const parts = path.split("/");
	return parts[parts.length - 1] || path;
}

export function BpmnPreview({
	useStore,
	actions,
	useSessions,
	rpc,
}: BpmnPreviewProps) {
	const previewPath = useStore((s) => s.previewPath);
	const previewXml = useStore((s) => s.previewXml);
	const previewError = useStore((s) => s.previewError);

	const projectPath = useSessions((list) => {
		const current = list.current;
		return current === undefined ? null : (list.byId[current]?.cwd ?? null);
	});

	// Capture-phase interception: runs before DSH's own file handling.
	useEffect(() => {
		if (projectPath === null) return;
		const onClick = (event: MouseEvent) => {
			if (event.defaultPrevented) return;
			const raw = findFileRef(event.target);
			if (raw === null || !isBpmnRef(raw)) return;
			// From here the click is ours.
			event.preventDefault();
			event.stopPropagation();
			const ref = cleanRef(raw);
			const rel = ref.startsWith("/")
				? toWorkspaceRelative(ref, projectPath)
				: ref;
			if (rel === null) {
				actions.openPreview(ref);
				actions.setPreviewError(
					ref,
					"文件在当前工作区之外，无法预览（请在建模器中通过文件栏打开）",
				);
				return;
			}
			actions.openPreview(rel);
			void (async () => {
				const result = await rpc.readFile(projectPath, rel);
				if (result.ok) {
					actions.setPreviewXml(rel, result.value.xml);
				} else {
					actions.setPreviewError(rel, `file/read: ${result.error.message}`);
				}
			})();
		};
		document.addEventListener("click", onClick, true);
		return () => {
			document.removeEventListener("click", onClick, true);
		};
	}, [projectPath, rpc, actions]);

	// Esc closes the preview.
	useEffect(() => {
		if (previewPath === null) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") actions.closePreview();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
		};
	}, [previewPath, actions]);

	const openInModeler = useCallback(() => {
		if (previewPath === null || previewXml === null) return;
		actions.openFile(previewPath, previewXml);
		actions.openPanel();
		actions.closePreview();
	}, [previewPath, previewXml, actions]);

	if (previewPath === null) return null;

	return (
		<div className={classes.previewBackdrop} data-testid="dsh-bpmn-preview">
			{/* Click-to-close affordance as a real button: focusable, labeled,
			    and no a11y complaints — the card above simply sits on top. */}
			<button
				type="button"
				aria-label="关闭预览"
				className={classes.previewBackdropButton}
				onClick={() => actions.closePreview()}
			/>
			<div role="dialog" aria-modal="true" className={classes.previewCard}>
				<header className={classes.previewHeader}>
					<span className={classes.previewTitle} title={previewPath}>
						{baseName(previewPath)}
					</span>
					<button type="button" onClick={() => actions.closePreview()}>
						关闭
					</button>
				</header>
				<main className={classes.previewBody}>
					{previewError !== null ? (
						<p className={classes.error}>{previewError}</p>
					) : previewXml === null ? (
						<p className={classes.hint}>加载中…</p>
					) : (
						<BpmnViewer
							xml={previewXml}
							onError={(message) => {
								// BpmnViewer reports null on successful imports
								// (clear semantics) — only failures land here.
								if (message !== null && previewPath !== null)
									actions.setPreviewError(previewPath, message);
							}}
						/>
					)}
				</main>
				<footer className={classes.previewFooter}>
					<button
						type="button"
						className={classes.previewPrimary}
						onClick={openInModeler}
						disabled={previewXml === null}
					>
						在建模器中打开
					</button>
				</footer>
			</div>
		</div>
	);
}
