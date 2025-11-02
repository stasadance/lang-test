import dotenv from "dotenv";
import { ResearchAgent } from "./agents/research-agent";

dotenv.config({ path: ".env.example" });
dotenv.config({ override: true });

async function main() {
    console.log("Configuration:");
    console.log(
        `  Ollama: ${process.env.OLLAMA_BASE_URL} (${process.env.OLLAMA_MODEL})`,
    );
    console.log(`  SearxNG: ${process.env.SEARXNG_BASE_URL}`);
    console.log(`  MongoDB: ${process.env.MONGODB_URI}\n`);

    try {
        const researchAgent = new ResearchAgent();

        const topic = "Artificial Intelligence in Healthcare 2025";

        const researchReport = await researchAgent.research(topic);

        console.log("\n" + "=".repeat(60));
        console.log("📊 Research Report");
        console.log("=".repeat(60));
        console.log(`\n🎯 Topic: ${researchReport.topic}`);
        console.log(
            `\n💡 Generated Queries (${researchReport.queries.length}):`,
        );
        for (const [index, query] of researchReport.queries.entries()) {
            console.log(`  ${index + 1}. ${query}`);
        }

        console.log(`\n📝 Summary:\n${researchReport.summary}`);

        console.log(`\n🔗 Top Sources (${researchReport.topSources.length}):`);
        for (const source of researchReport.topSources.slice(0, 5)) {
            console.log(
                `  - ${source.title} (relevance: ${source.relevance.toFixed(1)})`,
            );
            console.log(`    ${source.url}`);
        }

        console.log(`\n� Statistics:`);
        console.log(
            `  - Total search queries generated: ${researchReport.queries.length}`,
        );
        console.log(
            `  - Search results analyzed: ${researchReport.allResults.length}`,
        );
        console.log(
            `  - Unique sources found: ${researchReport.topSources.length}`,
        );

        await researchAgent.close();
    } catch (error) {
        console.error("❌ Error:", error);
        throw error;
    }
}

// Run the main function
await main();
