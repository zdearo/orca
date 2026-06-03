/* eslint-disable max-lines -- Why: Trello credential storage and authenticated
request plumbing share one boundary so encrypted token lifecycle cannot drift
between task operations. */
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { safeStorage } from 'electron'

import type {
  TrelloConnectArgs,
  TrelloConnectionStatus,
  TrelloViewer
} from '../../shared/trello-types'

const MAX_CONCURRENT = 4
let running = 0
const queue: (() => void)[] = []

async function acquire(): Promise<void> {
  if (running < MAX_CONCURRENT) {
    running++
    return
  }
  return new Promise<void>((resolve) => {
    queue.push(() => {
      running++
      resolve()
    })
  })
}

function release(): void {
  running--
  if (queue.length > 0) {
    queue.shift()?.()
  }
}

type TrelloCredentialsFile = {
  version: 1
  apiKey: string
  tokenEncrypted?: string
  token?: string
  viewer: TrelloViewer | null
}

export class TrelloApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
    this.name = 'TrelloApiError'
  }
}

let cachedFile: TrelloCredentialsFile | null = null
let fileLoaded = false
let cachedToken: string | null = null

function getOrcaDir(): string {
  return join(homedir(), '.orca')
}

function getCredentialsPath(): string {
  return join(getOrcaDir(), 'trello-credentials.json')
}

function ensureOrcaDir(): void {
  const dir = getOrcaDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function emptyCredentialsFile(): TrelloCredentialsFile {
  return {
    version: 1,
    apiKey: '',
    viewer: null
  }
}

function hasStoredToken(): boolean {
  return cachedToken !== null || existsSync(getCredentialsPath())
}

function readCredentialsFileFromDisk(): TrelloCredentialsFile {
  const path = getCredentialsPath()
  if (!existsSync(path)) {
    return emptyCredentialsFile()
  }
  try {
    const parsed = JSON.parse(
      readFileSync(path, { encoding: 'utf-8' })
    ) as Partial<TrelloCredentialsFile>
    // Decrypt token if available
    let token: string | null = null
    if (parsed.tokenEncrypted) {
      try {
        const buf = Buffer.from(parsed.tokenEncrypted, 'base64')
        token = safeStorage.isEncryptionAvailable()
          ? safeStorage.decryptString(buf)
          : parsed.token
            ? parsed.token
            : null
      } catch {
        token = null
      }
    } else if (parsed.token) {
      // Legacy plaintext token
      token = parsed.token
    }
    if (token) {
      cachedToken = token
    }
    return {
      version: 1,
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      viewer:
        parsed.viewer && typeof parsed.viewer === 'object' ? (parsed.viewer as TrelloViewer) : null
    }
  } catch {
    return emptyCredentialsFile()
  }
}

function getCredentialsFile(): TrelloCredentialsFile {
  if (!fileLoaded || !cachedFile) {
    cachedFile = readCredentialsFileFromDisk()
    fileLoaded = true
  }
  return cachedFile
}

function writeCredentialsFile(file: TrelloCredentialsFile): void {
  ensureOrcaDir()
  cachedFile = file
  fileLoaded = true

  const toWrite: TrelloCredentialsFile = {
    version: 1,
    apiKey: file.apiKey,
    viewer: file.viewer
  }
  // Encrypt and store token separately
  if (cachedToken) {
    if (safeStorage.isEncryptionAvailable()) {
      toWrite.tokenEncrypted = safeStorage.encryptString(cachedToken).toString('base64')
    } else {
      console.warn('[trello] safeStorage encryption unavailable — storing token in plaintext')
      toWrite.token = cachedToken
    }
  }

  writeFileSync(getCredentialsPath(), JSON.stringify(toWrite, null, 2), {
    encoding: 'utf-8',
    mode: 0o600
  })
}

function saveCredentials(apiKey: string, token: string, viewer: TrelloViewer): void {
  cachedToken = token
  writeCredentialsFile({
    version: 1,
    apiKey,
    viewer
  })
}

function deleteCredentials(): void {
  cachedToken = null
  cachedFile = null
  fileLoaded = false
  try {
    unlinkSync(getCredentialsPath())
  } catch {
    // File may not exist — safe to ignore.
  }
}

function toViewer(data: Record<string, unknown>): TrelloViewer {
  return {
    id: typeof data.id === 'string' ? data.id : '',
    username: typeof data.username === 'string' ? data.username : '',
    displayName:
      typeof data.fullName === 'string'
        ? data.fullName
        : typeof data.username === 'string'
          ? data.username
          : '',
    avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : undefined
  }
}

async function requestWithCredentials(
  apiKey: string,
  token: string,
  path: string,
  init?: RequestInit
): Promise<unknown> {
  const url = new URL(`https://api.trello.com/1${path}`)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('token', token)

  const headers = new Headers(init?.headers)
  headers.set('Accept', 'application/json')

  const response = await fetch(url.toString(), {
    ...init,
    headers
  })
  if (!response.ok) {
    throw new TrelloApiError(await readTrelloError(response), response.status)
  }
  if (response.status === 204) {
    return null
  }
  return response.json()
}

async function readTrelloError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as {
      message?: string
      error?: string
    }
    const messages = [data.message, data.error].filter(Boolean)
    if (messages.length > 0) {
      return messages.join('; ')
    }
  } catch {
    // Fall through to status text.
  }
  return response.statusText || `Trello request failed (${response.status})`
}

export async function trelloRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const file = getCredentialsFile()
  const apiKey = file.apiKey
  const token = cachedToken
  if (!apiKey || !token) {
    throw new TrelloApiError('Not connected to Trello.', 401)
  }

  const url = new URL(`https://api.trello.com/1${path}`)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('token', token)

  const headers = new Headers(init?.headers)
  headers.set('Accept', 'application/json')
  if (init?.method && init.method !== 'GET' && init.method !== 'HEAD') {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(url.toString(), {
    ...init,
    headers
  })
  if (!response.ok) {
    const error = new TrelloApiError(await readTrelloError(response), response.status)
    // Only clear credentials on confirmed auth errors
    if (error.status === 401 || error.status === 403) {
      deleteCredentials()
    }
    throw error
  }
  if (response.status === 204) {
    return null as T
  }
  return (await response.json()) as T
}

export function getStatus(): TrelloConnectionStatus {
  const file = getCredentialsFile()
  return {
    connected: hasStoredToken() && !!file.apiKey && !!file.viewer,
    viewer: file.viewer
  }
}

export async function connect(
  args: TrelloConnectArgs
): Promise<{ ok: true; viewer: TrelloViewer } | { ok: false; error: string }> {
  const apiKey = args.apiKey.trim()
  const token = args.token.trim()
  if (!apiKey || !token) {
    return { ok: false, error: 'API key and token are required.' }
  }

  await acquire()
  try {
    const data = (await requestWithCredentials(apiKey, token, '/members/me')) as Record<
      string,
      unknown
    >
    const viewer = toViewer(data)
    saveCredentials(apiKey, token, viewer)
    return { ok: true, viewer }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Connection failed.' }
  } finally {
    release()
  }
}

export function disconnect(): void {
  deleteCredentials()
}

export async function testConnection(): Promise<
  { ok: true; viewer: TrelloViewer } | { ok: false; error: string }
> {
  const file = getCredentialsFile()
  if (!file.apiKey || !cachedToken) {
    return { ok: false, error: 'Not connected to Trello.' }
  }

  await acquire()
  try {
    const data = await trelloRequest<Record<string, unknown>>('/members/me')
    const viewer = toViewer(data)
    // Refresh stored viewer
    writeCredentialsFile({ ...file, viewer })
    return { ok: true, viewer }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Test failed.' }
  } finally {
    release()
  }
}

export function isAuthError(error: unknown): boolean {
  return error instanceof TrelloApiError && (error.status === 401 || error.status === 403)
}

export { acquire, release }
