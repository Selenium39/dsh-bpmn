/**
 * Ambient declarations for non-TS imports consumed at bundle time.
 *
 * - `virtual:bpmn-vendor-css` is resolved by the vendor-css plugin in
 *   tsdown.config.ts (concatenated bpmn-js / properties-panel stylesheets
 *   injected as a plugin-owned <style> tag).
 * - `*.module.css` is compiled by the CSS Modules plugin in tsdown.config.ts
 *   into a style tag plus a default-exported class map.
 */

declare module "virtual:bpmn-vendor-css" {
	// Side-effect only module.
}

declare module "*.module.css" {
	const classes: Readonly<Record<string, string>>;
	export default classes;
}

/**
 * bpmn-js-properties-panel ships no type declarations. The CJS entry has
 * named exports only — the two Camunda-dialect providers stay optional.
 */
declare module "bpmn-js-properties-panel" {
	export const BpmnPropertiesPanelModule: import("didi").ModuleDeclaration;
	export const BpmnPropertiesProviderModule: import("didi").ModuleDeclaration;
	export const CamundaPlatformPropertiesProviderModule: import("didi").ModuleDeclaration;
	export const ZeebePropertiesProviderModule: import("didi").ModuleDeclaration;
	export const useService: <T = unknown>(name: string, strict?: boolean) => T;
}
