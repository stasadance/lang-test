# lang-test

Multi-agent AI research system built with LangChain and LangGraph. Automatically generates search queries, spawns parallel search agents, filters results by relevance, and synthesizes comprehensive research reports.

## Features

- 🧠 **Intelligent Query Generation** - Automatically creates 3-5 diverse search queries from any topic
- 🚀 **Parallel Search Agents** - Spawns multiple agents to search concurrently
- 🔬 **AI-Powered Filtering** - Analyzes and ranks results by relevance (0-10 scale)
- 📊 **Comprehensive Synthesis** - Combines findings into structured reports with sources
- 💾 **MongoDB Storage** - Saves research results for future reference

## Prerequisites

- Node.js
- Ollama running locally
- SearxNG running locally
- MongoDB running locally

## Setup

1. Install dependencies:

```bash
yarn install
```

2. Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

3. Run:

```bash
yarn dev
```
