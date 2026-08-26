export {
  createProject,
  DEFAULT_DSH_RANGE,
  DEFAULT_DSH_VERSION,
  DEFAULT_STYLE,
  DEFAULT_TEMPLATE,
  detectPackageManager,
  packageVersion,
  validateProjectName,
} from './create.js'
export type { CreateDependencies } from './create.js'
export type {
  CommandResult,
  CommandRunner,
  CreateDiagnostic,
  CreateIO,
  CreateProjectOptions,
  CreateProjectResult,
  FileSystem,
  PackageManager,
  ProjectStyle,
  TemplateName,
} from './types.js'
