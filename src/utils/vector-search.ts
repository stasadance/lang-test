import { InMemoryStore } from "@langchain/langgraph";
import { Ollama } from "ollama";
import { Embeddings, type EmbeddingsParams } from "@langchain/core/embeddings";

interface SearchableContent {
    text: string;
    metadata?: Record<string, unknown>;
}

/**
 * Ollama Embeddings implementation for LangChain
 */
class OllamaEmbeddings extends Embeddings {
    private ollama: Ollama;
    private model: string;

    constructor(parameters: EmbeddingsParams = {}) {
        super(parameters);

        this.ollama = new Ollama({
            host: process.env.OLLAMA_BASE_URL,
        });
        this.model = process.env.OLLAMA_EMBEDDING_MODEL!;
    }

    async embedDocuments(texts: string[]): Promise<number[][]> {
        const embeddings = await Promise.all(
            texts.map(async (text) => {
                const response = await this.ollama.embeddings({
                    model: this.model,
                    prompt: text,
                });
                return response.embedding;
            }),
        );
        return embeddings;
    }

    async embedQuery(text: string): Promise<number[]> {
        const response = await this.ollama.embeddings({
            model: this.model,
            prompt: text,
        });
        return response.embedding;
    }
}

/**
 * Vector search utility using Ollama embeddings and InMemoryStore
 */
export class VectorSearch {
    private store: InMemoryStore;

    constructor() {
        // Create Ollama embeddings instance
        const embeddings = new OllamaEmbeddings();

        // Initialize InMemoryStore with embeddings
        this.store = new InMemoryStore({
            index: {
                dims: 768, // Default dimension for embeddinggemma
                embeddings: embeddings,
            },
        });
    }

    /**
     * Add content to the vector store
     * @param namespace Array of strings defining the namespace (e.g., [userId, context])
     * @param id Unique identifier for the content
     * @param content Content object with text and optional metadata
     */
    async addContent(
        namespace: string[],
        id: string,
        content: SearchableContent,
    ): Promise<void> {
        await this.store.put(namespace, id, {
            text: content.text,
            ...content.metadata,
        });
    }

    /**
     * Add multiple content items in batch
     * @param namespace Array of strings defining the namespace
     * @param contents Array of content items with id, text, and metadata
     */
    async addBatch(
        namespace: string[],
        contents: Array<{ id: string; content: SearchableContent }>,
    ): Promise<void> {
        await Promise.all(
            contents.map(({ id, content }) =>
                this.addContent(namespace, id, content),
            ),
        );
    }

    /**
     * Search for content using semantic similarity
     * @param namespace Array of strings defining the namespace
     * @param query The search query text
     * @param filter Optional filter criteria for metadata
     * @param limit Maximum number of results to return
     * @returns Array of matching content items with their keys
     */
    async search<T = Record<string, unknown>>(
        namespace: string[],
        query: string,
        filter?: Record<string, unknown>,
        limit: number = 10,
    ): Promise<Array<{ key: string; value: T; score?: number }>> {
        const results = await this.store.search(namespace, {
            query,
            filter,
            limit,
        });

        return results.map((result) => ({
            key: result.key,
            value: result.value as T,
            score: result.score,
        }));
    }

    /**
     * Get content by ID
     * @param namespace Array of strings defining the namespace
     * @param id The content ID
     * @returns The content object or undefined if not found
     */
    async getById<T = Record<string, unknown>>(
        namespace: string[],
        id: string,
    ): Promise<T | undefined> {
        const result = await this.store.get(namespace, id);
        return result ? (result.value as T) : undefined;
    }

    /**
     * Delete content by ID
     * @param namespace Array of strings defining the namespace
     * @param id The content ID
     */
    async delete(namespace: string[], id: string): Promise<void> {
        await this.store.delete(namespace, id);
    }

    /**
     * Clear all content from a namespace
     * Note: InMemoryStore doesn't provide a list method in current version
     * The store is in-memory and will be cleared when the object is destroyed
     * For production use, consider a database-backed store with proper namespace management
     */
    async clearNamespace(): Promise<void> {
        // InMemoryStore is ephemeral - data is cleared on object destruction
        // This is acceptable for temporary research sessions
        // No-op for now
    }
}
