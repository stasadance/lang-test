import { Tool } from "@langchain/core/tools";
import { MongoClient, Db } from "mongodb";

interface ResearchDocument {
    query: string;
    summary: string;
    sources: string[];
    timestamp: Date;
}

export class MongoDBStorageTool extends Tool {
    name = "mongodb-storage";
    description =
        "Saves research summaries to MongoDB. Input should be a JSON string with properties: query (string), summary (string), and sources (array of strings). Returns confirmation of storage.";

    private client: MongoClient;
    private db: Db | undefined = undefined;

    constructor() {
        super();
        this.client = new MongoClient(process.env.MONGODB_URI!);
    }

    private async connect(): Promise<Db> {
        if (!this.db) {
            await this.client.connect();
            // Extract DB name from URI
            const databaseName =
                process.env.MONGODB_URI!.split("/").pop()?.split("?")[0] ||
                "langchain-db";
            this.db = this.client.db(databaseName);
        }
        return this.db;
    }

    async _call(input: string): Promise<string> {
        try {
            const data: ResearchDocument = JSON.parse(input);

            if (!data.query || !data.summary) {
                return 'Error: Input must contain "query" and "summary" fields.';
            }

            const database = await this.connect();
            const collection =
                database.collection<ResearchDocument>("research");

            const document: ResearchDocument = {
                query: data.query,
                summary: data.summary,
                sources: data.sources || [],
                timestamp: new Date(),
            };

            const result = await collection.insertOne(document);

            return `Successfully saved research to MongoDB with ID: ${result.insertedId}. Query: "${data.query}"`;
        } catch (error) {
            if (error instanceof SyntaxError) {
                return `Error: Invalid JSON input. ${error.message}`;
            }
            return `Error saving to MongoDB: ${error}`;
        }
    }

    async close(): Promise<void> {
        await this.client.close();
        this.db = undefined;
    }
}
