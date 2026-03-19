import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateCSS } from '../tokens.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outPath = resolve(__dirname, '..', 'tokens.css')
writeFileSync(outPath, generateCSS(), 'utf-8')
console.log(`Written: ${outPath}`)
