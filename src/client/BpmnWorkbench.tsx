/**
 * BPMN workbench panel: file rail + canvas + status bar.
 *
 * v0.1 shape: registered into `shell.overlay` with an in-panel fullscreen
 * toggle. A dedicated `main` keyed global panel is the preferred end state —
 * see docs/HANDOFF.md (handoff-7) for the migration note.
 *
 * Props are the slot renderer's composed shares: the runtime share (standard
 * hooks, including `useSessions` — the workspace root is derived from the
 * current session's cwd the same way artifact-viewer does it), the store
 * share (`useStore` + baked `actions`), and the inject face (`rpc`).
 *
 * @module dsh-bpmn/client/BpmnWorkbench
 */

import type {
	PropsRuntime,
	PropsStore,
} from "@deepseek-ai/dsh-client-ui-slots";
import { useCallback, useEffect, useRef } from "react";
import { BpmnModeler, type BpmnModelerApi } from "./BpmnModeler.js";
import type { BpmnFileMeta, BpmnWorkbenchFace } from "./rpc-types.js";
import type { BpmnStoreHandle } from "./store.js";
import classes from "./styles/workbench.module.css";

export type BpmnWorkbenchProps = PropsRuntime<"shell.overlay"> &
	PropsStore<BpmnStoreHandle> &
	BpmnWorkbenchFace;

export function BpmnWorkbench({
	useStore,
	actions,
	useSessions,
	rpc,
}: BpmnWorkbenchProps) {
	const state = useStore((s) => s);
	const modelerApiRef = useRef<BpmnModelerApi | null>(null);

	// Workspace root = current session's cwd (handoff-2). Sessions without a
	// cwd (blank/new session view) yield null and the rail explains itself.
	const projectPath = useSessions((list) => {
		const current = list.current;
		return current === undefined ? null : (list.byId[current]?.cwd ?? null);
	});

	const active =
		state.openFiles.find((f) => f.path === state.activePath) ?? null;

	const refreshFiles = useCallback(async () => {
		if (projectPath === null) return;
		actions.setLoading(true);
		const result = await rpc.listFiles(projectPath);
		actions.setLoading(false);
		if (result.ok) {
			actions.setFiles(result.value);
		} else {
			actions.setError(`files/list: ${result.error.message}`);
		}
	}, [projectPath, rpc, actions]);

	// Scan the workspace whenever the panel opens.
	useEffect(() => {
		if (state.panelOpen) {
			void refreshFiles();
		}
	}, [state.panelOpen, refreshFiles]);

	const openFile = useCallback(
		async (path: string) => {
			if (projectPath === null) return;
			const result = await rpc.readFile(projectPath, path);
			if (result.ok) {
				actions.openFile(path, result.value.xml);
			} else {
				actions.setError(`file/read: ${result.error.message}`);
			}
		},
		[projectPath, rpc, actions],
	);

	const saveActive = useCallback(async () => {
		if (projectPath === null || active === null) return;
		const api = modelerApiRef.current;
		if (api === null) return;
		try {
			const xml = await api.saveXML();
			const result = await rpc.writeFile(projectPath, active.path, xml);
			if (result.ok) {
				actions.markSaved(active.path, xml);
			} else {
				actions.setError(`file/write: ${result.error.message}`);
			}
		} catch (error: unknown) {
			actions.setError(error instanceof Error ? error.message : String(error));
		}
	}, [active, projectPath, rpc, actions]);

	const createNew = useCallback(async () => {
		if (projectPath === null) return;
		// TODO(handoff-8): replace with a name prompt + collision counter.
		let candidate = "diagram.bpmn";
		let n = 1;
		while (state.files.some((f: BpmnFileMeta) => f.path === candidate)) {
			n += 1;
			candidate = `diagram-${n}.bpmn`;
		}
		const result = await rpc.createFile(projectPath, candidate);
		if (result.ok) {
			actions.openFile(candidate, result.value.xml);
			void refreshFiles();
		} else {
			actions.setError(`file/create: ${result.error.message}`);
		}
	}, [projectPath, rpc, state.files, actions, refreshFiles]);

	// Ctrl/Cmd+S saves the active diagram.
	useEffect(() => {
		if (!state.panelOpen) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
				event.preventDefault();
				void saveActive();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
		};
	}, [state.panelOpen, saveActive]);

	if (!state.panelOpen) return null;

	return (
		<div
			className={`${classes.panel} ${state.fullscreen ? classes.fullscreen : ""}`}
		>
			<header className={classes.header}>
				<span className={classes.title}>BPMN 建模器</span>
				<button type="button" onClick={() => void refreshFiles()}>
					刷新
				</button>
				<button type="button" onClick={() => void createNew()}>
					新建
				</button>
				<button
					type="button"
					onClick={() => void saveActive()}
					disabled={active === null}
				>
					保存
				</button>
				<button type="button" onClick={() => actions.toggleFullscreen()}>
					{state.fullscreen ? "退出全屏" : "全屏"}
				</button>
				<button type="button" onClick={() => actions.closePanel()}>
					关闭
				</button>
			</header>
			<div className={classes.body}>
				<aside className={classes.rail}>
					{projectPath === null && !state.loading && (
						<p className={classes.hint}>
							当前会话没有工作目录，请先选择一个工作区
						</p>
					)}
					{projectPath !== null &&
						state.files.length === 0 &&
						!state.loading && (
							<p className={classes.hint}>工作区内没有 .bpmn 文件</p>
						)}
					{state.files.map((file) => (
						<button
							type="button"
							key={file.path}
							className={`${classes.fileItem} ${file.path === state.activePath ? classes.fileActive : ""}`}
							onClick={() => void openFile(file.path)}
						>
							{file.path}
						</button>
					))}
				</aside>
				<main className={classes.canvasArea}>
					{active === null ? (
						<p className={classes.hint}>从左侧选择或新建一个 .bpmn 文件</p>
					) : (
						<BpmnModeler
							key={active.path}
							xml={active.xml}
							onDirtyChange={(dirty) => dirty && actions.markDirty(active.path)}
							onReady={(api) => {
								modelerApiRef.current = api;
							}}
							onError={(message) => actions.setError(message)}
						/>
					)}
				</main>
			</div>
			<footer className={classes.statusBar}>
				{projectPath !== null ? (
					<span className={classes.path} title={projectPath}>
						{projectPath}
					</span>
				) : null}
				{state.loading ? "加载中…" : null}
				{state.error !== null ? (
					<span className={classes.error}>{state.error}</span>
				) : null}
				{active?.dirty ? "未保存" : null}
				{active !== null && !active.dirty ? "已保存" : null}
			</footer>
		</div>
	);
}
