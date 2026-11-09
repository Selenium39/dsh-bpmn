/**
 * Chinese/English product copy for dsh-bpmn.
 *
 * @module dsh-bpmn/client/locales
 */

/** Locale namespace registered into the DSH locale service. */
export const NS = "dsh-bpmn";

const zh = {
	"panel.title": "BPMN 建模器",
	"panel.open": "打开 BPMN 建模器",
	"panel.close": "关闭",
	"panel.fullscreen": "全屏",
	"panel.exitFullscreen": "退出全屏",
	"files.title": "文件",
	"files.refresh": "刷新",
	"files.new": "新建",
	"files.empty": "工作区内没有 .bpmn 文件",
	"files.newName": "diagram.bpmn",
	"tabs.unsaved": "未保存",
	"action.save": "保存",
	"action.open": "打开",
	"action.close": "关闭",
	"action.saveAll": "全部保存",
	"action.openInModeler": "在建模器中打开",
	"status.loading": "加载中…",
	"status.saved": "已保存",
	"status.dirty": "有未保存的修改",
	"status.error": "出错了",
	"error.rpc": "RPC 调用失败",
	"error.import": "BPMN XML 解析失败",
	"preview.title": "BPMN 预览",
} as const;

export type BpmnLocaleKey = keyof typeof zh;

const en: Record<BpmnLocaleKey, string> = {
	"panel.title": "BPMN Modeler",
	"panel.open": "Open BPMN modeler",
	"panel.close": "Close",
	"panel.fullscreen": "Fullscreen",
	"panel.exitFullscreen": "Exit fullscreen",
	"files.title": "Files",
	"files.refresh": "Refresh",
	"files.new": "New",
	"files.empty": "No .bpmn files in the workspace",
	"files.newName": "diagram.bpmn",
	"tabs.unsaved": "unsaved",
	"action.save": "Save",
	"action.open": "Open",
	"action.close": "Close",
	"action.saveAll": "Save all",
	"action.openInModeler": "Open in modeler",
	"status.loading": "Loading…",
	"status.saved": "Saved",
	"status.dirty": "Unsaved changes",
	"status.error": "Error",
	"error.rpc": "RPC call failed",
	"error.import": "Failed to import BPMN XML",
	"preview.title": "BPMN preview",
};

export { en, zh };
