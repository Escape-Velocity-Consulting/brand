/**
 * Errors thrown by the rendering core. Caught by CLI shims (→ process.exit) and
 * by the MCP server (→ structured tool error response). Never call process.exit
 * from inside the core itself.
 */
export class GeneratorError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'GeneratorError'
    this.code = code
  }
}
