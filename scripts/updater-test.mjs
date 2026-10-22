// `npm run updater-test`: tries the updater on this machine before a release (Windows). Builds a copy of
// Octavo versioned 0.0.1 that looks for updates here, then the current version as its update, and serves
// both with a latest.json until Ctrl+C. Needs TAURI_SIGNING_PRIVATE_KEY and
// TAURI_SIGNING_PRIVATE_KEY_PASSWORD in the environment, as a release build does.
import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const OLD = "0.0.1";
const HOST = "127.0.0.1";
const PORT = 8765;
const SERVER = `http://${HOST}:${PORT}`;
const NSIS = "src-tauri/target/release/bundle/nsis";

if (process.env.TAURI_SIGNING_PRIVATE_KEY === undefined) {
  console.error("Set TAURI_SIGNING_PRIVATE_KEY (the contents of the key file) and TAURI_SIGNING_PRIVATE_KEY_PASSWORD first.");
  process.exit(1);
}

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const out = join(tmpdir(), "octavo-updater-test");
rmSync(out, { recursive: true, force: true });
mkdirSync(out);

const installer = (v) => join(NSIS, `Octavo_${v}_x64-setup.exe`);
const build = (args = "") => execSync(`npx tauri build --bundles nsis ${args}`, { stdio: "inherit" });

// The old copy: its update address is the server below, which plain HTTP only reaches with this option.
const config = join(out, "old.json");
writeFileSync(
  config,
  JSON.stringify({ version: OLD, plugins: { updater: { endpoints: [`${SERVER}/latest.json`], dangerousInsecureTransportProtocol: true } } }),
);
build(`--config "${config}"`);
copyFileSync(installer(OLD), join(out, basename(installer(OLD))));

// The update: the current version, built as for a release.
build();
const update = installer(version);
copyFileSync(update, join(out, basename(update)));
const entry = { signature: readFileSync(`${update}.sig`, "utf8"), url: `${SERVER}/${basename(update)}` };
writeFileSync(
  join(out, "latest.json"),
  JSON.stringify(
    { version, notes: "Local updater test", pub_date: new Date().toISOString(), platforms: { "windows-x86_64-nsis": entry, "windows-x86_64": entry } },
    null,
    2,
  ),
);

// Serves the files in `out` by name only, so nothing outside it can be requested.
createServer((req, res) => {
  const file = join(out, basename(decodeURIComponent(new URL(req.url, SERVER).pathname)));
  let body;
  try {
    body = readFileSync(file);
  } catch {
    res.writeHead(404).end();
    console.log(`${req.url} 404`);
    return;
  }
  res.writeHead(200, { "Content-Type": file.endsWith(".json") ? "application/json" : "application/octet-stream" }).end(body);
  console.log(`${req.url} 200`);
}).listen(PORT, HOST, () => {
  console.log(`
Serving ${out} at ${SERVER}. Ctrl+C stops it.

1. Install ${join(out, basename(installer(OLD)))} and start Octavo.
2. A few seconds later the toolbar shows Update ready, and this window logs latest.json and the installer.
3. Later hides the button; Settings > Updates still offers Restart now.
4. With autosave off and an unsaved edit, Restart now asks to save first; then Octavo ${version} installs and starts again.
5. Settings > Updates shows Octavo ${version}.
`);
});
