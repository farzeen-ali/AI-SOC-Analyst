import "server-only";

import { embed, embedMany } from "ai";

import { embeddingModel } from "@/lib/ai/provider";
import {
  EMBEDDING_BATCH_SIZE,
  EMBEDDING_DIMENSIONS,
} from "@/lib/ingest/constants";

/**
 * pgvector accepts a literal in the form `[0.1,0.2,...]`. Supabase's REST
 * layer sends it as a string, so vectors are serialised on the way in.
 */
export function toVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

function assertDimensions(values: number[]) {
  if (values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding model returned ${values.length} dimensions, expected ${EMBEDDING_DIMENSIONS}. ` +
        `The pgvector column and the model must agree.`
    );
  }
}

/**
 * Embeds many texts, batched.
 *
 * Batching keeps each HTTP request well inside OpenAI's per-request limits and
 * bounds the memory held at once — a 1,500-chunk file would otherwise build a
 * single ~9 MB request body.
 */
export async function embedChunks(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const model = embeddingModel();
  const vectors: number[][] = [];

  for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBEDDING_BATCH_SIZE);
    const { embeddings } = await embedMany({ model, values: batch });

    for (const embedding of embeddings) {
      assertDimensions(embedding);
      vectors.push(embedding);
    }
  }

  return vectors;
}

/** Embeds a single query for similarity search. */
export async function embedQuery(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel(),
    value: text,
  });
  assertDimensions(embedding);
  return embedding;
}
