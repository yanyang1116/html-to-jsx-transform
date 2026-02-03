#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { stdin, stdout } from "node:process";
import { htmlToJsx } from "./html-to-jsx.ts";

type ParsedArgs = {
  input?: string;
  output?: string;
  stdin: boolean;
  help: boolean;
  version: boolean;
  positional: string[];
};

const HELP_TEXT = `html-to-jsx-transform

Usage:
  html-to-jsx-transform [options] [html]

Examples:
  npx html-to-jsx-transform "<h1>Hello</h1>"
  npx html-to-jsx-transform --input input.html --output output.jsx
  cat input.html | npx html-to-jsx-transform --stdin

Options:
  -i, --input <file>   Read HTML from a file.
  -o, --output <file>  Write JSX to a file (default: stdout).
  --stdin              Read HTML from stdin.
  -h, --help           Show this help message.
  -v, --version        Show the current version.
`;

function parseArgs(args: string[]): ParsedArgs | { error: string } {
  const parsed: ParsedArgs = {
    stdin: false,
    help: false,
    version: false,
    positional: [],
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (!arg) continue;

    if (arg === "--") {
      parsed.positional.push(...args.slice(i + 1));
      break;
    }

    if (arg === "-h" || arg === "--help") {
      parsed.help = true;
      continue;
    }

    if (arg === "-v" || arg === "--version") {
      parsed.version = true;
      continue;
    }

    if (arg === "--stdin") {
      parsed.stdin = true;
      continue;
    }

    if (arg === "-i" || arg === "--input") {
      if (parsed.input) {
        return { error: "Only one --input value is allowed." };
      }
      const value = args[i + 1];
      if (!value || value.startsWith("-")) {
        return { error: "--input requires a file path." };
      }
      parsed.input = value;
      i += 1;
      continue;
    }

    if (arg === "-o" || arg === "--output") {
      if (parsed.output) {
        return { error: "Only one --output value is allowed." };
      }
      const value = args[i + 1];
      if (!value || value.startsWith("-")) {
        return { error: "--output requires a file path." };
      }
      parsed.output = value;
      i += 1;
      continue;
    }

    if (arg.startsWith("-")) {
      return { error: `Unknown option: ${arg}` };
    }

    parsed.positional.push(arg);
  }

  return parsed;
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    stdin.setEncoding("utf8");
    stdin.on("data", (chunk) => {
      data += chunk;
    });
    stdin.on("end", () => resolve(data));
    stdin.on("error", reject);
  });
}

async function readPackageVersion(): Promise<string> {
  const pkgUrl = new URL("../package.json", import.meta.url);
  const raw = await readFile(pkgUrl, "utf8");
  const pkg = JSON.parse(raw) as { version?: string };
  return pkg.version ?? "unknown";
}

function fail(message: string) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));

  if ("error" in parsed) {
    fail(parsed.error);
    return;
  }

  if (parsed.help) {
    stdout.write(HELP_TEXT);
    return;
  }

  if (parsed.version) {
    const version = await readPackageVersion();
    stdout.write(`${version}\n`);
    return;
  }

  const hasPositional = parsed.positional.length > 0;

  if (parsed.stdin && (parsed.input || hasPositional)) {
    fail("--stdin cannot be combined with --input or a positional HTML value.");
    return;
  }

  if (parsed.input && hasPositional) {
    fail("Provide either --input or a positional HTML value, not both.");
    return;
  }

  let html = "";

  if (parsed.input) {
    html = await readFile(parsed.input, "utf8");
  } else if (hasPositional) {
    html = parsed.positional.join(" ");
  } else if (parsed.stdin || !stdin.isTTY) {
    html = await readStdin();
  } else {
    stdout.write(HELP_TEXT);
    fail("No input provided.");
    return;
  }

  const jsx = htmlToJsx(html);

  if (parsed.output) {
    await writeFile(parsed.output, jsx);
  } else {
    stdout.write(jsx);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  fail(message);
});
