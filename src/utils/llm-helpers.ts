/**
 * Utility functions for working with LLM responses
 */

import { z } from "zod";

/**
 * Extracts and parses JSON from an LLM response that may contain extra text.
 * Handles cases where the LLM includes chain-of-thought reasoning before/after the JSON.
 *
 * @param responseText - The raw text response from the LLM
 * @param schema - Optional Zod schema for validation
 * @returns The parsed and validated object
 * @throws Error if no valid JSON object is found, parsing fails, or validation fails
 */
export function extractJsonFromLLMResponse<T extends z.ZodTypeAny>(
    responseText: string,
    schema?: T,
): z.infer<T> {
    let jsonText = responseText.trim();

    // If response doesn't start with {, try to extract the JSON object
    if (!jsonText.startsWith("{")) {
        // Find the first { and last } to extract the JSON object
        const firstBrace = jsonText.indexOf("{");
        const lastBrace = jsonText.lastIndexOf("}");

        if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
            throw new Error(
                "No valid JSON object found in LLM response. Response must contain a JSON object enclosed in curly braces.",
            );
        }

        jsonText = jsonText.slice(firstBrace, lastBrace + 1);
    }

    try {
        const parsed = JSON.parse(jsonText);

        // If schema is provided, validate and parse with Zod
        if (schema) {
            return schema.parse(parsed);
        }

        return parsed;
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw new Error(
                `Failed to validate LLM response against schema: ${error.message}`,
            );
        }
        throw new Error(
            `Failed to parse JSON from LLM response: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

/**
 * Creates a prompt template for requesting structured JSON output from an LLM.
 *
 * @param task - Description of what the LLM should do
 * @param schema - Zod schema or JSON schema string
 * @param additionalInstructions - Optional additional instructions
 * @returns A formatted prompt string
 */
export function createJsonPrompt<T extends z.ZodTypeAny>(
    task: string,
    schema: T | string,
    additionalInstructions?: string,
): string {
    // Convert Zod schema to JSON schema if needed
    const jsonSchemaString =
        typeof schema === "string"
            ? schema
            : JSON.stringify(z.toJSONSchema(schema), undefined, 2);

    return `${task}

You MUST respond with valid JSON in this exact format:
${jsonSchemaString}

${additionalInstructions || ""}

IMPORTANT: Respond with ONLY the JSON object, no additional text or explanation before or after.`.trim();
}
