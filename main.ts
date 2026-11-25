// Token Radar: the entry program for token-radar-01 (Node 22, standard library only).
//
// Reads the sealed DefiLlama snapshot (default /input/snapshot.json, or
// --input <file|dir>), scores every rankable pre-token protocol with the
// calibrated model in lib/radar.ts, and writes the entry's output:
//
//   /output/board.json    the ranked board (rows 1..N by implied value)
//   /output/data.js       the dashboard's dataset, as window.RADAR
//   /output/dashboard/   the static page, copied from this repository
//   /output/screenshots/ the three dashboard screenshots, copied as-is
//   /output/dossier.json the judge's dossier, from vendor/makefun-board.ts
//
// The program runs twice in the grader and both runs must write the same
// bytes: every step here is deterministic (sorted inputs, no clocks, no
// random numbers), and the dossier is written last from the files already
// in /output.
//
// Local run:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/radar.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The caps the gate and the dossier library hold the output to. */
const TEXT_MAX_BYTES = 65_536;
const MAX_SCREENSHOTS = 4;
const MAX_SHOT_BYTES = 524_288;
const MAX_DASH_FILES = 400;
const MAX_DASH_BYTES = 4_194_304;
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** The value of --name <value>, --name=<value>, or the fallback. */
function flag(name: string, fallback: string): string {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === `--${name}` && i + 1 < args.length) return args[i + 1]!;
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
  }
  return fallback;
}

function fail(message: string): never {
  process.stderr.write(`token-radar: ${message}\n`);
  process.exit(1);
}

const inputArg = flag('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  fail(`no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input`);
}
const outDir = flag('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) fail(`the model wrote a board the gate refuses: ${issue}`);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outDir, 'data.js'), dataScript(radar));

/** Copy a directory tree of regular files into `to`, skipping dot-names; returns the files copied. */
function copyTree(from: string, to: string, recursive: boolean): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  const walk = (dir: string, rel: string): void => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.')) continue;
      const path = join(dir, name);
      const target = join(to, rel, name);
      const st = statSync(path);
      if (st.isDirectory()) {
        if (!recursive) continue;
        mkdirSync(target, { recursive: true });
        walk(path, join(rel, name));
      } else if (st.isFile()) {
        copyFileSync(path, target);
        copied.push(rel === '' ? name : `${rel}/${name}`);
      }
    }
  };
  walk(from, '');
  return copied;
}

const dashFiles = copyTree(join(here, 'dashboard'), join(outDir, 'dashboard'), true);
if (!dashFiles.includes('index.html')) fail('dashboard/ holds no index.html');
if (!dashFiles.some((f) => f.endsWith('.css'))) fail('dashboard/ holds no .css file');
if (!dashFiles.some((f) => f.endsWith('.js'))) fail('dashboard/ holds no .js file');

const shots = copyTree(join(here, 'screenshots'), join(outDir, 'screenshots'), false);
if (shots.length < 3) fail(`screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`);
if (shots.length > MAX_SCREENSHOTS) fail(`screenshots/ holds ${shots.length} images, over the ${MAX_SCREENSHOTS} the gate takes`);
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters, not starting with . or -`);
  const size = statSync(join(outDir, 'screenshots', name)).size;
  if (size > MAX_SHOT_BYTES) fail(`screenshots/${name} is ${size} bytes, over the ${MAX_SHOT_BYTES} the gate takes`);
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: TEXT_MAX_BYTES,
    screenshots: { max: MAX_SCREENSHOTS, max_bytes: MAX_SHOT_BYTES },
    dashboard: { max_files: MAX_DASH_FILES, max_bytes: MAX_DASH_BYTES },
  }),
);

const top = board[0]!;
process.stdout.write(
  `token-radar: ${snapshot.protocols.length} protocols in the snapshot, ${snapshot.watchlist.length} on the watchlist\n` +
    `token-radar: ${board.length} rows ranked (${radar.early_size} early below the floor, ${radar.above_floor_size} above it off the watchlist), top ${top.slug} at $${top.implied_value_usd.toLocaleString('en-US')}\n` +
    `token-radar: wrote ${join(outDir, 'board.json')}, ${join(outDir, 'data.js')}, dashboard (${dashFiles.length} files), screenshots (${shots.length} images), ${join(outDir, 'dossier.json')}\n`,
);
