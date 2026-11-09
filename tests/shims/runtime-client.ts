/**
 * Test shim for the web-shell factory build of
 * `@deepseek-ai/dsh-client-runtime/client`.
 *
 * The published entry is a bare `window.__ModuleLoader__.load({ id, factory })`
 * script — it only evaluates inside the DSH browser shell. This shim fakes the
 * loader contract: install the double, import the real file so its top-level
 * `load()` call runs, then execute the captured factory with a `require`
 * anchored at the runtime package (so its own .pnpm neighborhood resolves),
 * and re-export whatever the factory produced.
 *
 * Requires a DOM-bearing environment (`window` at module scope).
 */

// @vitest-environment jsdom

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

type LoaderFactory = (require: NodeRequire) => unknown;

interface LoaderDescriptor {
	id: string;
	factory: LoaderFactory;
}

const entry = createRequire(import.meta.url).resolve(
	"@deepseek-ai/dsh-client-runtime/client",
);

let captured: LoaderDescriptor | undefined;
const loaderDouble = {
	load(descriptor: LoaderDescriptor): void {
		captured = descriptor;
	},
};
(
	globalThis as { __ModuleLoader__: typeof loaderDouble | undefined }
).__ModuleLoader__ = loaderDouble;

await import(pathToFileURL(entry).href);

if (captured === undefined) {
	throw new Error(
		"runtime shim: entry did not register a factory with __ModuleLoader__",
	);
}

const runtimeExports = captured.factory(createRequire(entry)) as Record<
	string,
	unknown
>;

export const defineStore = runtimeExports.defineStore as (spec: unknown) => {
	create: (scopeKey?: string) => unknown;
};
