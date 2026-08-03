// memory-domain AI tools: list/get/search/set/delete over the memory store
// (refactor.md §A.4 tool-definitions split).

import type { ToolDefinition } from '../types';
import {
  MemoryListArgs, MemoryGetArgs, MemorySearchArgs, MemorySetArgs, MemoryDeleteArgs,
} from './schemas';
import { memoryStore, type MemoryScope } from '../memory-store';

export const memoryListTool: ToolDefinition<typeof MemoryListArgs> = {
  name: 'memory_list',
  description: 'List memory entry keys/tags (no bodies). Prefer this or memory_search before memory_get. Scopes: global | workspace.',
  parameters: MemoryListArgs,
  execute: (args) => memoryStore.list(args.scope as MemoryScope | undefined),
};

export const memoryGetTool: ToolDefinition<typeof MemoryGetArgs> = {
  name: 'memory_get',
  description: 'Read one memory entry body by key or id. Use after memory_list/memory_search — do not dump all memory.',
  parameters: MemoryGetArgs,
  execute: (args) => memoryStore.get(args.scope as MemoryScope, args.key),
};

export const memorySearchTool: ToolDefinition<typeof MemorySearchArgs> = {
  name: 'memory_search',
  description: 'Search memory by key/tags/body substring. Returns ranked previews; use memory_get for full body.',
  parameters: MemorySearchArgs,
  execute: (args) => memoryStore.search(args.query, args.scope as MemoryScope | undefined),
};

export const memorySetTool: ToolDefinition<typeof MemorySetArgs> = {
  name: 'memory_set',
  description: 'Create or update a durable memory entry. Only lasting prefs, decisions, and project conventions — not chat fluff.',
  parameters: MemorySetArgs,
  execute: async (args) => memoryStore.set(args.scope as MemoryScope, args.key, args.body, args.tags),
};

export const memoryDeleteTool: ToolDefinition<typeof MemoryDeleteArgs> = {
  name: 'memory_delete',
  description: 'Delete a memory entry by key or id.',
  parameters: MemoryDeleteArgs,
  execute: async (args) => memoryStore.delete(args.scope as MemoryScope, args.key),
};
