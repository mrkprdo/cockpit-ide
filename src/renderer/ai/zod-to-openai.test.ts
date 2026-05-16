import { describe, it, expect } from 'vitest';
import { z } from 'zod/v3';
import { zodToJsonSchema } from './zod-to-openai';

describe('zodToJsonSchema', () => {
  it('converts a string', () => {
    expect(zodToJsonSchema(z.string())).toEqual({ type: 'string' });
  });

  it('converts a number', () => {
    expect(zodToJsonSchema(z.number())).toEqual({ type: 'number' });
  });

  it('converts a boolean', () => {
    expect(zodToJsonSchema(z.boolean())).toEqual({ type: 'boolean' });
  });

  it('converts an enum to a string enum', () => {
    expect(zodToJsonSchema(z.enum(['a', 'b']))).toEqual({ type: 'string', enum: ['a', 'b'] });
  });

  it('converts a string literal to const', () => {
    expect(zodToJsonSchema(z.literal('ok'))).toEqual({ type: 'string', const: 'ok' });
  });

  it('converts a numeric literal to const', () => {
    expect(zodToJsonSchema(z.literal(42))).toEqual({ type: 'number', const: 42 });
  });

  it('converts an array of strings', () => {
    expect(zodToJsonSchema(z.array(z.string()))).toEqual({
      type: 'array',
      items: { type: 'string' },
    });
  });

  it('converts an object with required fields', () => {
    const schema = z.object({ name: z.string(), count: z.number() });
    expect(zodToJsonSchema(schema)).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
        count: { type: 'number' },
      },
      required: ['name', 'count'],
    });
  });

  it('marks optional fields as not required', () => {
    const schema = z.object({ name: z.string(), count: z.number().optional() });
    expect(zodToJsonSchema(schema)).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
        count: { type: 'number' },
      },
      required: ['name'],
    });
  });

  it('treats default-wrapped fields as optional in the schema', () => {
    const schema = z.object({ name: z.string().default('anon') });
    expect(zodToJsonSchema(schema)).toEqual({
      type: 'object',
      properties: { name: { type: 'string' } },
      required: [],
    });
  });

  it('converts a union of literals to an enum', () => {
    const schema = z.union([z.literal('a'), z.literal('b')]);
    expect(zodToJsonSchema(schema)).toEqual({ type: 'string', enum: ['a', 'b'] });
  });

  it('converts a mixed union to anyOf', () => {
    const schema = z.union([z.string(), z.number()]);
    expect(zodToJsonSchema(schema)).toEqual({
      anyOf: [{ type: 'string' }, { type: 'number' }],
    });
  });

  it('returns an empty object for unsupported types instead of throwing', () => {
    expect(zodToJsonSchema(z.undefined())).toEqual({});
  });
});
