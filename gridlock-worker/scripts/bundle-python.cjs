/**
 * Bundles Windows embeddable Python + pip deps for electron-builder.
 * Run automatically via npm prepackage on Windows CI / dev machines.
 */
const fs = require('fs')
const path = require('path')
const https = require('https')
const { execSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const RUNTIME = path.join(ROOT, 'python-runtime')
const VERSION = '3.12.7'
const ZIP_NAME = `python-${VERSION}-embed-amd64.zip`
const ZIP_URL = `https://www.python.org/ftp/python/${VERSION}/${ZIP_NAME}`
const GET_PIP_URL = 'https://bootstrap.pypa.io/get-pip.py'

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const fetch = (u) => {
      https.get(u, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          fetch(res.headers.location)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${u}`))
          return
        }
        const file = fs.createWriteStream(dest)
        res.pipe(file)
        file.on('finish', () => file.close(() => resolve()))
        file.on('error', reject)
      }).on('error', reject)
    }
    fetch(url)
  })
}

function rmrf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
}

async function main() {
  if (process.platform !== 'win32') {
    console.log('[bundle-python] Skipping — Windows embeddable bundle only runs on win32.')
    fs.mkdirSync(RUNTIME, { recursive: true })
    fs.writeFileSync(path.join(RUNTIME, '.skipped'), 'Use Windows CI or a Windows machine to bundle Python.')
    return
  }

  console.log('[bundle-python] Preparing embeddable Python', VERSION)
  rmrf(RUNTIME)
  fs.mkdirSync(RUNTIME, { recursive: true })

  const zipPath = path.join(RUNTIME, ZIP_NAME)
  console.log('[bundle-python] Downloading', ZIP_URL)
  await download(ZIP_URL, zipPath)

  console.log('[bundle-python] Extracting…')
  execSync(
    `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${RUNTIME.replace(/'/g, "''")}' -Force"`,
    { stdio: 'inherit' },
  )
  fs.unlinkSync(zipPath)

  const pthFile = fs.readdirSync(RUNTIME).find((f) => f.endsWith('._pth'))
  if (!pthFile) throw new Error('Could not find python *._pth file')
  const pthPath = path.join(RUNTIME, pthFile)
  const zipBase = pthFile.replace('._pth', '.zip')
  fs.writeFileSync(
    pthPath,
    `${zipBase}\r\n.\r\nLib\\site-packages\r\nimport site\r\n`,
    'utf8',
  )

  fs.mkdirSync(path.join(RUNTIME, 'Lib', 'site-packages'), { recursive: true })

  const pythonExe = path.join(RUNTIME, 'python.exe')
  const getPipPath = path.join(RUNTIME, 'get-pip.py')
  console.log('[bundle-python] Installing pip…')
  await download(GET_PIP_URL, getPipPath)
  execSync(`"${pythonExe}" "${getPipPath}" --no-warn-script-location`, { stdio: 'inherit', cwd: RUNTIME })
  fs.unlinkSync(getPipPath)

  console.log('[bundle-python] Installing websocket-client + certifi…')
  execSync(
    `"${pythonExe}" -m pip install websocket-client certifi --no-warn-script-location`,
    { stdio: 'inherit', cwd: RUNTIME },
  )

  console.log('[bundle-python] Done →', RUNTIME)
}

main().catch((err) => {
  console.error('[bundle-python] FAILED:', err)
  process.exit(1)
})
