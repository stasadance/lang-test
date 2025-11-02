import { Tool } from "@langchain/core/tools";
import { SearchAgent, SearchResult } from "../agents/search-agent";

export class SearchAgentTool extends Tool {
    name = "search-agent";
    description =
        "Performs a comprehensive web search for a specific query. Input should be a search query string. Returns structured results including title, URL, snippet, and an AI-generated summary of the findings.";

    private searchCache = new Map<string, SearchResult>();

    constructor() {
        super();
    }

    async _call(query: string): Promise<string> {
        try {
            console.log(`   🔍 Searching: "${query}"`);

            // Check cache first
            if (this.searchCache.has(query)) {
                console.log(`   ✓ Using cached results`);
                const cached = this.searchCache.get(query)!;
                return this.formatResults(cached);
            }

            // Perform new search
            const searchAgent = new SearchAgent();
            const result = await searchAgent.search(query);

            // Cache the result
            this.searchCache.set(query, result);

            if (result.results.length === 0) {
                return `No results found for query: "${query}"`;
            }

            return this.formatResults(result);
        } catch (error) {
            console.error(`   ❌ Search failed: ${error}`);
            return `Error performing search: ${error instanceof Error ? error.message : String(error)}`;
        }
    }

    /**
     * Get structured results directly (for programmatic use)
     */
    async getStructuredResult(query: string): Promise<SearchResult> {
        await this._call(query); // This populates the cache
        return this.searchCache.get(query)!;
    }

    private formatResults(result: SearchResult): string {
        const resultsList = result.results
            .slice(0, 5)
            .map(
                (r, index) =>
                    `${index + 1}. ${r.title}\n   URL: ${r.url}\n   Snippet: ${r.snippet}`,
            )
            .join("\n\n");

        return `Search Results for "${result.query}":

${resultsList}

Summary:
${result.summary}

Total results found: ${result.results.length}`;
    }

    /**
     * Clear the search cache
     */
    clearCache(): void {
        this.searchCache.clear();
    }
}
