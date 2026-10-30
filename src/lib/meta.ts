// Server-side only: never import from client components.
// The key never leaves the server.

import OpenAI from "openai";

export const META_BASE_URL = "https://api.meta.ai/v1";
export const SPARK_MODEL = "muse-spark-1.3";

export function getMetaClient(): OpenAI {
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) {
    throw new Error(
      "MODEL_API_KEY is not set. Copy .env.example to .env.local and add your Meta API key.",
    );
  }
  return new OpenAI({ baseURL: META_BASE_URL, apiKey });
}
