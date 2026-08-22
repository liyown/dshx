export { createUiScaffold } from './ui.js'
export { createToolScaffold } from './tool.js'
export { createHookScaffold } from './hook.js'
export { applyFilePlan, insideProject, readOptionalFile, renderFileDiff, rollbackFilePlan } from './common.js'
export type { FilePlan } from './common.js'
export type {
  AddUiDependencies,
  AddUiOptions,
  AddUiResult,
  ScaffoldFileSystem,
} from './ui.js'
export type { AddToolDependencies, AddToolOptions, AddToolResult } from './tool.js'
export type { AddHookDependencies, AddHookOptions, AddHookResult } from './hook.js'
