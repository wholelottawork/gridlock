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

## Icons (app + installer)

electron-builder picks up `build/icon.ico` for:

- The installed `.exe` and Start Menu shortcut
- The NSIS setup wizard (`Gridlock-Worker-Setup-x.y.z.exe`)

Regenerate from the Gridlock chevron mark:

```powershell
npm run generate-icons
```

Requires Python 3 + Pillow (`pip install pillow`). Icons are regenerated automatically before `npm run package`.

Replace `build/icon.png` / `build/icon.ico` with your own artwork anytime (ICO should include 16–256 px sizes).

---

## Code signing (SmartScreen / Defender)

**You cannot fully remove the “Windows protected your PC” / SmartScreen warning without code signing.** Unsigned or unknown publishers always get flagged. Icons do not affect this.

### What users see today (unsigned)

SmartScreen shows “Publisher: Unknown”. Users can click **More info → Run anyway**. That is normal for unsigned builds.

### Proper fix: Authenticode signing

1. Buy a **Windows code signing certificate** from a trusted CA (DigiCert, Sectigo, SSL.com, etc.).
   - **Standard OV cert** (~$200–400/yr): signs the app; SmartScreen reputation builds over time as downloads accumulate.
   - **EV cert** (~$400–600/yr): usually gets SmartScreen trust immediately; requires hardware token/USB.

2. Export the certificate as a **`.pfx`** file (private key + cert).

3. Add GitHub repository secrets:

   | Secret | Value |
   |--------|--------|
   | `CSC_LINK` | Base64-encoded `.pfx` (`base64 -i cert.pfx` on macOS/Linux, `[Convert]::ToBase64String` on Windows) |
   | `CSC_KEY_PASSWORD` | PFX export password |

4. Update the release workflow to sign when secrets exist (remove `CSC_IDENTITY_AUTO_DISCOVERY: false` or set it only when secrets are missing).

Example workflow env block:

```yaml
env:
  CSC_LINK: ${{ secrets.CSC_LINK }}
  CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
```

electron-builder signs the `.exe` and installer automatically when `CSC_LINK` is set.

### Optional: timestamp server

Most CAs embed this; if needed:

```yaml
env:
  WIN_CSC_ARGS: "-tr http://timestamp.digicert.com -td sha256"
```

### What does *not* fix SmartScreen

- Custom icons
- GitHub Releases hosting
- VirusTotal scans
- Telling users to disable Defender

Only signing (and eventually reputation for OV certs) addresses the publisher warning.

---

## Versioning

Use tags prefixed with `worker-v` (e.g. `worker-v0.2.0`). Keep `package.json` `"version"` in sync.
