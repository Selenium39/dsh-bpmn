/**
 * Client-side mirrors of the host RPC contract (src/index.ts) plus the typed
 * wrapper the workbench consumes.
 *
 * Kept local (not imported from the package root) so the client bundle never
 * pulls host-half value imports. TODO(handoff-3): consider a shared
 * `contract/` module like ui-conversation does if the shapes drift.
 *
 * @module dsh-bpmn/client/rpc-types
 */

/** One `.bpmn` file discovered by the host scan. */
export interface BpmnFileMeta {
	/** Workspace-relative path with forward slashes. */
	path: string;
	/** File size in bytes. */
	size: number;
	/** mtime in milliseconds since epoch. */
	modifiedAt: number;
}

/**
 * Loosened result envelope (the wire shape is the upstream RpcResult whose
 * error codes form a literal union; widening `code` to string is safe for
 * reading on the client).
 */
export type RpcResult<T = unknown> =
	| { ok: true; value: T }
	| {
			ok: false;
			error: {
				code: string;
				message: string;
				details: Record<string, unknown>;
			};
	  };

/** Typed wrapper over the generic connection RPC caller. */
export interface BpmnRpc {
	listFiles(projectPath: string): Promise<RpcResult<BpmnFileMeta[]>>;
	readFile(
		projectPath: string,
		path: string,
	): Promise<RpcResult<{ xml: string }>>;
	writeFile(
		projectPath: string,
		path: string,
		xml: string,
	): Promise<RpcResult<null>>;
	createFile(
		projectPath: string,
		path: string,
	): Promise<RpcResult<{ xml: string }>>;
}

/** Injected business face for the workbench panel. */
export interface BpmnWorkbenchFace {
	/** Typed RPC wrapper for the host channel. */
	rpc: BpmnRpc;
}
