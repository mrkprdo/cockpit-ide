// Stateless helpers shared by the AI tool definitions (refactor.md §A.4
// tool-definitions split). No class, no module state — explicit typed params.

import type { ToolContext } from '../types';
import { READABLE_LENGTH, SKIP_DIRS, TEXT_EXT, MAX_GREP_RESULTS, MAX_GREP_FILES } from './schemas';

export function readFileResult(content: string, offset = 0, limit = READABLE_LENGTH): string {
  const total = content.length;
  if (offset === 0 && total <= limit) return content;
  const end = Math.min(offset + limit, total);
  const sliced = content.slice(offset, end);
  if (end >= total) return sliced;
  return sliced + `\n---[truncated: showed chars ${offset}–${end} of ${total}. Use offset=${end}&limit=${limit} to continue]---`;
}

export function pluginTypeFromTitle(title: string): string {
  if (title.startsWith('Terminal')) return 'terminal';
  if (title === 'Explorer') return 'explorer';
  if (title === 'Git') return 'git';
  if (title === 'Markdown') return 'markdown';
  if (title === 'SpecsMap') return 'specsmap';
  if (title === 'Agents') return 'agents';
  return 'unknown';
}

export function getRepoPath(ctx: ToolContext, repoPath?: string | null): string {
  return repoPath || ctx.cockpit.getWorkspacePath() || '';
}

export async function grepWorkspace(
  ctx: ToolContext,
  dir: string,
  pattern: string,
  glob?: string,
): Promise<{ file: string; line: number; text: string }[]> {
  const results: { file: string; line: number; text: string }[] = [];
  if (!pattern || pattern.length > 200) return results;
  let re: RegExp;
  try { re = new RegExp(pattern, 'gi'); } catch { return results; }
  const extFilter = glob?.startsWith('.') ? glob : (glob ? `.${glob}` : null);
  let fileCount = 0;

  const walk = async (path: string): Promise<void> => {
    if (results.length >= MAX_GREP_RESULTS || fileCount >= MAX_GREP_FILES) return;
    const entries = await ctx.electronAPI.fs.readDir(path);
    if (!entries) return;
    for (const entry of entries) {
      if (results.length >= MAX_GREP_RESULTS || fileCount >= MAX_GREP_FILES) return;
      const full = `${path}/${entry.name}`.replace(/\\/g, '/');
      if (entry.isDirectory) {
        if (!SKIP_DIRS.has(entry.name)) await walk(full);
      } else {
        const ext = entry.name.includes('.') ? `.${entry.name.split('.').pop()!.toLowerCase()}` : '';
        if (extFilter && ext !== extFilter) continue;
        if (!TEXT_EXT.has(ext)) continue;
        fileCount++;
        const content = await ctx.electronAPI.fs.readFile(full);
        if (!content) continue;
        const lines = content.split('\n');
        lines.forEach((text, i) => {
          if (results.length < MAX_GREP_RESULTS && re.test(text)) {
            results.push({ file: full, line: i + 1, text: text.trim().slice(0, 200) });
          }
          re.lastIndex = 0;
        });
      }
    }
  };

  await walk(dir);
  return results;
}
