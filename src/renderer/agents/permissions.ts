import type { PermissionMode, SubAgentDefinition } from './types';

/**
 * Permission layer — Claude-Code-style `Tool(pattern)` allow/deny/ask matchers.
 *
 * Grammar: `Tool(glob)` where Tool ∈ Read | Write | Edit | Bash | Grep |
 * WebFetch | Agent | * and glob is a minimatch-style pattern over the tool's
 * primary argument (command for Bash, path for file tools, agent id for Agent).
 * A bare tool name (`"Read"`) matches the tool with any args.
 *
 * Evaluation order: **deny > ask > allow > mode default** — a single deny hit
 * blocks even if an allow also matches. Path patterns are normalized to `/`
 * with `.`/`..` resolved and rooted at the workspace path.
 */

export type PermissionDecision = 'allow' | 'deny' | 'ask' | 'unset';

export interface PermissionRule {
  tool: string;    // 'Bash' | 'Read' | ... | '*'
  pattern: string; // glob over the primary arg ('' = any)
}

/** Map a rule Tool family to the actual tool names it governs. */
export const TOOL_FAMILIES: Record<string, string[]> = {
  Read: ['read_file', 'list_directory', 'read_editor', 'get_editor_state', 'get_selected_text', 'read_terminal', 'get_canvas_state', 'git_diff', 'git_log', 'git_status', 'git_branches', 'specs_explore', 'specs_validate', 'specs_reload', 'memory_list', 'memory_get', 'memory_search'],
  Write: ['write_file', 'create_directory', 'rename_file', 'copy_file', 'set_editor_content', 'insert_text_in_editor', 'git_stage', 'git_unstage', 'git_commit', 'git_checkout', 'git_push', 'specs_reconcile', 'memory_set', 'memory_delete'],
  Edit: ['write_file', 'set_editor_content', 'insert_text_in_editor', 'delete_file', 'rename_file', 'copy_file', 'create_directory'],
  Bash: ['write_to_terminal', 'send_key_to_terminal', 'kill_terminal'],
  Grep: ['grep_workspace'],
  WebFetch: ['open_external'],
  Agent: ['agent_spawn', 'agent_dispatch', 'agent_kill', 'agent_wait', 'agent_status'],
};

/** Extract the primary argument a pattern is matched against, per family. */
function primaryArg(family: string, args: Record<string, unknown>): string {
  switch (family) {
    case 'Bash': return typeof args.command === 'string' ? args.command : '';
    case 'Grep': return typeof args.dir === 'string' ? args.dir : '';
    case 'Agent':
      for (const k of ['agent', 'skill', 'agent_id', 'correlation_id']) {
        if (typeof args[k] === 'string') return args[k];
      }
      return '';
    default: // Read / Write / Edit / WebFetch / *
      for (const k of ['path', 'file_path', 'old_path', 'new_path', 'src', 'dest', 'url']) {
        if (typeof args[k] === 'string') return args[k];
      }
      return '';
  }
}

/** The family a real tool name belongs to (or its own name for `*` rules). */
export function familyForTool(toolName: string): string {
  for (const [family, tools] of Object.entries(TOOL_FAMILIES)) {
    if (tools.includes(toolName)) return family;
  }
  return toolName;
}

/**
 * Parse a rule string like `Bash(npm run test *)` or bare `Read`.
 * Returns null for malformed input (never throws).
 */
export function parseRule(rule: string): PermissionRule | null {
  const text = rule.trim();
  if (!text) return null;
  const m = /^([A-Za-z*][A-Za-z0-9_*]*)\s*\(\s*(.*?)\s*\)$/.exec(text);
  if (m) return { tool: m[1], pattern: m[2] };
  // Bare tool name → matches any args.
  if (/^[A-Za-z*][A-Za-z0-9_*]*$/.test(text)) return { tool: text, pattern: '' };
  return null;
}

/** Escape a literal glob into a regex fragment. */
function globToRegex(glob: string, pathMode: boolean): string {
  // Drop a leading './' so patterns match workspace-relative normalized paths.
  let norm = glob.replace(/\\/g, '/').replace(/^\.\//, '');
  let out = '';
  for (let i = 0; i < norm.length; i++) {
    const c = norm[i];
    if (c === '*') {
      if (norm[i + 1] === '*') {
        out += '.*';
        i++;
      } else {
        out += pathMode ? '[^/]*' : '.*';
      }
    } else if ('.()[]{}^$+|?'.includes(c)) {
      out += '\\' + c;
    } else {
      out += c;
    }
  }
  return out;
}

/** Compile a glob pattern to a RegExp (anchored). Empty pattern matches anything. */
export function compilePattern(pattern: string, pathMode = true): RegExp {
  if (!pattern) return /.*/;
  return new RegExp(`^${globToRegex(pattern, pathMode)}${pattern.endsWith('**') ? '' : '$'}`);
}

/** Normalize a path for matching: forward slashes, resolve ./ and ../. */
export function normalizePath(p: string, wsPath = ''): string {
  let norm = p.replace(/\\/g, '/');
  const wasAbsolute = norm.startsWith('/');
  norm = norm.replace(/^[A-Za-z]:\//, '/');
  const parts: string[] = [];
  for (const seg of norm.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') { parts.pop(); continue; }
    parts.push(seg);
  }
  let rel = parts.join('/');
  let strippedWs = false;
  if (wsPath) {
    const ws = wsPath.replace(/\\/g, '/').replace(/^[A-Za-z]:\//, '/').replace(/\/+$/, '').replace(/^\.\//, '');
    const wsNoSlash = ws.replace(/^\//, '');
    if (wsNoSlash && (rel === wsNoSlash || rel.startsWith(wsNoSlash + '/'))) {
      rel = rel.slice(wsNoSlash.length).replace(/^\//, '');
      strippedWs = true;
    }
  }
  // Absolute paths keep a leading slash UNLESS the workspace prefix was stripped
  // (patterns are then workspace-relative, so no leading slash is expected).
  if (wasAbsolute && !strippedWs) return '/' + rel;
  return rel;
}

/** Does a parsed rule match a specific tool invocation? */
export function ruleMatches(rule: PermissionRule, toolName: string, args: Record<string, unknown>, wsPath = ''): boolean {
  const effFamily = rule.tool === '*' ? familyForTool(toolName) : rule.tool;
  if (rule.tool !== '*' && effFamily !== familyForTool(toolName) && rule.tool !== toolName) {
    return false;
  }
  const arg = primaryArg(effFamily, args);
  const isPath = ['Read', 'Write', 'Edit'].includes(effFamily);

  if (!isPath) {
    // Command / id / url matching: `*` spans everything (no path semantics).
    return compilePattern(rule.pattern, false).test(arg);
  }

  const target = normalizePath(arg, wsPath);
  const hasSlash = rule.pattern.replace(/\\/g, '/').replace(/^\.\//, '').includes('/');
  if (hasSlash) {
    return compilePattern(rule.pattern, true).test(target);
  }
  // No slash in the pattern → match the basename too (Write(.env) matches a/.env).
  const base = target.split('/').pop() || target;
  const re = compilePattern(rule.pattern, true);
  return re.test(target) || re.test(base);
}

/** A parsed permission set (all buckets flattened to rules). */
export interface ParsedPermissions {
  allow: PermissionRule[];
  deny: PermissionRule[];
  ask: PermissionRule[];
}

export function parsePermissions(perms: { allow?: string[]; deny?: string[]; ask?: string[] } | undefined): ParsedPermissions {
  const pick = (bucket?: string[]) => (bucket ?? [])
    .map(parseRule)
    .filter((r): r is PermissionRule => r !== null);
  return { allow: pick(perms?.allow), deny: pick(perms?.deny), ask: pick(perms?.ask) };
}

/**
 * Evaluate a tool invocation against a definition's permission patterns.
 * Order: deny > ask > allow > unset.
 */
export function evaluatePermission(
  def: SubAgentDefinition,
  toolName: string,
  args: Record<string, unknown>,
  wsPath = '',
): PermissionDecision {
  const parsed = parsePermissions(def.permissions);
  if (parsed.deny.some(r => ruleMatches(r, toolName, args, wsPath))) return 'deny';
  if (parsed.ask.some(r => ruleMatches(r, toolName, args, wsPath))) return 'ask';
  if (parsed.allow.some(r => ruleMatches(r, toolName, args, wsPath))) return 'allow';
  return 'unset';
}

/** Tools considered mutating for plan/acceptEdits defaults. */
export const WRITE_TOOLS = new Set<string>(TOOL_FAMILIES.Write.concat(TOOL_FAMILIES.Edit, TOOL_FAMILIES.Bash));

/**
 * Apply the session-level permission mode to a raw decision.
 * Returns the effective verdict the session acts on.
 *
 * Modes (doc §L1):
 *  default    → allow/deny/ask as matched; unset = reads allowed, writes denied
 *  acceptEdits→ Write/Edit auto-approved; Bash still gated
 *  auto       → allow + ask both approved (deny still blocks)
 *  plan       → read-only: all writes/bash denied, reads allowed
 *  dontAsk    → only explicit allow runs; everything else denied
 */
export function applyMode(decision: PermissionDecision, mode: PermissionMode | undefined, toolName: string): PermissionDecision {
  const m = mode ?? 'acceptEdits';
  const isWrite = WRITE_TOOLS.has(toolName);

  switch (m) {
    case 'plan':
      return isWrite ? 'deny' : (decision === 'deny' ? 'deny' : 'allow');
    case 'dontAsk':
      return decision === 'allow' ? 'allow' : 'deny';
    case 'auto':
      return decision === 'deny' ? 'deny' : 'allow';
    case 'default':
      if (decision === 'deny') return 'deny';
      if (decision === 'ask') return 'ask';
      if (decision === 'allow') return 'allow';
      return isWrite ? 'deny' : 'allow';
    case 'acceptEdits':
    default:
      if (decision === 'deny') return 'deny';
      // Write/Edit auto-approved under acceptEdits; Bash and agent tools still gated.
      const writeFamily = TOOL_FAMILIES.Write.includes(toolName) || TOOL_FAMILIES.Edit.includes(toolName);
      if (writeFamily) return 'allow';
      return decision === 'unset' ? 'deny' : decision;
  }
}
