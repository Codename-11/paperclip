#!/usr/bin/env node
import { createServer } from 'node:http'
import { execSync, execFileSync, spawn } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'

const PORT = parseInt(process.env.DEPLOYER_PORT || '3151', 10)
const SECRET = process.env.DEPLOYER_SECRET || ''
const SERVICE_NAME = process.env.PAPERCLIP_SERVICE || 'paperclip'
const PAPERCLIP_PORT = parseInt(process.env.PAPERCLIP_PORT || '3150', 10)
const REPO_DIR = process.env.REPO_DIR || '/home/bailey/paperclip'
const BRANCH = process.env.DEPLOYER_BRANCH || 'master'
const HISTORY_DIR = join(homedir(), '.paperclip')
const HISTORY_FILE = join(HISTORY_DIR, 'deploy-history.json')

let deploying = false
let lastLog = ''
let lastStatus = 'idle'
let lastDeployTimestamp = null
const sseClients = new Set()
const startTime = Date.now()

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
  res.end(JSON.stringify(data))
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

function checkAuth(req) {
  if (!SECRET) return true
  const auth = req.headers['authorization'] || ''
  return auth === `Bearer ${SECRET}`
}

function git(args) {
  return execFileSync('git', Array.isArray(args) ? args : String(args).split(/\s+/), {
    cwd: REPO_DIR,
    encoding: 'utf-8',
    timeout: 30000,
  }).trim()
}

function readHistory() {
  try {
    if (existsSync(HISTORY_FILE)) return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'))
  } catch {}
  return []
}

function writeHistory(entries) {
  mkdirSync(HISTORY_DIR, { recursive: true })
  writeFileSync(HISTORY_FILE, JSON.stringify(entries, null, 2))
}

function addHistory(entry) {
  const history = readHistory()
  history.unshift(entry)
  writeHistory(history.slice(0, 50))
}

function broadcast(payload) {
  const line = payload.line || payload.message || ''
  if (line) lastLog += line + '\n'
  const msg = `data: ${JSON.stringify(payload)}\n\n`
  for (const res of sseClients) {
    try { res.write(msg) } catch { sseClients.delete(res) }
  }
}

function getStatus() {
  let commitHash = null
  let branch = null
  let lastCommitMessage = null
  let lastDeployTime = lastDeployTimestamp
  let serviceRunning = false
  let commitsBehind = 0
  let upToDate = true
  let changedFiles = []
  let remoteRef = null

  try { commitHash = git(["rev-parse", "HEAD"]) } catch {}
  try { branch = git(["branch", "--show-current"]) } catch {}
  try { lastCommitMessage = git(["log", "-1", "--pretty=%s"]) } catch {}
  try {
    const status = execSync("systemctl --user is-active " + SERVICE_NAME, { encoding: "utf-8", cwd: REPO_DIR }).trim()
    serviceRunning = status === "active"
  } catch { serviceRunning = false }
  try {
    git(["fetch", "origin", BRANCH])
    commitsBehind = parseInt(git(["rev-list", "--count", "HEAD..origin/" + BRANCH]), 10) || 0
    upToDate = commitsBehind === 0
  } catch {}
  if (commitsBehind > 0) {
    try {
      const diff = git(["diff", "--name-only", "HEAD..origin/" + BRANCH])
      changedFiles = diff.split(String.fromCharCode(10)).filter(Boolean)
    } catch {}
    try { remoteRef = git(["rev-parse", "origin/" + BRANCH]) } catch {}
  }

  return {
    commitHash, branch, lastCommitMessage, lastDeployTime,
    serviceRunning, deployerReachable: true,
    deploying, lastStatus, commitsBehind, upToDate,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    history: readHistory().slice(0, 20),
    changedFiles, remoteRef,
  }
}

async function runDeploy(source = 'manual') {
  if (deploying) throw new Error('Deploy already in progress')
  deploying = true
  lastStatus = 'building'
  lastLog = ''
  const started = Date.now()
  const deployId = randomUUID().slice(0, 8)

  const runStep = (label, cmd, args, cwd = REPO_DIR, optional = false) => new Promise((resolve, reject) => {
    broadcast({ type: 'step', message: label, timestamp: new Date().toISOString() })
    const proc = spawn(cmd, args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    proc.stdout.on('data', (buf) => {
      const text = buf.toString()
      output += text
      text.split('\n').filter(Boolean).forEach((line) => broadcast({ type: 'output', message: line, timestamp: new Date().toISOString() }))
    })
    proc.stderr.on('data', (buf) => {
      const text = buf.toString()
      output += text
      text.split('\n').filter(Boolean).forEach((line) => broadcast({ type: 'output', message: line, timestamp: new Date().toISOString() }))
    })
    proc.on('close', (code) => {
      if (code === 0 || optional) resolve({ code, output })
      else reject(new Error(`${label} failed (${code})\n${output}`))
    })
    proc.on('error', reject)
  })

  try {
    await runStep('Fetching latest changes...', 'git', ['fetch', 'origin', BRANCH])
    const behind = parseInt(git(['rev-list', '--count', `HEAD..origin/${BRANCH}`]), 10) || 0
    if (behind === 0) {
      lastStatus = 'success'
      deploying = false
      broadcast({ type: 'done', message: 'Already up to date', timestamp: new Date().toISOString() })
      return { status: 'up-to-date' }
    }
    await runStep('Pulling latest changes...', 'git', ['pull', 'origin', BRANCH])
    await runStep('Installing dependencies...', 'pnpm', ['install'])
    await runStep('Building Paperclip...', 'pnpm', ['build'])
    await runStep(`Restarting ${SERVICE_NAME}...`, 'systemctl', ['--user', 'restart', SERVICE_NAME], REPO_DIR, false)
    await new Promise((r) => setTimeout(r, 2500))
    await runStep('Running health check...', 'curl', ['-sf', `http://localhost:${PAPERCLIP_PORT}/api/health`], REPO_DIR, false)

    const entry = {
      id: deployId,
      timestamp: new Date().toISOString(),
      commitHash: (() => { try { return git(['rev-parse', 'HEAD']) } catch { return null } })(),
      commitMessage: (() => { try { return git(['log', '-1', '--pretty=%s']) } catch { return null } })(),
      status: 'success',
      source,
      duration: Date.now() - started,
      error: null,
    }
    addHistory(entry)
    lastDeployTimestamp = entry.timestamp
    lastStatus = 'success'
    deploying = false
    broadcast({ type: 'done', message: 'Deploy complete', timestamp: new Date().toISOString() })
    return entry
  } catch (error) {
    const entry = {
      id: deployId,
      timestamp: new Date().toISOString(),
      commitHash: (() => { try { return git(['rev-parse', 'HEAD']) } catch { return null } })(),
      commitMessage: (() => { try { return git(['log', '-1', '--pretty=%s']) } catch { return null } })(),
      status: 'failed',
      source,
      duration: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    }
    addHistory(entry)
    lastStatus = 'failed'
    deploying = false
    broadcast({ type: 'error', message: entry.error, timestamp: new Date().toISOString() })
    throw error
  }
}

async function rollbackTo(commitHash) {
  const started = Date.now()
  const entry = {
    id: randomUUID().slice(0, 8),
    timestamp: new Date().toISOString(),
    commitHash,
    commitMessage: null,
    status: 'running',
    source: 'rollback',
    duration: null,
    error: null,
  }
  try {
    broadcast({ type: 'step', message: `Rolling back to ${commitHash.slice(0, 7)}...`, timestamp: new Date().toISOString() })
    execSync('git stash || true', { cwd: REPO_DIR, stdio: 'pipe' })
    execSync(`git checkout ${commitHash}`, { cwd: REPO_DIR, stdio: 'pipe' })
    execSync('pnpm install && pnpm build', { cwd: REPO_DIR, stdio: 'pipe', timeout: 300000 })
    execSync(`systemctl --user restart ${SERVICE_NAME}`, { cwd: REPO_DIR, stdio: 'pipe' })
    entry.status = 'success'
    entry.duration = Date.now() - started
    try { entry.commitMessage = git(['log', '-1', '--pretty=%s']) } catch {}
    addHistory(entry)
    return entry
  } catch (error) {
    entry.status = 'failed'
    entry.duration = Date.now() - started
    entry.error = error instanceof Error ? error.message : String(error)
    addHistory(entry)
    throw error
  }
}

async function syncUpstream() {
  const started = Date.now()
  const id = randomUUID().slice(0, 8)
  try {
    broadcast({ type: 'step', message: 'Fetching upstream...', timestamp: new Date().toISOString() })
    execSync('git fetch upstream', { cwd: REPO_DIR, stdio: 'pipe', timeout: 30000 })
    broadcast({ type: 'step', message: 'Merging upstream/master...', timestamp: new Date().toISOString() })
    execSync('git merge upstream/master --no-edit', { cwd: REPO_DIR, stdio: 'pipe', timeout: 30000 })
    broadcast({ type: 'step', message: 'Pushing to origin master...', timestamp: new Date().toISOString() })
    execSync('git push origin master', { cwd: REPO_DIR, stdio: 'pipe', timeout: 30000 })
    const result = {
      id,
      timestamp: new Date().toISOString(),
      status: 'success',
      duration: Date.now() - started,
      commitHash: (() => { try { return git(['rev-parse', 'HEAD']) } catch { return null } })(),
      commitMessage: (() => { try { return git(['log', '-1', '--pretty=%s']) } catch { return null } })(),
    }
    broadcast({ type: 'done', message: 'Upstream sync complete', timestamp: new Date().toISOString() })
    return result
  } catch (error) {
    const err = error instanceof Error ? error.message : String(error)
    broadcast({ type: 'error', message: err, timestamp: new Date().toISOString() })
    throw new Error(err)
  }
}

const server = createServer(async (req, res) => {
  cors(res)
  if (req.method === 'OPTIONS') return res.end()
  const url = new URL(req.url || '/', `http://${req.headers.host}`)

  if (url.pathname === '/status' && req.method === 'GET') {
    return json(res, 200, getStatus())
  }

  if (url.pathname === '/commits' && req.method === 'GET') {
    try {
      git(['fetch', 'origin', BRANCH])
      const commitsBehind = parseInt(git(['rev-list', '--count', `HEAD..origin/${BRANCH}`]), 10) || 0
      const logOutput = commitsBehind > 0 ? git(['log', '--format=%H%n%s%n%an%n%aI', `HEAD..origin/${BRANCH}`]) : ''
      const diffOutput = commitsBehind > 0 ? git(['diff', '--name-only', `HEAD..origin/${BRANCH}`]) : ''
      const commits = []
      if (logOutput) {
        const lines = logOutput.split('\n')
        for (let i = 0; i + 3 < lines.length; i += 4) {
          commits.push({ hash: lines[i], message: lines[i + 1], author: lines[i + 2], date: lines[i + 3] })
        }
      }
      const changedFiles = diffOutput ? diffOutput.split('\n').filter(Boolean) : []
      return json(res, 200, { commitsBehind, commits, changedFiles })
    } catch (error) {
      return json(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  }

  if (url.pathname === '/history' && req.method === 'GET') {
    return json(res, 200, readHistory().slice(0, 20))
  }

  if (url.pathname === '/logs' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    })
    sseClients.add(res)
    if (lastLog) res.write(`data: ${JSON.stringify({ type: 'snapshot', message: lastLog })}\n\n`)
    req.on('close', () => sseClients.delete(res))
    return
  }

  if (url.pathname === '/deploy' && req.method === 'POST') {
    if (!checkAuth(req)) return json(res, 401, { error: 'Unauthorized' })
    try {
      const result = await runDeploy('manual')
      return json(res, 200, result)
    } catch (error) {
      return json(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  }

  if (url.pathname === '/rollback' && req.method === 'POST') {
    if (!checkAuth(req)) return json(res, 401, { error: 'Unauthorized' })
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', async () => {
      try {
        const body = raw ? JSON.parse(raw) : {}
        if (!body.commitHash) return json(res, 400, { error: 'commitHash required' })
        const result = await rollbackTo(body.commitHash)
        return json(res, 200, result)
      } catch (error) {
        return json(res, 500, { error: error instanceof Error ? error.message : String(error) })
      }
    })
    return
  }

  if (url.pathname === '/sync-upstream' && req.method === 'POST') {
    if (!checkAuth(req)) return json(res, 401, { error: 'Unauthorized' })
    try {
      const result = await syncUpstream()
      return json(res, 200, result)
    } catch (error) {
      return json(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  }

  return json(res, 404, { error: 'Not found' })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Paperclip deployer sidecar listening on http://127.0.0.1:${PORT}`)
})
