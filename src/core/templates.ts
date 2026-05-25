import nunjucks from 'nunjucks'

/**
 * Per-call Nunjucks environment. Don't share state across calls (templates may
 * be added/removed at runtime, e.g. the pdf.ts --template override flow).
 */
export function getTemplateEnv(templatesDir: string): nunjucks.Environment {
  return nunjucks.configure(templatesDir, {
    autoescape: false,
    throwOnUndefined: false,
  })
}

/**
 * Standalone Nunjucks env that renders a single string template, with file
 * loader rooted at the given dir so {% include %} still works.
 */
export function renderStringTemplate(rootDir: string, raw: string, vars: Record<string, unknown>): string {
  const env = nunjucks.configure(rootDir, { autoescape: false })
  return env.renderString(raw, vars)
}
