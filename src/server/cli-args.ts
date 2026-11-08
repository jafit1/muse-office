export interface CliOptions { port: number; dir?: string; open: boolean; demo: boolean; help: boolean; }

export function parseCliArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { port: 4180, dir: undefined, open: true, demo: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--port': opts.port = Number(argv[++i]) || opts.port; break;
      case '--dir': opts.dir = argv[++i]; break;
      case '--no-open': opts.open = false; break;
      case '--demo': opts.demo = true; break;
      case '--help': case '-h': opts.help = true; break;
    }
  }
  return opts;
}
