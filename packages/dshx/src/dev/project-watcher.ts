import { watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { access } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import type { DevProjectWatcher } from './types.js'

/** Watch file identities through their parent directories so atomic replacements remain observable. */
export async function watchProjectFiles(files: readonly string[], onChange: (file: string) => void): Promise<DevProjectWatcher> {
  const targetsByDirectory = new Map<string, Map<string, string>>()
  for (const file of files) {
    const absolute = resolve(file)
    const directory = dirname(absolute)
    const targets = targetsByDirectory.get(directory) ?? new Map<string, string>()
    targets.set(basename(absolute), absolute)
    targetsByDirectory.set(directory, targets)
  }

  const watchers: FSWatcher[] = []
  try {
    for (const [directory, targets] of targetsByDirectory) {
      // Synthetic projects used by programmatic callers may disappear before a
      // session is armed. Other watched parents still remain useful.
      const available = await access(directory).then(
        () => true,
        () => false,
      )
      if (!available) continue
      const watcher = watch(directory, { persistent: true, encoding: 'utf8' }, (_event, filename) => {
        if (filename === null) {
          for (const target of targets.values()) onChange(target)
          return
        }
        const target = targets.get(filename)
        if (target !== undefined) onChange(target)
      })
      // An inaccessible/replaced parent invalidates this watcher. Triggering a
      // reload lets the session either replace it or retain the last-good one.
      watcher.on('error', () => {
        for (const target of targets.values()) onChange(target)
      })
      watchers.push(watcher)
    }
  } catch (error) {
    for (const watcher of watchers) watcher.close()
    throw error
  }

  let closed = false
  return {
    async close() {
      if (closed) return
      closed = true
      for (const watcher of watchers) watcher.close()
    },
  }
}
