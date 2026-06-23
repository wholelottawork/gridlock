# Releasing Gridlock Worker (Windows .exe)

## Download-and-go experience (Windows)

The packaged installer includes:

| Component | Bundled? |
|-----------|----------|
| Electron UI + worker daemon scripts | Yes |
| **Python 3.12** + `websocket-client` + `certifi` | Yes (built into installer) |
| **Ollama** | No — one-click install from in-app Setup |
| **AI model** (`llama3.2:3b`) | No — one-click download from in-app Setup (~2 GB) |

**User flow after installing `Gridlock-Worker-Setup-0.1.0.exe` (version matches `package.json`):**

1. Open Gridlock Worker
2. Complete **Setup** (Install Ollama → Download model)
3. Enter wallet public address
4. Click **Start Worker**

No manual `pip install`, no Python install, no terminal commands.

---

## Build the installer

On **Windows** (or GitHub Actions `windows-latest`):

```powershell
cd gridlock-worker
npm install
npm run package
```

This runs `scripts/bundle-python.cjs` (embeds Python + deps) then `electron-builder`.

Output:

```
gridlock-worker\release\Gridlock-Worker-Setup-0.1.0.exe
```

---

## GitHub Release

### Tag push (automatic)

```bash
git tag worker-v0.2.0
git push origin worker-v0.2.0
```

Workflow: `.github/workflows/release-worker.yml`

### Manual upload

```bash
gh release create worker-v0.2.0 \
  gridlock-worker/release/Gridlock-Worker-Setup-0.1.0.exe \
  --title "Gridlock Worker v0.2.0" \
  --notes "Download-and-go Windows worker. Setup wizard installs Ollama and downloads llama3.2:3b."
```

---

## Development (`npm run dev`)

Dev mode still uses system `python` + your local Ollama. The Setup panel appears if Ollama/model are missing.

To test bundled Python locally on Windows before packaging:

```powershell
npm run bundle-python
# Then set env so main process finds it — or run package
```

---

## Code signing (optional)

Unsigned builds may show Windows SmartScreen. Add GitHub secrets `CSC_LINK` and `CSC_KEY_PASSWORD` for signed releases.

---

## Versioning

Use tags prefixed with `worker-v` (e.g. `worker-v0.2.0`). Keep `package.json` `"version"` in sync.
