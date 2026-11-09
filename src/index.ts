/**
 * `dsh-bpmn`: a DeepSeek Harness bundle plugin that embeds a BPMN 2.0 visual
 * modeler (bpmn-js) into the web GUI.
 *
 * The host half registers a loopback-only RPC channel for listing, reading,
 * creating and writing `.bpmn` files inside the current workspace. The
 * browser half (src/client) renders the workbench panel and side preview.
 *
 * @module dsh-bpmn
 */

import {
	mkdir,
	readdir,
	readFile,
	rename,
	stat,
	writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import type {
	ConnectionRpcHandler,
	HostConnectionHandle,
} from "@deepseek-ai/dsh-client-connection";
import z from "@deepseek-ai/schemastery";

export const name = "dsh-bpmn";

export const inject = ["connection"];

/** Plugin config accepted from cordis.patch.yml. */
export interface Config {
	/** Whether to register the dsh-bpmn plugin. Defaults to true. */
	enabled?: boolean;
}

/** Schemastery config schema with defaults. */
// biome-ignore lint/suspicious/noExplicitAny: artifact-viewer precedent; schemastery types are loose
export const Config: z<any> = z.object({
	enabled: z.boolean().default(true),
});

/** One `.bpmn` file discovered in the workspace. */
export interface BpmnFileMeta {
	/** Workspace-relative path with forward slashes. */
	path: string;
	/** File size in bytes. */
	size: number;
	/** mtime in milliseconds since epoch. */
	modifiedAt: number;
}

/**
 * Result envelope every endpoint returns — the upstream RPC result shape
 * (`RpcResult<unknown>` from the connection handler contract), so the
 * handler stays assignable to `ConnectionRpcHandler` without local mirrors.
 */
type HostResult = Awaited<ReturnType<ConnectionRpcHandler>>;

/** Loopback-only RPC channel exposed by this plugin. */
const CHANNEL = "/bpmn-modeler";

/** Directory names skipped when scanning for .bpmn files. */
const SCAN_IGNORE = new Set([
	"node_modules",
	".git",
	".dsh",
	"dist",
	"build",
	"coverage",
	".next",
	".turbo",
]);

/** Upper bound for the file list and for a single read/write payload. */
const MAX_FILES = 500;
const MAX_XML_BYTES = 2 * 1024 * 1024;

/** Minimal valid BPMN 2.0 document used as the "new diagram" template. */
const EMPTY_BPMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_dshbpmn" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false" />
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1" />
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;

function badRequest(message: string): HostResult {
	return {
		ok: false,
		error: { code: "bad-request", message, details: { issues: [] } },
	};
}

function internal(message: string): HostResult {
	return { ok: false, error: { code: "internal", message, details: {} } };
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isENOENT(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code: unknown }).code === "ENOENT"
	);
}

/**
 * Resolve a workspace-relative path and reject traversal outside the project.
 * Returns the workspace-absolute path, or null when the relative path escapes
 * the project root or is not a `.bpmn` file.
 */
function safeBpmnPath(projectRoot: string, relPath: string): string | null {
	if (relPath.length === 0 || isAbsolute(relPath)) return null;
	if (!relPath.toLowerCase().endsWith(".bpmn")) return null;
	const abs = resolve(projectRoot, relPath);
	const rel = relative(projectRoot, abs);
	if (rel.startsWith("..") || isAbsolute(rel)) return null;
	return abs;
}

/** Recursively collect workspace-relative `.bpmn` paths, bounded by MAX_FILES. */
async function scanBpmnFiles(
	root: string,
	dir: string,
	out: BpmnFileMeta[],
): Promise<void> {
	if (out.length >= MAX_FILES) return;
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		if (out.length >= MAX_FILES) return;
		if (entry.name.startsWith(".") && entry.name !== ".bpmn") continue;
		const abs = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (SCAN_IGNORE.has(entry.name)) continue;
			await scanBpmnFiles(root, abs, out);
		} else if (entry.isFile() && entry.name.toLowerCase().endsWith(".bpmn")) {
			const info = await stat(abs);
			out.push({
				path: relative(root, abs).split(sep).join("/"),
				size: info.size,
				modifiedAt: info.mtimeMs,
			});
		}
	}
}

async function listFiles(projectRoot: string): Promise<HostResult> {
	const files: BpmnFileMeta[] = [];
	try {
		await scanBpmnFiles(projectRoot, projectRoot, files);
	} catch (error: unknown) {
		return internal(`scan failed: ${errorMessage(error)}`);
	}
	files.sort((a, b) => a.path.localeCompare(b.path));
	return { ok: true, value: files };
}

async function readFileXml(
	projectRoot: string,
	relPath: string,
): Promise<HostResult> {
	const abs = safeBpmnPath(projectRoot, relPath);
	if (abs === null)
		return badRequest("path must be a workspace-relative .bpmn file");
	try {
		const info = await stat(abs);
		if (!info.isFile()) return badRequest("path is not a file");
		if (info.size > MAX_XML_BYTES)
			return badRequest(`file exceeds ${MAX_XML_BYTES} byte limit`);
		const xml = await readFile(abs, "utf8");
		return { ok: true, value: { xml } };
	} catch (error: unknown) {
		if (isENOENT(error)) return badRequest("file not found");
		return internal(errorMessage(error));
	}
}

/** Write via tmp file + rename so a crash never truncates a diagram. */
async function writeFileXml(
	projectRoot: string,
	relPath: string,
	xml: string,
): Promise<HostResult> {
	const abs = safeBpmnPath(projectRoot, relPath);
	if (abs === null)
		return badRequest("path must be a workspace-relative .bpmn file");
	if (xml.trim().length === 0) return badRequest("xml must not be empty");
	if (Buffer.byteLength(xml, "utf8") > MAX_XML_BYTES)
		return badRequest("xml exceeds size limit");
	try {
		await mkdir(dirname(abs), { recursive: true });
		const tmp = `${abs}.tmp`;
		await writeFile(tmp, xml, "utf8");
		await rename(tmp, abs);
		return { ok: true, value: null };
	} catch (error: unknown) {
		return internal(errorMessage(error));
	}
}

async function createFile(
	projectRoot: string,
	relPath: string,
): Promise<HostResult> {
	const abs = safeBpmnPath(projectRoot, relPath);
	if (abs === null)
		return badRequest("path must be a workspace-relative .bpmn file");
	try {
		const existing = await stat(abs).catch((error: unknown) => {
			if (isENOENT(error)) return null;
			throw error;
		});
		if (existing !== null) return badRequest("file already exists");
		await mkdir(dirname(abs), { recursive: true });
		await writeFile(abs, EMPTY_BPMN_XML, "utf8");
		return { ok: true, value: { xml: EMPTY_BPMN_XML } };
	} catch (error: unknown) {
		return internal(errorMessage(error));
	}
}

/**
 * Register the dsh-bpmn host services.
 * @param ctx - the Cordis context.
 * @param config - plugin config; schemastery has already applied defaults.
 */
export function apply(ctx: Context, config: Config): void {
	if (!config.enabled) return;

	const connection = ctx.get("connection") as HostConnectionHandle;
	connection.rpc.handle(
		CHANNEL,
		async (endpoint: string, payload: unknown): Promise<HostResult> => {
			const raw = payload as { projectPath?: unknown } | null;
			const rawProjectPath = raw?.projectPath;
			if (typeof rawProjectPath !== "string" || rawProjectPath.length === 0) {
				return badRequest("projectPath is required");
			}
			const projectRoot = resolve(rawProjectPath);
			const body = raw as { path?: unknown; xml?: unknown };

			switch (endpoint) {
				case "files/list":
					return listFiles(projectRoot);
				case "file/read": {
					if (typeof body.path !== "string")
						return badRequest("path is required");
					return readFileXml(projectRoot, body.path);
				}
				case "file/write": {
					if (typeof body.path !== "string")
						return badRequest("path is required");
					if (typeof body.xml !== "string")
						return badRequest("xml is required");
					return writeFileXml(projectRoot, body.path, body.xml);
				}
				case "file/create": {
					if (typeof body.path !== "string")
						return badRequest("path is required");
					return createFile(projectRoot, body.path);
				}
				default:
					return badRequest(`unknown endpoint ${endpoint}`);
			}
		},
		{ authority: "loopback" },
	);
}
