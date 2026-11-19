export class UsageError extends Error {}
export const PINNED_ENV: readonly string[];
export function parseArgs(argv: string[]): {
  mode: 'legacy' | 'enforced' | 'both';
  fragments: string[];
};
export function modesOf(mode: 'legacy' | 'enforced' | 'both'): string[];
export function selectSuites(files: string[], fragments: string[]): string[];
export function childEnv(
  base: NodeJS.ProcessEnv,
  mode: string,
): NodeJS.ProcessEnv;
