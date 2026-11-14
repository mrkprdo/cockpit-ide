// Markdown → HTML rendering for the MonacoEditorWindow markdown-preview tabs
// (and, historically, the standalone MarkdownWindow). Escapes raw HTML and
// blocks javascript: links.

import { marked, Renderer } from 'marked';

/**
 * Escape inline markdown text for HTML output.
 *
 * marked gives a custom renderer the RAW token text (not the escaped form the
 * default renderers use), so anything interpolated from `text` — link labels,
 * image alt text — must be escaped here or it becomes live HTML in the preview.
 */
function escapeInline(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Render markdown to a safe `.md-content` HTML string (or a status message). */
export function renderMarkdownToHtml(text: string): string {
  if (!text.trim()) {
    return '<div class="md-status">Empty file</div>';
  }
  try {
    const renderer = new Renderer();
    renderer.html = ({ text: rawHtml }: { text: string }) => {
      return rawHtml.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };
    renderer.link = ({ href, text: linkText }: { href: string; text: string }) => {
      if (href && /^javascript:/i.test(href)) {
        return `<span>${escapeInline(linkText)}</span>`;
      }
      const safeHref = (href ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      // The label is raw token text, NOT pre-escaped: marked hands the renderer
      // the unescaped source, so `[<img src=x onerror=…>](url)` used to emit live
      // HTML into the preview pane. Escape it here.
      return `<a href="${safeHref}">${escapeInline(linkText)}</a>`;
    };
    const html = marked.parse(text, { breaks: true, renderer }) as string;
    return `<div class="md-content">${html}</div>`;
  } catch {
    return '<div class="md-status is-error">Render error</div>';
  }
}
