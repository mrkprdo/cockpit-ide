/**
 * Agent fleet barrel.
 *
 * - types.ts  — envelope/brief/status contracts
 * - bus.ts    — pub/sub transport, mailboxes, collector ("who captures what")
 * - skills.ts — SDLC skill registry + code-enforced guardrails
 * - prompts.ts— skill prompt templates + orchestration section
 * - session.ts— headless SubAgentSession loop (short context + compaction)
 * - executor.ts — AgentExecutor singleton (spawn/kill/status/dispatch/wait)
 */
export * from './types';
export * from './bus';
export * from './skills';
export * from './definitions';
export * from './definition-file';
export * from './permissions';
export * from './hooks';
export * from './memory-scopes';
export * from './prompts';
export * from './session';
export * from './executor';
