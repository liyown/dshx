import { access, mkdir, readdir, stat, writeFile, readFile } from 'node:fs/promises'
import type { FileSystem } from './types.js'

export const defaultFileSystem: FileSystem = {
  async exists(path) { try { await access(path); return true } catch { return false } },
  async isDirectory(path) { try { return (await stat(path)).isDirectory() } catch { return false } },
  async list(path) { return readdir(path) },
  async mkdir(path) { await mkdir(path, { recursive: true }) },
  async writeFile(path, contents) { await writeFile(path, contents, 'utf8') },
  async readFile(path) { return readFile(path, 'utf8') },
}
