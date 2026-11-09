/**
 * tsdown config for the browser half of this external UI plugin.
 *
 * DeepSeek Harness's shared `clientBundle` preset is not published and only
 * works for packages inside the monorepo workspace, so this file reproduces
 * the same lazy-CJS factory output format that `dsh-client-modules` serves
 * to the browser. Mirrors the proven recipe from dsh-artifact-viewer.
 *
 * @module tsdown.config
 */

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { transform } from "lightningcss";
import type { UserConfig } from "tsdown";

/** Package id stamped into the module-loader registration and style tags. */
const PLUGIN_ID = "dsh-bpmn";

/**
 * Specifiers provided by the web shell's frozen module table. Every other
 * import (including third-party libraries such as bpmn-js) is inlined into
 * the bundle ("private copy" rule).
 */
const MODULE_TABLE_EXTERNALS = new Set([
	"react",
	"react/jsx-runtime",
	"react-dom",
	"react-dom/client",
	"@deepseek-ai/cordis",
	"@deepseek-ai/dsh-client-ui-slots",
	"@deepseek-ai/dsh-client-ui-primitives",
	"@deepseek-ai/dsh-client-runtime/client",
]);

function isModuleTableExternal(specifier: string): boolean {
	return MODULE_TABLE_EXTERNALS.has(specifier);
}

/** Virtual-id prefixes that keep CSS away from tsdown's own pipeline. */
const CSS_VIRTUAL_PREFIX = "\0dsh-css:";
const CSS_VIRTUAL_SUFFIX = ".mjs";

/** Virtual id used by the client entry to pull in bpmn-js vendor styles. */
export const VENDOR_CSS_ID = "virtual:bpmn-vendor-css";

/**
 * Stylesheets required by bpmn-js / properties-panel. Each entry resolves
 * `path` from the installed `from` package's node_modules neighborhood, so
 * transitive css (bpmn-js-properties-panel ships none itself — the styles
 * live in its `@bpmn-io/properties-panel` dependency) is reachable under
 * pnpm's isolated layout too.
 */
const VENDOR_CSS_FILES = [
	{ from: "bpmn-js", path: "dist/assets/diagram-js.css" },
	{ from: "bpmn-js", path: "dist/assets/bpmn-js.css" },
	{
		from: "bpmn-js-properties-panel",
		path: "@bpmn-io/properties-panel/dist/assets/properties-panel.css",
	},
];

function resolveVendorCss(entry: { from: string; path: string }): string {
	const require = createRequire(import.meta.url);
	const root = dirname(require.resolve(`${entry.from}/package.json`));
	return require.resolve(entry.path, { paths: [root] });
}

function styleInjectionModule(
	fileId: string,
	css: string,
	classMap?: Record<string, string>,
): string {
	const tagId = `${PLUGIN_ID}/${fileId.split("/").pop() ?? "style"}`;
	const source = [
		`const css = ${JSON.stringify(css)};`,
		`const tagId = ${JSON.stringify(tagId)};`,
		"if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {",
		"  const tag = document.createElement('style');",
		`  tag.dataset.plugin = ${JSON.stringify(PLUGIN_ID)};`,
		"  tag.dataset.pluginCss = tagId;",
		"  tag.textContent = css;",
		"  document.head.appendChild(tag);",
		"}",
	];
	source.push(
		classMap === undefined
			? "export {};"
			: `export default ${JSON.stringify(classMap)};`,
	);
	return source.join("\n");
}

async function readVendorCss(): Promise<string> {
	const chunks: string[] = [];
	for (const entry of VENDOR_CSS_FILES) {
		try {
			chunks.push(await readFile(resolveVendorCss(entry), "utf8"));
		} catch {
			// Missing stylesheet is non-fatal at build time; surface a comment so
			// the gap is visible in the injected tag.
			chunks.push(
				`/* dsh-bpmn: missing vendor css ${entry.from}/${entry.path} */`,
			);
		}
	}
	const { code } = transform({
		filename: "vendor.css",
		code: Buffer.from(chunks.join("\n")),
		minify: true,
	});
	return code.toString();
}

export default {
	name: `${PLUGIN_ID}/client`,
	entry: { client: "lib/client/index.js" },
	outDir: "lib",
	format: "cjs",
	platform: "browser",
	dts: false,
	sourcemap: true,
	clean: false,
	deps: {
		neverBundle: isModuleTableExternal,
		alwaysBundle: (specifier: string) => !isModuleTableExternal(specifier),
	},
	define: {
		"process.env.NODE_ENV": JSON.stringify(
			process.env.NODE_ENV ?? "production",
		),
		"import.meta.env.MODE": JSON.stringify(
			process.env.NODE_ENV ?? "production",
		),
		"import.meta.env": JSON.stringify({
			MODE: process.env.NODE_ENV ?? "production",
		}),
	},
	plugins: [
		{
			// Purity gate: reject accidental value imports from other @deepseek-ai
			// packages that are not in the module table. Type-only imports are erased
			// before this runs.
			name: "dsh-bpmn-bundle-purity",
			resolveId(source: string) {
				if (source === VENDOR_CSS_ID) return `\0dsh-vendor${source}`;
				if (!source.startsWith("@deepseek-ai/")) return null;
				if (isModuleTableExternal(source)) return null;
				throw new Error(
					`client bundle purity: "${source}" is not in the module table for ${PLUGIN_ID} — ` +
						"declare it in dsh.client.external or collaborate through cordis services",
				);
			},
		},
		{
			// CSS Modules: compile and inject as a plugin-owned style tag.
			name: "dsh-bpmn-css-modules",
			resolveId(source: string, importer: string | undefined) {
				if (!source.endsWith(".module.css") || importer === undefined)
					return null;
				const resolved = new URL(source, `file://${importer}`).pathname;
				// tsc emits JS next to the TS source but does not copy stylesheets, so map
				// the emitted lib/ path back to the src/ tree when necessary.
				const sourcePath = resolved.replace(/\/lib\//, "/src/");
				return CSS_VIRTUAL_PREFIX + sourcePath + CSS_VIRTUAL_SUFFIX;
			},
			async load(virtualId: string) {
				if (virtualId.startsWith(CSS_VIRTUAL_PREFIX)) {
					const fileId = virtualId.slice(
						CSS_VIRTUAL_PREFIX.length,
						-CSS_VIRTUAL_SUFFIX.length,
					);
					this.addWatchFile(fileId);
					const source = await readFile(fileId);
					const { code, exports: cssExports } = transform({
						filename: fileId,
						code: source,
						cssModules: { pattern: "[hash]_[local]" },
						minify: true,
					});
					const classMap: Record<string, string> = {};
					const entries = Object.entries(cssExports ?? {}).sort(([a], [b]) =>
						a < b ? -1 : a > b ? 1 : 0,
					);
					for (const [local, exp] of entries) classMap[local] = exp.name;
					return styleInjectionModule(fileId, code.toString(), classMap);
				}
				if (virtualId.startsWith("\0dsh-vendor")) {
					return styleInjectionModule("vendor-bpmn.css", await readVendorCss());
				}
				return null;
			},
		},
	],
	outputOptions: {
		entryFileNames: "client.js",
		// The web shell loads exactly one factory file; bpmn-js internal dynamic
		// imports must be folded back into the entry instead of split chunks.
		inlineDynamicImports: true,
		banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
		footer: "return module.exports; } });",
		intro: "var module = { exports: {} }; var exports = module.exports;",
	},
} satisfies UserConfig;
