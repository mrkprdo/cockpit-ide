import { describe, it, expect } from 'vitest';
import { completionUrl, isResponsesModel, resolveProtocol } from './llm-protocol';

describe('resolveProtocol', () => {
  it('uses Chat Completions for open models on the OpenAI base', () => {
    expect(resolveProtocol('https://opencode.ai/inference/openai/v1', 'kimi-k3')).toBe('chat');
  });

  it('uses Responses for GPT models on the OpenAI base', () => {
    expect(resolveProtocol('https://opencode.ai/inference/openai/v1', 'gpt-6.1-sol')).toBe('responses');
    expect(resolveProtocol('https://opencode.ai/inference/openai/v1', 'o4-mini')).toBe('responses');
  });

  it('detects the Anthropic family from the endpoint path', () => {
    expect(resolveProtocol('https://opencode.ai/inference/anthropic/v1', 'claude-sonnet-5-5')).toBe('messages');
  });

  it('honours an endpoint that already names the operation', () => {
    expect(resolveProtocol('https://x/v1/chat/completions', 'gpt-4')).toBe('chat');
    expect(resolveProtocol('https://x/v1/responses', 'anything')).toBe('responses');
  });

  it('leaves the legacy Go/Zen base on Chat Completions', () => {
    expect(resolveProtocol('https://opencode.ai/zen/go/v1', 'deepseek-v4-flash')).toBe('chat');
  });

  it('does not treat a GPT-named model as Responses on an unrelated gateway', () => {
    expect(resolveProtocol('https://api.example.com/v1', 'gpt-4')).toBe('chat');
  });
});

describe('completionUrl', () => {
  it('appends the operation for each protocol', () => {
    expect(completionUrl('https://opencode.ai/inference/openai/v1/', 'chat'))
      .toBe('https://opencode.ai/inference/openai/v1/chat/completions');
    expect(completionUrl('https://opencode.ai/inference/openai/v1', 'responses'))
      .toBe('https://opencode.ai/inference/openai/v1/responses');
    expect(completionUrl('https://opencode.ai/inference/anthropic/v1', 'messages'))
      .toBe('https://opencode.ai/inference/anthropic/v1/messages');
  });

  it('never double-appends when the endpoint is already complete', () => {
    expect(completionUrl('https://x/chat/completions', 'chat')).toBe('https://x/chat/completions');
    expect(completionUrl('https://x/responses', 'responses')).toBe('https://x/responses');
  });
});

describe('isResponsesModel', () => {
  it('matches gpt/o-series ids only', () => {
    expect(isResponsesModel('gpt-6.1-sol')).toBe(true);
    expect(isResponsesModel('o3')).toBe(true);
    expect(isResponsesModel('kimi-k3')).toBe(false);
    expect(isResponsesModel('deepseek-v4-flash')).toBe(false);
  });
});
