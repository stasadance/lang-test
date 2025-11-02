import { Tool } from "@langchain/core/tools";
import axios from "axios";

interface SearxNGResult {
    title: string;
    url: string;
    content: string;
    engine?: string;
}

interface SearxNGResponse {
    results: SearxNGResult[];
    query: string;
}

export interface StructuredSearchResult {
    title: string;
    url: string;
    snippet: string;
    relevanceScore?: number;
}

export class SearxNGSearchTool extends Tool {
    name = "searxng-search";
    description =
        "Searches SearxNG for information. Input should be a search query string. Returns a list of search results with titles, URLs, and snippets.";

    constructor() {
        super();
    }

    async _call(query: string): Promise<string> {
        try {
            const response = await axios.get<SearxNGResponse>(
                `${process.env.SEARXNG_BASE_URL}/search`,
                {
                    params: {
                        q: query,
                        format: "json",
                        language: "en",
                    },
                    timeout: 10_000,
                },
            );

            if (!response.data.results || response.data.results.length === 0) {
                return "No results found for the query.";
            }

            const results = response.data.results
                .slice(0, 5)
                .map((result, index) => {
                    return `${index + 1}. ${result.title}\n   URL: ${
                        result.url
                    }\n   Snippet: ${result.content || "No description available"}`;
                });

            return results.join("\n\n");
        } catch (error) {
            if (axios.isAxiosError(error)) {
                return `Error searching SearxNG: ${error.message}`;
            }
            return `Error: ${error}`;
        }
    }

    /**
     * Returns structured search results instead of formatted text
     * @param query The search query
     * @param maxResults Maximum number of results to return (default: 5)
     * @returns Array of structured search results
     */
    async getStructuredResults(
        query: string,
        maxResults: number = 5,
    ): Promise<StructuredSearchResult[]> {
        const maxRetries = 3;
        const retryDelay = 3000; // 3 seconds

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await axios.get<SearxNGResponse>(
                    `${process.env.SEARXNG_BASE_URL}/search`,
                    {
                        params: {
                            q: query,
                            format: "json",
                            language: "en",
                        },
                        timeout: 10_000,
                    },
                );

                if (
                    !response.data.results ||
                    response.data.results.length === 0
                ) {
                    if (attempt < maxRetries) {
                        console.log(
                            `   ⚠️  No results for "${query}" (attempt ${attempt}/${maxRetries}), retrying in ${retryDelay / 1000}s...`,
                        );
                        await new Promise((resolve) =>
                            setTimeout(resolve, retryDelay),
                        );
                        continue;
                    }
                    console.log(
                        `   ℹ️  No results found for "${query}" after ${maxRetries} attempts`,
                    );
                    return [];
                }

                return response.data.results
                    .slice(0, maxResults)
                    .map((result) => ({
                        title: result.title,
                        url: result.url,
                        snippet: result.content || "No description available",
                    }));
            } catch (error) {
                if (attempt < maxRetries) {
                    console.error(
                        `   ⚠️  Error searching SearxNG (attempt ${attempt}/${maxRetries}): ${error}`,
                    );
                    console.log(`   Retrying in ${retryDelay / 1000}s...`);
                    await new Promise((resolve) =>
                        setTimeout(resolve, retryDelay),
                    );
                } else {
                    console.error(
                        `   ❌ Failed to search SearxNG after ${maxRetries} attempts: ${error}`,
                    );
                    return [];
                }
            }
        }

        return [];
    }
}
