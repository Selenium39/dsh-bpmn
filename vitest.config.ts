/**
 * Vitest config: host-half tests run in node; the runtime-client shim (and any
 * future component tests) run under jsdom via per-file environment comments.
 *
 * The alias is the whole trick for browser-half tests: the published runtime
 * client entry is a web-shell factory script, so `@deepseek-ai/dsh-client-runtime/client`
 * resolves to tests/shims/runtime-client.ts, which fakes the loader contract
 * and re-exports the real factory's product.
 *
 * @module vitest.config
 */

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
	test: {
		globals: false,
		environment: "node",
		server: {
			deps: {
				inline: [/@deepseek-ai/],
			},
		},
	},
	resolve: {
		// Source files use .js extensions (bundler resolution); map back to the
		// .ts source during testing.
		alias: [
			{
				find: /^@deepseek-ai\/dsh-client-runtime\/client$/,
				replacement: `${root}tests/shims/runtime-client.ts`,
			},
			{ find: /^(\.\.?\/.*)\.js$/, replacement: "$1" },
		],
	},
});
