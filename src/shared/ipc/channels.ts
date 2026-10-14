/**
 * IPC 通道名集中管理。
 * 命名规则：`领域:动作`。渲染进程通过 Preload 暴露的白名单接口间接调用，
 * 不直接接触 ipcRenderer。
 */
export const IPC = {
  // ---- 渲染进程 → 主进程（invoke） ----
  workspaceOpen: 'workspace:open',
  workspaceOpenPath: 'workspace:openPath',
  workspaceClose: 'workspace:close',
  workspaceGetTree: 'workspace:getTree',
  workspaceRefresh: 'workspace:refresh',
  workspaceState: 'workspace:state',

  docRead: 'document:read',
  docSave: 'document:save',
  docCreateFile: 'document:createFile',
  docCreateFolder: 'document:createFolder',
  docRename: 'document:rename',
  docRemove: 'document:remove',
  docReveal: 'document:reveal',

  draftSave: 'draft:save',
  draftList: 'draft:list',
  draftRead: 'draft:read',
  draftClear: 'draft:clear',

  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',

  shellOpenExternal: 'shell:openExternal',
  appGetInfo: 'app:getInfo',
  closeRespond: 'app:closeResponse',

  // ---- 主进程 → 渲染进程（send） ----
  evtCommand: 'app:command',
  evtTreeChanged: 'workspace:treeChanged',
  evtExternalChange: 'document:externalChange',
  evtRequestClose: 'app:requestClose',
  evtDraftsAvailable: 'draft:available'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
