/**
 * Store actions semantics: the workbench write set as pure draft transforms
 * (src/client/store.ts), exercised through a live engine instance.
 *
 * The runtime client bundle touches `window` at module scope, so this file
 * runs under jsdom (jsdom is a devDependency for exactly this).
 *
 * @module dsh-bpmn/client/store-tests
 */

// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { type BpmnState, createBpmnStore } from "./store.js";

/** Fresh engine instance per test — instances are cheap and isolated. */
function setup(): {
	instance: ReturnType<ReturnType<typeof createBpmnStore>["create"]>;
	state: () => BpmnState;
} {
	const instance = createBpmnStore().create();
	return { instance, state: () => instance.getSnapshot() as BpmnState };
}

describe("panel state", () => {
	const { instance } = setup();

	it("opens, closes and toggles fullscreen", () => {
		expect(instance.getSnapshot().panelOpen).toBe(false);
		instance.actions.openPanel();
		expect(instance.getSnapshot().panelOpen).toBe(true);
		instance.actions.toggleFullscreen();
		expect(instance.getSnapshot().fullscreen).toBe(true);
		instance.actions.closePanel();
		expect(instance.getSnapshot().panelOpen).toBe(false);
	});
});

describe("openFile", () => {
	it("appends a new tab and activates it", () => {
		const { instance } = setup();
		instance.actions.openFile("a.bpmn", "<a/>");
		const s = instance.getSnapshot();
		expect(s.openFiles).toHaveLength(1);
		expect(s.activePath).toBe("a.bpmn");
	});

	it("is idempotent per path: refreshes the baseline instead of duplicating", () => {
		const { instance } = setup();
		instance.actions.openFile("a.bpmn", "<v1/>");
		instance.actions.markDirty("a.bpmn");
		instance.actions.openFile("a.bpmn", "<v2/>");
		const s = instance.getSnapshot();
		expect(s.openFiles).toHaveLength(1);
		expect(s.openFiles[0]?.xml).toBe("<v2/>");
		expect(s.openFiles[0]?.dirty).toBe(false);
		expect(s.activePath).toBe("a.bpmn");
	});

	it("clears the error banner on open", () => {
		const { instance } = setup();
		instance.actions.setError("boom");
		instance.actions.openFile("a.bpmn", "<a/>");
		expect(instance.getSnapshot().error).toBeNull();
	});
});

describe("dirty tracking", () => {
	it("markSaved updates the baseline so the next dirty flag is meaningful", () => {
		const { instance } = setup();
		instance.actions.openFile("a.bpmn", "<v1/>");
		instance.actions.markDirty("a.bpmn");
		expect(instance.getSnapshot().openFiles[0]?.dirty).toBe(true);
		instance.actions.markSaved("a.bpmn", "<v2/>");
		const tab = instance.getSnapshot().openFiles[0];
		expect(tab?.dirty).toBe(false);
		expect(tab?.xml).toBe("<v2/>");
	});
});

describe("closeFile", () => {
	it("falls back to the last remaining tab when the active one closes", () => {
		const { instance } = setup();
		instance.actions.openFile("a.bpmn", "<a/>");
		instance.actions.openFile("b.bpmn", "<b/>");
		instance.actions.openFile("c.bpmn", "<c/>");
		instance.actions.closeFile("c.bpmn");
		expect(instance.getSnapshot().activePath).toBe("b.bpmn");
		instance.actions.closeFile("b.bpmn");
		expect(instance.getSnapshot().activePath).toBe("a.bpmn");
		instance.actions.closeFile("a.bpmn");
		const s = instance.getSnapshot();
		expect(s.openFiles).toEqual([]);
		expect(s.activePath).toBeNull();
	});
});

describe("scan state", () => {
	it("replaces the file list wholesale and resets loading", () => {
		const { instance } = setup();
		instance.actions.setLoading(true);
		instance.actions.setFiles([{ path: "x.bpmn", size: 1, modifiedAt: 2 }]);
		const s = instance.getSnapshot();
		expect(s.files).toEqual([{ path: "x.bpmn", size: 1, modifiedAt: 2 }]);
		instance.actions.setLoading(false);
		expect(instance.getSnapshot().loading).toBe(false);
	});
});
