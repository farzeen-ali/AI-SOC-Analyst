import "server-only";

import { createOpenAI } from "@ai-sdk/openai";

import { env } from "@/lib/env";
import { ANALYSIS_MODEL, EMBEDDING_MODEL } from "@/lib/ingest/constants";

/**
 * OpenAI provider, constructed lazily.
 *
 * The key is read through `env` so a missing value fails with a named error at
 * call time rather than crashing module import for every route that happens to
 * pull this file into its graph.
 */
let provider: ReturnType<typeof createOpenAI> | null = null;

function getProvider() {
  provider ??= createOpenAI({ apiKey: env.openaiApiKey });
  return provider;
}

/** Chat model used for structured threat analysis. */
export function analysisModel() {
  return getProvider().chat(ANALYSIS_MODEL);
}

/** 1536-dimension embedding model backing the pgvector store. */
export function embeddingModel() {
  return getProvider().textEmbeddingModel(EMBEDDING_MODEL);
}
