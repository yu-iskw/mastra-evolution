declare module 'node:crypto' {
  export function randomUUID(): string;
}

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: string): string;
}

declare module 'node:fs/promises' {
  export function access(path: string): Promise<void>;
  export function mkdir(
    path: string,
    options?: { recursive?: boolean },
  ): Promise<string | undefined>;
  export function mkdtemp(prefix: string): Promise<string>;
  export function readFile(path: string, encoding: string): Promise<string>;
  export function writeFile(path: string, data: string, encoding: string): Promise<void>;
}

declare module 'node:os' {
  export function tmpdir(): string;
}

declare module 'node:path' {
  function join(...paths: string[]): string;
  function resolve(...paths: string[]): string;
  const sep: string;
  export { join, resolve, sep };
  const path: { join: typeof join; resolve: typeof resolve; sep: string };
  export default path;
}

declare const __dirname: string;
