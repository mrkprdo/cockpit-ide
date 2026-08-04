// Markdown → HTML rendering for the MonacoEditorWindow markdown-preview tabs
// (and, historically, the standalone MarkdownWindow). Escapes raw HTML and
// blocks javascript: links.

import { marked, Renderer } from 'marked';

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
        return `<span>${linkText}</span>`;
      }
      const safeHref = (href ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      return `<a href="${safeHref}">${linkText}</a>`;
    };
    const html = marked.parse(text, { breaks: true, renderer }) as string;
    return `<div class="md-content">${html}</div>`;
  } catch {
    return '<div class="md-status is-error">Render error</div>';
  }
}
