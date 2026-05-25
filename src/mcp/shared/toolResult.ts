/**
 * Wrap a tool handler to convert thrown errors into structured MCP tool errors.
 * Also formats success results as text content with the result JSON.
 */
import { GeneratorError } from '../../core/errors.js'

export interface ToolSuccess {
  content: { type: 'text'; text: string }[]
  structuredContent?: Record<string, unknown>
  isError?: false
}

export interface ToolError {
  content: { type: 'text'; text: string }[]
  isError: true
}

export type ToolResponse = ToolSuccess | ToolError

export function successResult(data: Record<string, unknown>, message?: string): ToolResponse {
  return {
    content: [{ type: 'text', text: message ?? JSON.stringify(data, null, 2) }],
    structuredContent: data,
  }
}

export function errorResult(err: unknown): ToolResponse {
  if (err instanceof GeneratorError) {
    return { content: [{ type: 'text', text: `[${err.code}] ${err.message}` }], isError: true }
  }
  if (err instanceof Error) {
    return { content: [{ type: 'text', text: err.message }], isError: true }
  }
  return { content: [{ type: 'text', text: String(err) }], isError: true }
}

export async function runTool<T>(fn: () => Promise<ToolResponse>): Promise<ToolResponse> {
  try {
    return await fn()
  } catch (err) {
    return errorResult(err)
  }
}
