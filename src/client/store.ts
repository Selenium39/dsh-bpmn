/**
 * Workbench store, declared with the official engine.
 *
 * `defineStore` comes from `@deepseek-ai/dsh-client-runtime/client` (a module
 * table external, so the value import is served by the web shell). Actions
 * are pure immer-draft mutators; the slot registry bakes them into bound
 * callbacks that components receive via `PropsStore` (`useStore` + `actions`)
 * — components never touch the instance itself.
 *
 * @module dsh-bpmn/client/store
 */

import { defineStore } from "@deepseek-ai/dsh-client-runtime/client";
import type {
	ActionsDecl,
	StoreHandle,
} from "@deepseek-ai/dsh-client-ui-slots";
import type { BpmnFileMeta } from "./rpc-types.js";

/** One open diagram tab: path plus its last-saved XML baseline. */
export interface BpmnOpenFile {
	/** Workspace-relative path with forward slashes. */
	path: string;
	/** Last saved (or freshly loaded) XML baseline. */
	xml: string;
	/** Whether the canvas has edits not yet written back. */
	dirty: boolean;
}

/** Workbench view state. */
export interface BpmnState {
	/** Whether the overlay panel is shown. */
	panelOpen: boolean;
	/** Whether the panel covers the whole window. */
	fullscreen: boolean;
	/** Latest workspace scan result. */
	files: BpmnFileMeta[];
	/** Open diagram tabs, in open order. */
	openFiles: BpmnOpenFile[];
	/** Path of the tab currently on the canvas. */
	activePath: string | null;
	/** True while an RPC round-trip is in flight. */
	loading: boolean;
	/** Last error message surfaced to the status bar. */
	error: string | null;
}

const INITIAL: BpmnState = {
	panelOpen: false,
	fullscreen: false,
	files: [],
	openFiles: [],
	activePath: null,
	loading: false,
	error: null,
};

/**
 * The complete write set, as draft mutators. Contextual typing of the draft
 * parameter comes from `satisfies ActionsDecl<BpmnState>`.
 */
const actions = {
	openPanel: (d: BpmnState) => {
		d.panelOpen = true;
	},
	closePanel: (d: BpmnState) => {
		d.panelOpen = false;
	},
	toggleFullscreen: (d: BpmnState) => {
		d.fullscreen = !d.fullscreen;
	},
	setFiles: (d: BpmnState, files: BpmnFileMeta[]) => {
		d.files = files;
	},
	setLoading: (d: BpmnState, loading: boolean) => {
		d.loading = loading;
	},
	setError: (d: BpmnState, error: string | null) => {
		d.error = error;
	},
	openFile: (d: BpmnState, path: string, xml: string) => {
		const existing = d.openFiles.find((f) => f.path === path);
		if (existing === undefined) {
			d.openFiles.push({ path, xml, dirty: false });
		} else {
			existing.xml = xml;
			existing.dirty = false;
		}
		d.activePath = path;
		d.error = null;
	},
	markDirty: (d: BpmnState, path: string) => {
		const file = d.openFiles.find((f) => f.path === path);
		if (file !== undefined) file.dirty = true;
	},
	markSaved: (d: BpmnState, path: string, xml?: string) => {
		const file = d.openFiles.find((f) => f.path === path);
		if (file === undefined) return;
		file.dirty = false;
		if (xml !== undefined) file.xml = xml;
	},
	closeFile: (d: BpmnState, path: string) => {
		d.openFiles = d.openFiles.filter((f) => f.path !== path);
		if (d.activePath === path) {
			const last = d.openFiles.at(-1);
			d.activePath = last === undefined ? null : last.path;
		}
	},
	setActive: (d: BpmnState, path: string) => {
		d.activePath = path;
	},
} satisfies ActionsDecl<BpmnState>;

/** Handle type: the registration currency shared by both slot entries. */
export type BpmnStoreHandle = StoreHandle<BpmnState, typeof actions>;

/** Type of the baked actions table components receive via PropsStore. */
export type BpmnActions = StoreHandle<
	BpmnState,
	typeof actions
>["spec"]["actions"];

/**
 * Declare the workbench store. Call exactly once inside client `apply`; the
 * returned handle's identity keys instance sharing across registrations.
 */
export function createBpmnStore(): BpmnStoreHandle {
	return defineStore({ init: () => INITIAL, actions });
}
