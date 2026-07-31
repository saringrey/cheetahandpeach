'use strict'

const { app, BrowserWindow, dialog, net, protocol, shell } = require('electron/main')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const APP_NAME = 'The Cheetah & The Peach'
const APP_ORIGIN = 'cheetah://game'
const HEALTH_FILE = path.join('/tmp', `cheetahandpeach-native-health-${process.getuid()}`)
const FRAME_FILE = path.join('/tmp', `cheetahandpeach-native-frame-${process.getuid()}.png`)
const WEB_ROOT = path.join(__dirname, 'webapp')
const MAX_RENDERER_RECOVERIES = 1

app.setName(APP_NAME)
app.commandLine.appendSwitch('use-angle', 'metal')
app.commandLine.appendSwitch('enable-gpu-rasterization')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'cheetah',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      codeCache: true,
    },
  },
])

let healthPoll = null
let launchTimeout = null
let rendererRecoveries = 0
let forcedRestartPending = false
let logFile = null
const health = new Map()

function log(message, detail) {
  const suffix = detail === undefined ? '' : ` ${JSON.stringify(detail)}`
  const line = `${new Date().toISOString()} ${message}${suffix}`
  console.log(line)
  if (logFile) {
    try {
      fs.mkdirSync(path.dirname(logFile), { recursive: true })
      fs.appendFileSync(logFile, `${line}\n`)
    } catch (error) {
      console.error('Native log write failed', error)
    }
  }
}

function writeHealth(key, value = 'ready') {
  health.set(key, value)
  const content = [...health.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([stage, state]) => `${stage}=${state}`)
    .join('\n')
  fs.writeFileSync(HEALTH_FILE, `${content}\n`)
}

function resolveWebAsset(requestUrl) {
  const url = new URL(requestUrl)
  let relativePath
  try {
    relativePath = decodeURIComponent(url.pathname)
  } catch {
    return null
  }
  if (relativePath === '/' || relativePath === '') relativePath = '/index.html'

  const candidate = path.resolve(WEB_ROOT, `.${relativePath}`)
  const rootPrefix = `${path.resolve(WEB_ROOT)}${path.sep}`
  if (candidate !== path.resolve(WEB_ROOT) && !candidate.startsWith(rootPrefix)) return null
  return candidate
}

async function registerGameProtocol() {
  protocol.handle('cheetah', (request) => {
    const assetPath = resolveWebAsset(request.url)
    if (!assetPath || !fs.existsSync(assetPath) || !fs.statSync(assetPath).isFile()) {
      log('Blocked or missing game asset', { url: request.url })
      return new Response('Not found', { status: 404 })
    }
    return net.fetch(pathToFileURL(assetPath).toString())
  })
  writeHealth('protocol')
}

function clearStartupTimers() {
  if (healthPoll) clearInterval(healthPoll)
  if (launchTimeout) clearTimeout(launchTimeout)
  healthPoll = null
  launchTimeout = null
}

async function captureDiagnosticFrame(window) {
  try {
    await window.webContents.executeJavaScript(
      `new Promise((resolve) => {
        setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(resolve)), 1500)
      })`,
      true,
    )
    const image = await window.webContents.capturePage()
    fs.writeFileSync(FRAME_FILE, image.toPNG())
    writeHealth('capture')
    log('Captured native diagnostic frame', { path: FRAME_FILE, size: image.getSize() })
  } catch (error) {
    writeHealth('capture', 'failed')
    log('Native diagnostic capture failed', { error: String(error) })
  }
}

async function inspectRenderedGame(window) {
  return window.webContents.executeJavaScript(
    `(() => {
      const canvas = document.querySelector('canvas')
      const ready = document.documentElement.dataset.webglReady === 'true'
      if (!canvas) return { ready, canvas: false, renderer: '' }
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
      if (!gl) return { ready, canvas: true, renderer: '' }
      const extension = gl.getExtension('WEBGL_debug_renderer_info')
      const renderer = extension
        ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER)
      return {
        ready,
        canvas: canvas.width > 0 && canvas.height > 0,
        renderer: String(renderer || ''),
      }
    })()`,
    true,
  )
}

function beginRenderHealthCheck(window) {
  clearStartupTimers()
  healthPoll = setInterval(async () => {
    if (window.isDestroyed() || window.webContents.isDestroyed()) return
    try {
      const state = await inspectRenderedGame(window)
      if (!state.ready || !state.canvas) return

      clearStartupTimers()
      writeHealth('canvas')
      writeHealth('web')
      if (/\bmetal\b/i.test(state.renderer)) {
        writeHealth('metal')
      } else {
        writeHealth('metal', 'failed')
      }
      log('WebGL renderer ready', state)
      if (!window.isVisible()) window.show()
      window.focus()
      await captureDiagnosticFrame(window)
    } catch (error) {
      log('Render health probe failed', { error: String(error) })
    }
  }, 200)

  launchTimeout = setTimeout(() => {
    clearStartupTimers()
    writeHealth('web', 'failed')
    log('Timed out waiting for the first rendered WebGL frame')
    if (!window.isDestroyed() && !window.isVisible()) window.show()
  }, 15000)
}

function recoverRenderer(window, reason) {
  clearStartupTimers()
  log('Renderer process stopped', reason)
  if (forcedRestartPending && !window.isDestroyed()) {
    forcedRestartPending = false
    window.webContents.reload()
    return
  }
  if (rendererRecoveries >= MAX_RENDERER_RECOVERIES || window.isDestroyed()) {
    writeHealth('web', 'failed')
    dialog.showErrorBox(
      `${APP_NAME} renderer stopped`,
      'The renderer could not recover. See the native log for diagnostics.',
    )
    return
  }
  rendererRecoveries += 1
  window.webContents.reload()
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#12101a',
    title: APP_NAME,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: true,
    },
  })

  window.removeMenu()
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${APP_ORIGIN}/`)) event.preventDefault()
  })
  window.webContents.on('did-start-navigation', (_event, _url, _sameDocument, isMainFrame) => {
    if (isMainFrame) clearStartupTimers()
  })
  window.webContents.on('did-finish-load', () => {
    writeHealth('document')
    beginRenderHealthCheck(window)
  })
  window.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame) return
    writeHealth('document', 'failed')
    log('Game document failed to load', { code, description, url })
  })
  window.webContents.on('render-process-gone', (_event, details) => recoverRenderer(window, details))
  window.webContents.on('unresponsive', () => {
    if (rendererRecoveries >= MAX_RENDERER_RECOVERIES) return
    rendererRecoveries += 1
    forcedRestartPending = true
    log('Renderer became unresponsive; restarting it')
    window.webContents.forcefullyCrashRenderer()
  })
  window.on('closed', () => {
    clearStartupTimers()
  })

  void window.loadURL(`${APP_ORIGIN}/index.html`)
}

app.whenReady().then(async () => {
  app.setAppLogsPath()
  logFile = path.join(app.getPath('logs'), 'native.log')
  fs.rmSync(HEALTH_FILE, { force: true })
  fs.rmSync(FRAME_FILE, { force: true })
  health.clear()
  log('Starting native host', {
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    platform: process.platform,
    arch: process.arch,
  })

  await registerGameProtocol()
  createWindow()

  app.once('gpu-info-update', async () => {
    try {
      log('GPU feature status', app.getGPUFeatureStatus())
      log('GPU info', await app.getGPUInfo('basic'))
    } catch (error) {
      log('GPU diagnostics failed', { error: String(error) })
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', clearStartupTimers)
app.on('window-all-closed', () => app.quit())
