declare module 'node:fs' {
  export function readFileSync(path: string, encoding: string): string;
}

declare module 'node:fs/promises' {
  export function mkdir(
    path: string,
    options?: { recursive?: boolean },
  ): Promise<string | undefined>;
  export function mkdtemp(prefix: string): Promise<string>;
  export function readFile(path: string, encoding: string): Promise<string>;
  export function rm(
    path: string,
    options?: { recursive?: boolean; force?: boolean },
  ): Promise<void>;
  export function writeFile(path: string, data: string, encoding: string): Promise<void>;
}

declare module 'node:os' {
  export function tmpdir(): string;
}

declare module 'node:path' {
  function join(...paths: string[]): string;
  function resolve(...paths: string[]): string;
  function basename(filePath: string): string;
  export { basename, join, resolve };
  const path: { basename: typeof basename; join: typeof join; resolve: typeof resolve };
  export default path;
}

declare const __dirname: string;
