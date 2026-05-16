import { z } from 'zod/v3';

/**
 * Convert a Zod schema into a JSON Schema object suitable for OpenAI function calling.
 * Supports the subset of Zod used by the agent tool definitions:
 * object, string, number, boolean, enum, optional, default, array, literal, nullable, any.
 *
 * Implementation note: the schema is treated as `any` during introspection because
 * the installed Zod package is in a transitional state (v4 packaging with a v3
 * runtime bundle). The runtime checks below are compatible with the v3 runtime.
 */
export function zodToJsonSchema(schema: any): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, any>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const key of Object.keys(shape)) {
      properties[key] = zodToJsonSchema(shape[key]);
      if (!isOptionalLike(shape[key])) required.push(key);
    }
    return { type: 'object', properties, required };
  }

  if (schema instanceof z.ZodString) return { type: 'string' };
  if (schema instanceof z.ZodNumber) return { type: 'number' };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };

  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return zodToJsonSchema((schema as any).unwrap());
  }
  if (schema instanceof z.ZodDefault) {
    // ZodDefault in the v3 runtime bundle does not expose .unwrap(); use _def.innerType.
    return zodToJsonSchema(schema._def.innerType);
  }

  if (schema instanceof z.ZodEnum) {
    return { type: 'string', enum: schema.options };
  }

  if (schema instanceof z.ZodLiteral) {
    const t = typeof schema.value;
    return { type: t === 'boolean' ? 'boolean' : t === 'number' ? 'number' : 'string', const: schema.value };
  }

  if (schema instanceof z.ZodArray) {
    return { type: 'array', items: zodToJsonSchema((schema as any).element) };
  }

  if (schema instanceof z.ZodUnion) {
    const options = (schema as any).options as any[];
    const literals = options.filter(o => o instanceof z.ZodLiteral);
    if (literals.length === options.length) {
      const values = literals.map(l => l.value);
      const t = typeof values[0];
      return {
        type: t === 'number' ? 'number' : t === 'boolean' ? 'boolean' : 'string',
        enum: values,
      };
    }
    return { anyOf: options.map(o => zodToJsonSchema(o)) };
  }

  if (schema instanceof z.ZodRecord) {
    return { type: 'object', additionalProperties: true };
  }

  // Fallback for ZodAny / ZodUnknown / unsupported
  return {};
}

function isOptionalLike(schema: any): boolean {
  return schema instanceof z.ZodOptional || schema instanceof z.ZodDefault;
}
