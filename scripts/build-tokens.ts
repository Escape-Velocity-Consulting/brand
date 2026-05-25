import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateCSS } from '../tokens.js'
import * as tokens from '../tokens.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const brandDir = resolve(__dirname, '..')

const cssPath = resolve(brandDir, 'tokens.css')
writeFileSync(cssPath, generateCSS(), 'utf-8')
console.log(`Written: ${cssPath}`)

// Also emit JSON for non-TS consumers (e.g. 11ty _data/)
const jsonPath = resolve(brandDir, 'tokens.json')
const { generateCSS: _omit, ...data } = tokens as any
writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8')
console.log(`Written: ${jsonPath}`)
