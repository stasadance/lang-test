import { ChatOllama } from "@langchain/ollama";
import {
    StateGraph,
    START,
    END,
    MessagesAnnotation,
} from "@langchain/langgraph";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { SearxNGSearchTool } from "../tools/searxng-search-tool";

export interface SearchResult {
    query: string;
    results: Array<{
        title: string;
        url: string;
        snippet: string;
        relevanceScore?: number;
    }>;
    summary: string;
    timestamp: Date;
}

export class SearchAgent {
    private llm: ChatOllama;
    private searchTool: SearxNGSearchTool;
    private graph: ReturnType<typeof this.buildGraph>;

    constructor() {
        this.llm = new ChatOllama({
            baseUrl: process.env.OLLAMA_BASE_URL,
            model: process.env.OLLAMA_MODEL,
            temperature: Number.parseFloat(process.env.OLLAMA_TEMPERATURE!),
            maxRetries: Number.parseInt(process.env.OLLAMA_MAX_RETRIES!),
        });

        this.searchTool = new SearxNGSearchTool();
        this.graph = this.buildGraph();
    }

    private buildGraph() {
        const searchNode = async (state: typeof MessagesAnnotation.State) => {
            const lastMessage = state.messages.at(-1);
            if (!lastMessage) {
                return { messages: [new AIMessage("No query provided")] };
            }

            const query =
                typeof lastMessage.content === "string"
                    ? lastMessage.content
                    : "";

            // Perform search
            const searchResults = await this.searchTool._call(query);

            // Ask LLM to synthesize results
            const prompt = `Based on the following search results for "${query}", provide a clear and concise answer:

${searchResults}

Please synthesize the information and provide a helpful response.`;

            const response = await this.llm.invoke(prompt);
            return { messages: [new AIMessage(response.content)] };
        };

        return new StateGraph(MessagesAnnotation)
            .addNode("search", searchNode)
            .addEdge(START, "search")
            .addEdge("search", END)
            .compile();
    }

    /**
     * Performs a web search and returns structured results
     * @param query The search query string
     * @returns Structured search results with sources and summary
     */
    async search(query: string): Promise<SearchResult> {
        console.log(`🔍 Search Agent: Searching for "${query}"`);

        // Get raw search results
        const rawResults = await this.searchTool.getStructuredResults(query);

        // Generate a summary using LLM
        const result = await this.graph.invoke({
            messages: [new HumanMessage(query)],
        });

        const lastMessage = result.messages.at(-1);
        const summary =
            typeof lastMessage?.content === "string"
                ? lastMessage.content
                : "No response generated";

        return {
            query,
            results: rawResults,
            summary,
            timestamp: new Date(),
        };
    }

    /**
     * Simple search that just returns the text summary
     * @param query The search query string
     * @returns Text summary of search results
     */
    async searchSimple(query: string): Promise<string> {
        const result = await this.search(query);
        return result.summary;
    }
}
