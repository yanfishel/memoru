const BUILD_ID = /^[0-9]{8}(_[a-z0-9]{1,16})?$/;

export function deriveBuildId(input: { syncUntil: string | null; importFinishedAt: string | null; now: Date }): string {
  const source = input.syncUntil ?? input.importFinishedAt ?? input.now.toISOString();
  return source.slice(0, 10).replace(/-/g, "");
}

/** Build ids become schema and index names, so they must stay plain identifiers. */
export function assertBuildId(id: string): void {
  if (!BUILD_ID.test(id)) {
    throw new Error(`build id "${id}" must be YYYYMMDD with an optional _suffix of up to 16 lowercase letters or digits`);
  }
}

export function servingSchemaName(buildId: string): string {
  return `serving_${buildId}`;
}

export function searchIndexName(buildId: string): string {
  return `people_${buildId}`;
}
