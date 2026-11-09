/**
 * Host RPC contract tests: security invariants and file semantics of the
 * `/bpmn-modeler` loopback channel (src/index.ts).
 *
 * @module dsh-bpmn/host-tests
 */

import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apply, type Config } from "./index.js";

/** Captured RPC handler shape (what connection.rpc.handle receives). */
type Handler = (
	endpoint: string,
	payload: unknown,
) => Promise<
	| { ok: true; value: unknown }
	| {
			ok: false;
			error: {
				code: string;
				message: string;
				details: Record<string, unknown>;
			};
	  }
>;

/** Result envelope helper: assert ok and narrow the value. */
async function unwrap(result: Awaited<ReturnType<Handler>>): Promise<unknown> {
	if (!result.ok)
		throw new Error(
			`expected ok, got ${result.error.code}: ${result.error.message}`,
		);
	return result.value;
}

/** Minimal Context double: captures the registered RPC handler. */
function createMockContext(): { handler: Handler } {
	let handler: Handler | undefined;
	const ctx = {
		get: (name: string) => {
			if (name !== "connection") throw new Error(`unexpected service ${name}`);
			return {
				rpc: {
					handle: (_channel: string, h: Handler) => {
						handler = h;
					},
				},
			};
		},
	};
	apply(ctx as never, { enabled: true } satisfies Config);
	if (handler === undefined)
		throw new Error("apply did not register an RPC handler");
	return { handler };
}

describe("host rpc: projectPath validation", () => {
	const { handler } = createMockContext();

	it("rejects a missing projectPath", async () => {
		const result = await handler("files/list", {});
		expect(result).toMatchObject({ ok: false, error: { code: "bad-request" } });
	});

	it("rejects a non-string projectPath", async () => {
		const result = await handler("files/list", { projectPath: 42 });
		expect(result).toMatchObject({ ok: false, error: { code: "bad-request" } });
	});

	it("rejects an unknown endpoint", async () => {
		const result = await handler("nope", { projectPath: "/tmp" });
		expect(result).toMatchObject({ ok: false, error: { code: "bad-request" } });
	});
});

describe("host rpc: file operations", () => {
	let root: string;
	let handler: Handler;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "dsh-bpmn-test-"));
		({ handler } = createMockContext());
	});

	afterEach(async () => {
		vi.restoreAllMocks();
	});

	it("files/list finds .bpmn recursively and skips noise directories", async () => {
		await writeFile(join(root, "a.bpmn"), "<x/>");
		await mkdir(join(root, "sub"), { recursive: true });
		await writeFile(join(root, "sub", "b.bpmn"), "<x/>");
		await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
		await writeFile(join(root, "node_modules", "pkg", "c.bpmn"), "<x/>");
		await mkdir(join(root, ".git"), { recursive: true });
		await writeFile(join(root, ".git", "d.bpmn"), "<x/>");
		await writeFile(join(root, "note.txt"), "not bpmn");

		const files = (await unwrap(
			await handler("files/list", { projectPath: root }),
		)) as Array<{
			path: string;
		}>;
		const paths = files.map((f) => f.path).sort();
		expect(paths).toEqual(["a.bpmn", "sub/b.bpmn"]);
	});

	it("file/read returns workspace xml and rejects missing files", async () => {
		await writeFile(join(root, "a.bpmn"), "<definitions/>");
		const read = (await unwrap(
			await handler("file/read", { projectPath: root, path: "a.bpmn" }),
		)) as { xml: string };
		expect(read.xml).toBe("<definitions/>");

		const missing = await handler("file/read", {
			projectPath: root,
			path: "gone.bpmn",
		});
		expect(missing).toMatchObject({
			ok: false,
			error: { code: "bad-request" },
		});
	});

	it("file/write persists xml and rejects empty payloads", async () => {
		await handler("file/write", {
			projectPath: root,
			path: "out.bpmn",
			xml: "<a>1</a>",
		});
		expect(await readFile(join(root, "out.bpmn"), "utf8")).toBe("<a>1</a>");
		// no tmp residue from the atomic write
		expect((await readdir(root)).filter((n) => n.endsWith(".tmp"))).toEqual([]);

		const empty = await handler("file/write", {
			projectPath: root,
			path: "out.bpmn",
			xml: "  ",
		});
		expect(empty).toMatchObject({ ok: false, error: { code: "bad-request" } });
	});

	it("file/create writes the empty template once and refuses overwrites", async () => {
		const created = (await unwrap(
			await handler("file/create", { projectPath: root, path: "new.bpmn" }),
		)) as { xml: string };
		expect(created.xml).toContain("bpmn:definitions");
		expect(await readFile(join(root, "new.bpmn"), "utf8")).toBe(created.xml);

		const again = await handler("file/create", {
			projectPath: root,
			path: "new.bpmn",
		});
		expect(again).toMatchObject({ ok: false, error: { code: "bad-request" } });
	});
});

describe("host rpc: path traversal guards", () => {
	const { handler } = createMockContext();

	it.each([
		["absolute path", "/etc/passwd.bpmn"],
		["parent escape", "../outside.bpmn"],
		["nested parent escape", "sub/../../outside.bpmn"],
		["wrong extension", "evil.txt"],
		["empty path", ""],
	])("rejects %s", async (_label, path) => {
		for (const endpoint of [
			"file/read",
			"file/write",
			"file/create",
		] as const) {
			const payload =
				endpoint === "file/write"
					? { projectPath: "/tmp", path, xml: "<a/>" }
					: { projectPath: "/tmp", path };
			const result = await handler(endpoint, payload);
			expect(result, `${endpoint} ${path}`).toMatchObject({
				ok: false,
				error: { code: "bad-request" },
			});
		}
	});
});
