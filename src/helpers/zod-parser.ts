import { z } from "zod";
import { $ZodTypeDef } from "zod/v4/core";

export type ZodTypeStr = $ZodTypeDef["type"] | "uuid" | "email" | "relation";

const relationMetaSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("to-one"),
    sourceKey: z.string(),
    targetKey: z.string(),
    targetTable: z.string(),
  }),
  z.object({
    type: z.literal("to-many"),
    joinTable: z.string(),
    joinTargetKey: z.string(),
    joinSourceKey: z.string(),
    targetTable: z.string(),
  }),
]);

export type RelationMeta = z.infer<typeof relationMetaSchema>;
export interface ParsedZodType {
  type: ZodTypeStr;
  isNullable: boolean;
  isOptional: boolean;
  isArray: boolean;
  relationMeta?: RelationMeta;
  enumValues?: string[];
  baseType?: string;
  schema?: Record<string, ParsedZodType>;
}
export interface ParsedZodObj {
  [key: string]: ParsedZodType | ParsedZodObj;
}

function parseZodObj(schema: z.ZodObject<any>): Record<string, ParsedZodType> {
  const properties: Record<string, ParsedZodType> = {};

  if (!(schema.def && schema.def.type === "object" && "shape" in schema.def)) {
    throw new Error("Invalid input obj provided!");
  }
  const shape = schema.def.shape as Record<string, z.ZodType>;

  for (const [key, value] of Object.entries(shape)) {
    properties[key] = parseZodType(value);
  }

  return properties;
}

export function parseZodType(type: z.ZodType): ParsedZodType {
  let currentType = type;
  let isNullable = false;
  let isOptional = false;
  let isArray = false;
  let schema: Record<string, ParsedZodType> | undefined;
  let enumValues: string[] | undefined;
  let relationMeta: RelationMeta | undefined;
  let baseType: ZodTypeStr | undefined;

  // Unwrap layers to find the base type
  while (true) {
    const def = currentType.def;

    if (!def) {
      break;
    }

    if (def.type === "optional") {
      isOptional = true;
      if ("innerType" in def && def.innerType) {
        currentType = def.innerType as z.ZodType;
      } else {
        break;
      }
    } else if (def.type === "nullable") {
      isNullable = true;
      if ("innerType" in def && def.innerType) {
        currentType = def.innerType as z.ZodType;
      } else {
        break;
      }
    } else if (def.type === "array") {
      isArray = true;
      if ("element" in def && def.element) {
        currentType = def.element as z.ZodType;
      } else {
        break;
      }
    } else if (def.type === "enum") {
      // Try to access enum values - they might be in different properties
      if ("entries" in def && def.entries) {
        enumValues = Object.keys(def.entries);
      } else if ("values" in def && Array.isArray(def.values)) {
        enumValues = def.values as string[];
      } else if ("_def" in def && "values" in (def as any)._def) {
        enumValues = (def as any)._def.values as string[];
      }
      break;
    } else if (def.type === "union") {
      // Handle union types by taking the first option for now
      if (
        "options" in def &&
        Array.isArray(def.options) &&
        def.options.length > 0
      ) {
        currentType = def.options[0] as unknown as z.ZodType;
        continue;
      } else {
        break;
      }
    } else {
      // Base type found
      if (def.type === "object") {
        // Handle relations by checking if meta exists and can be parsed
        const meta = currentType.meta();
        const parsedMeta = relationMetaSchema.safeParse(meta);
        try {
          schema = parseZodObj(currentType as any);
        } catch {}
        if (parsedMeta.success) {
          baseType = "relation";
          relationMeta = parsedMeta.data;
          break;
        }
      }
      baseType = def.type;

      break;
    }
  }

  // Special handling for specific types
  const finalDef = currentType.def;
  if (baseType === "number" && finalDef) {
    // Check if it's an integer by looking at the ZodNumber instance
    if ("isInt" in currentType && (currentType as any).isInt === true) {
      baseType = "int";
    } else if ("checks" in finalDef) {
      // Fallback: check the checks array
      const checks = (finalDef as any).checks || [];
      if (checks.some((check: any) => check.kind === "int")) {
        baseType = "int";
      }
    }
  } else if (baseType === "string" && finalDef) {
    // Check for UUID and email by looking at the checks array and format
    const checks = (finalDef as any).checks || [];
    if (
      checks.some(
        (check: any) => check.kind === "uuid" || check.format === "uuid"
      ) ||
      (finalDef as any).format === "uuid"
    ) {
      baseType = "uuid";
    } else if (
      checks.some(
        (check: any) => check.kind === "email" || check.format === "email"
      )
    ) {
      baseType = "email";
    }
  } else if (baseType === "uuid") {
    // Handle z.uuid() directly
    baseType = "uuid";
  } else if (finalDef.type === "enum") {
    baseType = "enum";
  }

  if (baseType === undefined) {
    throw new Error(`UNHANDLED_BASE_TYPE: ${baseType}`);
  }

  const result = {
    type: baseType || currentType.def?.type || "unknown",
    isNullable,
    isOptional,
    isArray,
    enumValues,
    baseType,
    schema,
    relationMeta,
  };

  return result;
}

// // Test cases based on the provided schemas
// function runTests() {
//   logger.log("=== RUNNING ZOD PARSER TESTS ===");

//   // Test 1: Basic types
//   logger.log("\n--- Test 1: Basic types ---");
//   const stringType = parseZodType(z.string());
//   assert(stringType.type === "string", "String type should be 'string'");
//   assert(stringType.isNullable === false, "String should not be nullable");
//   assert(stringType.isOptional === false, "String should not be optional");

//   const numberType = parseZodType(z.number());
//   assert(numberType.type === "number", "Number type should be 'number'");
//   assert(numberType.isNullable === false, "Number should not be nullable");

//   const booleanType = parseZodType(z.boolean());
//   assert(booleanType.type === "boolean", "Boolean type should be 'boolean'");

//   // Test 2: Nullable types
//   logger.log("\n--- Test 2: Nullable types ---");
//   const nullableString = parseZodType(z.string().nullable());
//   assert(
//     nullableString.type === "string",
//     "Nullable string type should be 'string'"
//   );
//   assert(
//     nullableString.isNullable === true,
//     "Nullable string should be nullable"
//   );
//   assert(
//     nullableString.isOptional === false,
//     "Nullable string should not be optional"
//   );

//   const nullableNumber = parseZodType(z.number().nullable());
//   assert(
//     nullableNumber.type === "number",
//     "Nullable number type should be 'number'"
//   );
//   assert(
//     nullableNumber.isNullable === true,
//     "Nullable number should be nullable"
//   );

//   // Test 3: Optional types
//   logger.log("\n--- Test 3: Optional types ---");
//   const optionalString = parseZodType(z.string().optional());
//   assert(
//     optionalString.type === "string",
//     "Optional string type should be 'string'"
//   );
//   assert(
//     optionalString.isNullable === false,
//     "Optional string should not be nullable"
//   );
//   assert(
//     optionalString.isOptional === true,
//     "Optional string should be optional"
//   );

//   const optionalNumber = parseZodType(z.number().optional());
//   assert(
//     optionalNumber.type === "number",
//     "Optional number type should be 'number'"
//   );
//   assert(
//     optionalNumber.isOptional === true,
//     "Optional number should be optional"
//   );

//   // Test 4: Combined nullable and optional
//   logger.log("\n--- Test 4: Combined nullable and optional ---");
//   const nullableOptionalString = parseZodType(z.string().nullable().optional());
//   assert(
//     nullableOptionalString.type === "string",
//     "Nullable optional string type should be 'string'"
//   );
//   assert(
//     nullableOptionalString.isNullable === true,
//     "Nullable optional string should be nullable"
//   );
//   assert(
//     nullableOptionalString.isOptional === true,
//     "Nullable optional string should be optional"
//   );

//   const optionalNullableNumber = parseZodType(z.number().optional().nullable());
//   assert(
//     optionalNullableNumber.type === "number",
//     "Optional nullable number type should be 'number'"
//   );
//   assert(
//     optionalNullableNumber.isNullable === true,
//     "Optional nullable number should be nullable"
//   );
//   assert(
//     optionalNullableNumber.isOptional === true,
//     "Optional nullable number should be optional"
//   );

//   // Test 5: Array types
//   logger.log("\n--- Test 5: Array types ---");
//   const stringArray = parseZodType(z.array(z.string()));
//   assert(stringArray.type === "string", "String array type should be 'string'");
//   assert(stringArray.isArray === true, "String array should be array");
//   assert(
//     stringArray.isNullable === false,
//     "String array should not be nullable"
//   );

//   const nullableStringArray = parseZodType(z.array(z.string()).nullable());
//   assert(
//     nullableStringArray.type === "string",
//     "Nullable string array type should be 'string'"
//   );
//   assert(
//     nullableStringArray.isArray === true,
//     "Nullable string array should be array"
//   );
//   assert(
//     nullableStringArray.isNullable === true,
//     "Nullable string array should be nullable"
//   );

//   // Test 6: Enum types
//   logger.log("\n--- Test 6: Enum types ---");
//   const enumType = parseZodType(z.enum(["email", "phone"]));
//   assert(enumType.type === "enum", "Enum type should be 'enum'");
//   assert(
//     !!enumType.enumValues?.includes("email"),
//     "Enum should contain 'email'"
//   );
//   assert(
//     !!enumType.enumValues?.includes("phone"),
//     "Enum should contain 'phone'"
//   );

//   const nullableEnum = parseZodType(
//     z
//       .enum(["pending", "sending", "sent", "missed", "cancelled", "error"])
//       .nullable()
//   );
//   assert(nullableEnum.type === "enum", "Nullable enum type should be 'enum'");
//   assert(nullableEnum.isNullable === true, "Nullable enum should be nullable");
//   assert(
//     !!nullableEnum.enumValues?.includes("pending"),
//     "Nullable enum should contain 'pending'"
//   );

//   // Test 7: Special types
//   logger.log("\n--- Test 7: Special types ---");
//   const intType = parseZodType(z.int());
//   assert(intType.type === "int", "Int type should be 'int' not 'number'");

//   const uuidType1 = parseZodType(z.uuid());
//   assert(uuidType1.type === "uuid", "UUID type should be 'uuid' not 'string'");

//   const uuidType2 = parseZodType(z.string().uuid());
//   assert(
//     uuidType2.type === "uuid",
//     "String UUID type should be 'uuid' not 'string'"
//   );

//   const anyType = parseZodType(z.any());
//   assert(anyType.type === "any", "Any type should be 'any'");

//   const unknownType = parseZodType(z.unknown());
//   assert(unknownType.type === "unknown", "Unknown type should be 'unknown'");

//   // Test 8: Date types
//   logger.log("\n--- Test 8: Date types ---");
//   const dateType = parseZodType(z.date());
//   assert(dateType.type === "date", "Date type should be 'date'");

//   const coerceDateType = parseZodType(z.coerce.date());
//   assert(coerceDateType.type === "date", "Coerce date type should be 'date'");

//   // Test 9: Complex combinations from actual schemas
//   logger.log("\n--- Test 9: Complex combinations from actual schemas ---");

//   // From customers.preferred_mode_of_contact
//   const complexEnum = parseZodType(
//     z.enum(["email", "phone"]).nullable().optional()
//   );
//   assert(complexEnum.type === "enum", "Complex enum type should be 'enum'");
//   assert(complexEnum.isNullable === true, "Complex enum should be nullable");
//   assert(complexEnum.isOptional === true, "Complex enum should be optional");
//   assert(
//     complexEnum.enumValues?.length === 2,
//     "Complex enum should have 2 values"
//   );

//   // From events.id
//   const intOptional = parseZodType(z.number().int().optional());
//   assert(intOptional.type === "int", "Int optional type should be 'int'");
//   assert(intOptional.isOptional === true, "Int optional should be optional");

//   // From whatnot_shows.show_categories
//   const stringArrayOptional = parseZodType(z.array(z.string()).optional());
//   assert(
//     stringArrayOptional.type === "string",
//     "String array optional type should be 'string'"
//   );
//   assert(
//     stringArrayOptional.isArray === true,
//     "String array optional should be array"
//   );
//   assert(
//     stringArrayOptional.isOptional === true,
//     "String array optional should be optional"
//   );

//   // From notifications.status
//   const statusEnum = parseZodType(
//     z.enum(["pending", "sending", "sent", "missed", "cancelled", "error"])
//   );
//   assert(statusEnum.type === "enum", "Status enum type should be 'enum'");
//   assert(
//     statusEnum.enumValues?.length === 6,
//     "Status enum should have 6 values"
//   );

//   logger.log("\n=== ALL TESTS PASSED ===");
// }

// function assert(condition: boolean, message: string) {
//   if (!condition) {
//     throw new Error(`Assertion failed: ${message}`);
//   }
//   logger.log(`✓ ${message}`);
// }

// // Run tests when this module is imported
// runTests();

// export { runTests };
