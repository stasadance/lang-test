import { ChatOllama } from "@langchain/ollama";
import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { z } from "zod";
import { SearchResult } from "./search-agent";
import { MongoDBStorageTool } from "../tools/mongodb-storage-tool";
import { SearchAgentTool } from "../tools/search-agent-tool";
import {
    extractJsonFromLLMResponse,
    createJsonPrompt,
} from "../utils/llm-helpers";
import { VectorSearch } from "../utils/vector-search";

// Define state for research workflow
const ResearchState = Annotation.Root({
    topic: Annotation<string>,
    generatedQueries: Annotation<string[]>,
    searchResults: Annotation<SearchResult[]>,
    filteredResults: Annotation<SearchResult[]>,
    summary: Annotation<string>,
    sources: Annotation<
        Array<{ url: string; title: string; relevance: number }>
    >,
});

export interface ResearchReport {
    topic: string;
    queries: string[];
    summary: string;
    topSources: Array<{ url: string; title: string; relevance: number }>;
    allResults: SearchResult[];
    timestamp: Date;
}

// Define Zod schema for search queries response
const SearchQueriesSchema = z.object({
    queries: z
        .array(z.string())
        .min(3)
        .max(5)
        .describe("Array of 3-5 specific search queries"),
});

export class ResearchAgent {
    private llm: ChatOllama;
    private storageTool: MongoDBStorageTool;
    private vectorSearch: VectorSearch;
    private searchTool: SearchAgentTool;
    private graph: ReturnType<typeof this.buildGraph>;

    constructor() {
        this.llm = new ChatOllama({
            baseUrl: process.env.OLLAMA_BASE_URL,
            model: process.env.OLLAMA_MODEL,
            temperature: Number.parseFloat(process.env.OLLAMA_TEMPERATURE!),
            maxRetries: Number.parseInt(process.env.OLLAMA_MAX_RETRIES!),
        });

        this.storageTool = new MongoDBStorageTool();
        this.vectorSearch = new VectorSearch();
        this.searchTool = new SearchAgentTool();
        this.graph = this.buildGraph();
    }

    private buildGraph() {
        // Node 1: Generate search queries from topic
        const generateQueriesNode = async (
            state: typeof ResearchState.State,
        ) => {
            console.log(
                `\n🧠 Research Agent: Analyzing topic "${state.topic}"`,
            );
            console.log("💡 Generating search queries...\n");

            // Create prompt using helper
            const queryPrompt = createJsonPrompt(
                `You are a research assistant. Generate 3-5 diverse search queries about the following topic.

Topic: ${state.topic}

The queries should:
- Cover different aspects of the topic
- Be specific and actionable
- Return complementary information`,
                SearchQueriesSchema,
            );

            const response = await this.llm.invoke(queryPrompt);
            const responseText = response.content.toString().trim();

            // Parse and validate using helper
            let generatedQueries: string[];
            try {
                const parsed = extractJsonFromLLMResponse(
                    responseText,
                    SearchQueriesSchema,
                );
                generatedQueries = parsed.queries;
            } catch (error) {
                console.error("Failed to parse LLM response:", responseText);
                console.error("Parse error:", error);
                throw new Error(
                    `Failed to generate valid search queries: ${error instanceof Error ? error.message : String(error)}`,
                );
            }

            console.log("📝 Generated queries:");
            for (const [index, q] of generatedQueries.entries()) {
                console.log(`   ${index + 1}. ${q}`);
            }

            return { generatedQueries };
        };

        // Node 2: Execute searches sequentially using search tool
        const searchNode = async (state: typeof ResearchState.State) => {
            console.log(
                `\n🚀 Executing ${state.generatedQueries.length} searches sequentially...\n`,
            );

            const searchResults: SearchResult[] = [];

            // Run searches sequentially - the tool naturally enforces wait time
            for (const query of state.generatedQueries) {
                const result = await this.searchTool.getStructuredResult(query);
                searchResults.push(result);

                // Add delay between searches to avoid rate limiting (except after last query)
                if (query !== state.generatedQueries.at(-1)) {
                    console.log("   ⏱️  Waiting 2s to avoid rate limiting...");
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                }
            }

            return { searchResults };
        };

        // Node 3: Filter and rank results by relevance using vector similarity search
        const filterNode = async (state: typeof ResearchState.State) => {
            console.log(
                "\n🔬 Analyzing and filtering results using vector similarity search...\n",
            );

            // Create a namespace for this research session
            const namespace = [
                "research",
                state.topic.replaceAll(/\s+/g, "-").toLowerCase(),
            ];

            // Add all search results to the vector store
            console.log(
                "   📥 Indexing search results into vector database...",
            );
            const contentItems = state.searchResults.flatMap((result) =>
                result.results.map((r, index) => ({
                    id: `${result.query}-${index}-${r.url}`,
                    content: {
                        text: `${r.title}\n\n${r.snippet}\n\nQuery: ${result.query}`,
                        metadata: {
                            title: r.title,
                            url: r.url,
                            snippet: r.snippet,
                            query: result.query,
                            summary: result.summary,
                        },
                    },
                })),
            );

            await this.vectorSearch.addBatch(namespace, contentItems);
            console.log(`   ✓ Indexed ${contentItems.length} results`);

            // Perform semantic similarity search using the original topic as the query
            console.log(
                `   🔍 Searching for results most relevant to: "${state.topic}"`,
            );
            const searchResults = await this.vectorSearch.search<{
                title: string;
                url: string;
                snippet: string;
                query: string;
                summary: string;
                text: string;
            }>(
                namespace,
                state.topic,
                undefined, // No metadata filter
                20, // Get top 20 most relevant results
            );

            console.log(
                `   ✓ Found ${searchResults.length} semantically relevant results`,
            );

            // Group results back by query and calculate relevance scores
            const resultsByQuery = new Map<string, SearchResult>();

            for (const result of searchResults) {
                const query = result.value.query;

                if (!resultsByQuery.has(query)) {
                    // Find the original search result for this query
                    const originalResult = state.searchResults.find(
                        (r) => r.query === query,
                    );
                    if (originalResult) {
                        resultsByQuery.set(query, {
                            ...originalResult,
                            results: [],
                        });
                    }
                }

                const queryResult = resultsByQuery.get(query);
                if (queryResult) {
                    // Normalize score to 0-10 scale (similarity scores are typically 0-1)
                    const relevanceScore = result.score
                        ? Math.min(10, result.score * 10)
                        : 5;

                    queryResult.results.push({
                        title: result.value.title,
                        url: result.value.url,
                        snippet: result.value.snippet,
                        relevanceScore: relevanceScore,
                    });
                }
            }

            const filteredResults = [...resultsByQuery.values()];

            console.log(
                `   Kept ${filteredResults.length}/${state.searchResults.length} query groups with relevant results`,
            );

            // Clean up the namespace after use (note: in-memory store will be cleared on object destruction)
            await this.vectorSearch.clearNamespace();

            return { filteredResults };
        };

        // Node 4: Synthesize comprehensive summary
        const summarizeNode = async (state: typeof ResearchState.State) => {
            console.log("\n📊 Synthesizing comprehensive research report...\n");

            const allSummaries = state.filteredResults
                .map(
                    (r) =>
                        `Query: ${r.query}\nFindings: ${r.summary}\n\nSources:\n${r.results.map((source) => `- ${source.title} (${source.url})`).join("\n")}`,
                )
                .join("\n\n---\n\n");

            const summaryPrompt = `You are a research analyst. Based on the following research findings about "${state.topic}", create a comprehensive, well-organized report.

${allSummaries}

Provide:
1. An executive summary
2. Key findings organized by theme
3. Important insights and patterns
4. Conclusions

Make it clear, concise, and actionable.`;

            const response = await this.llm.invoke(summaryPrompt);
            const summary = response.content.toString();

            // Collect and deduplicate sources with relevance scores
            const sourcesMap = new Map<
                string,
                { url: string; title: string; relevance: number }
            >();

            for (const result of state.filteredResults) {
                for (const source of result.results) {
                    if (!sourcesMap.has(source.url)) {
                        sourcesMap.set(source.url, {
                            url: source.url,
                            title: source.title,
                            relevance: source.relevanceScore || 5,
                        });
                    }
                }
            }

            const sources = [...sourcesMap.values()]
                .toSorted((a, b) => b.relevance - a.relevance)
                .slice(0, 15);

            return { summary, sources };
        };

        // Node 5: Save to MongoDB
        const saveNode = async (state: typeof ResearchState.State) => {
            const storageData = JSON.stringify({
                query: state.topic,
                summary: state.summary,
                sources: state.sources.map((s) => s.url),
            });

            await this.storageTool._call(storageData);
            console.log("✅ Research saved to MongoDB!");

            return {};
        };

        return new StateGraph(ResearchState)
            .addNode("generateQueries", generateQueriesNode)
            .addNode("search", searchNode)
            .addNode("filter", filterNode)
            .addNode("summarize", summarizeNode)
            .addNode("save", saveNode)
            .addEdge(START, "generateQueries")
            .addEdge("generateQueries", "search")
            .addEdge("search", "filter")
            .addEdge("filter", "summarize")
            .addEdge("summarize", "save")
            .addEdge("save", END)
            .compile();
    }

    /**
     * Conducts comprehensive research on a topic
     * Automatically generates search queries, spawns search agents, and synthesizes findings
     * @param topic The research topic
     * @returns A comprehensive research report
     */
    async research(topic: string): Promise<ResearchReport> {
        const result = await this.graph.invoke({
            topic,
            generatedQueries: [],
            searchResults: [],
            filteredResults: [],
            summary: "",
            sources: [],
        });

        return {
            topic,
            queries: result.generatedQueries,
            summary: result.summary,
            topSources: result.sources,
            allResults: result.filteredResults,
            timestamp: new Date(),
        };
    }

    /**
     * Conducts research and returns just the summary text (for backward compatibility)
     * @param topic The research topic
     * @returns Summary text
     */
    async researchSimple(topic: string): Promise<string> {
        const result = await this.research(topic);
        return result.summary;
    }

    async close(): Promise<void> {
        await this.storageTool.close();
    }
}
