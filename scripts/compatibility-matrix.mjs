#!/usr/bin/env node

import { appendFile } from 'node:fs/promises'
import { getCompatibilitySmokeMatrix } from '../packages/dshx/dist/compat/index.js'

const matrix = JSON.stringify({ include: getCompatibilitySmokeMatrix() })

if (process.argv.includes('--github-output')) {
  const outputFile = process.env.GITHUB_OUTPUT
  if (outputFile === undefined || outputFile === '') throw new Error('GITHUB_OUTPUT is required with --github-output')
  await appendFile(outputFile, `matrix=${matrix}\n`)
} else {
  console.log(matrix)
}
