import { Meilisearch } from "meilisearch";

/** The only place the Meilisearch SDK is constructed. Tests point it at the compose instance. */
export function createSearchClient(config: { host: string; apiKey: string }): Meilisearch {
  return new Meilisearch({ host: config.host, apiKey: config.apiKey });
}

export type { Meilisearch };
