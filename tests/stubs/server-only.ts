/**
 * Vitest stand-in for the `server-only` package. Importing the real module outside a bundler that
 * understands React Server Components throws; the server modules under test are node-only anyway,
 * so both vitest configs alias `server-only` here.
 */
export {};
