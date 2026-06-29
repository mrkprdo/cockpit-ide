import { z } from 'zod';

/**
 * Convert a Zod schema into a JSON Schema object suitable for OpenAI function calling.
 * Supports the subset of Zod used by the agent tool definitions:
 * object, string, number, boolean, enum, optional, default, array, literal, nullable, any.
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = (schema as z.AnyZodObject).shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value);
      if (!isOptionalLike(value)) required.push(key);
    }
    return { type: 'object', properties, required };
  }

  if (schema instanceof z.ZodString) return { type: 'string' };
  if (schema instanceof z.ZodNumber) return { type: 'number' };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };

  if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault || schema instanceof z.ZodNullable) {
    return zodToJsonSchema(schema.unwrap());
  }

  if (schema instanceof z.ZodEnum) {
    return { type: 'string', enum: schema.options };
  }

  if (schema instanceof z.ZodNativeEnum) {
    const values = Object.values(schema.enum);
    return { type: typeof values[0] === 'number' ? 'integer' : 'string', enum: values };
  }

  if (schema instanceof z.ZodLiteral) {
    const t = typeof schema.value;
    return { type: t === 'boolean' ? 'boolean' : t === 'number' ? 'number' : 'string', const: schema.value };
  }

  if (schema instanceof z.ZodArray) {
    return { type: 'array', items: zodToJsonSchema(schema.element) };
  }

  if (schema instanceof z.ZodUnion) {
    const literals = schema.options.filter((o: z.ZodTypeAny) => o instanceof z.ZodLiteral);
    if (literals.length === schema.options.length) {
      const values = literals.map((l: z.ZodLiteral<any>) => l.value);
      const t = typeof values[0];
      return {
        type: t === 'number' ? 'number' : t === 'boolean' ? 'boolean' : 'string',
        enum: values,
      };
    }
    return { anyOf: schema.options.map((o: z.ZodTypeAny) => zodToJsonSchema(o)) };
  }

  if (schema instanceof z.ZodRecord) {
    return { type: 'object', additionalProperties: true };
  }

  // Fallback for ZodAny / ZodUnknown / unsupported
  return {};
}

function isOptionalLike(schema: z.ZodTypeAny): boolean {
  return schema instanceof z.ZodOptional || schema instanceof z.ZodDefault;
}
