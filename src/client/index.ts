/**
 * Browser half of the dsh-bpmn plugin.
 *
 * Registers a sidebar footer toggle and the BPMN workbench overlay panel
 * (v0.1 shape: shell.overlay + in-panel fullscreen; migration to a `main`
 * keyed global panel is tracked in docs/HANDOFF.md as handoff-7).
 *
 * @module dsh-bpmn/client
 */

import "virtual:bpmn-vendor-css";
import type { ConnectionHandle } from "@deepseek-ai/dsh-client-connection/client";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-ui-layout/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import { BpmnToggle } from "./BpmnToggle.js";
import { BpmnWorkbench } from "./BpmnWorkbench.js";
import { type BpmnLocaleKey, en, NS, zh } from "./locales.js";
import type {
	BpmnFileMeta,
	BpmnRpc,
	BpmnWorkbenchFace,
	RpcResult,
} from "./rpc-types.js";
import { createBpmnStore } from "./store.js";

declare module "@deepseek-ai/dsh-client-ui-slots" {
	interface LocaleNamespaceMap {
		"dsh-bpmn": BpmnLocaleKey;
	}
}

/** Services required by the browser half. */
export const inject = [
	"slots",
	"locale",
	"sessions",
	"connection",
	"workspaces",
];

/** Host RPC channel this client talks to (see src/index.ts). */
const CHANNEL = "/bpmn-modeler";

/**
 * Narrow the generic `rpc.call` results to the typed contract. The wire shape
 * is the upstream RpcResult; the cast only tightens the success payload type.
 */
function createBpmnRpc(rpc: ConnectionHandle["rpc"]): BpmnRpc {
	return {
		listFiles: async (projectPath) =>
			(await rpc.call(CHANNEL, "files/list", { projectPath })) as RpcResult<
				BpmnFileMeta[]
			>,
		readFile: async (projectPath, path) =>
			(await rpc.call(CHANNEL, "file/read", {
				projectPath,
				path,
			})) as RpcResult<{ xml: string }>,
		writeFile: async (projectPath, path, xml) =>
			(await rpc.call(CHANNEL, "file/write", {
				projectPath,
				path,
				xml,
			})) as RpcResult<null>,
		createFile: async (projectPath, path) =>
			(await rpc.call(CHANNEL, "file/create", {
				projectPath,
				path,
			})) as RpcResult<{ xml: string }>,
	};
}

/**
 * Register the dsh-bpmn client surfaces.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
	ctx.effect(
		() => ctx.locale.register(NS, { zh, en }),
		"dsh-bpmn: dictionaries",
	);

	const connection = ctx.get("connection") as unknown as ConnectionHandle;
	const bpmnRpc = createBpmnRpc(connection.rpc);
	const store = createBpmnStore();

	ctx.slots.inject("sidebar.footer.action", () =>
		ctx.slots.register(
			{
				name: "sidebar.footer.action",
				id: "dsh-bpmn-toggle",
				order: 60,
				locale: NS,
				store,
			},
			BpmnToggle,
		),
	);

	ctx.slots.inject("shell.overlay", () =>
		ctx.slots.register(
			{
				name: "shell.overlay",
				id: "dsh-bpmn-workbench",
				order: 60,
				locale: NS,
				store,
				inject: (): BpmnWorkbenchFace => ({
					rpc: bpmnRpc,
				}),
			},
			BpmnWorkbench,
		),
	);
}
