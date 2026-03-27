import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import type { NocapConfig } from './ingest/types.js'

const CONFIG_DIR = join(homedir(), '.no-cap')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

const DEFAULT_CONFIG: NocapConfig = {
  ingestion: { method: 'cookies' },
  output: {
    signalDir: join(homedir(), 'no-cap-signals'),
  },
}

export async function loadConfig(): Promise<NocapConfig> {
  try {
    const raw = await readFile(CONFIG_FILE, 'utf-8')
    return JSON.parse(raw) as NocapConfig
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return DEFAULT_CONFIG
    }
    console.error(`Warning: failed to parse ~/.no-cap/config.json: ${err instanceof Error ? err.message : err}`)
    console.error('Using default config. Fix or delete the config file.')
    return DEFAULT_CONFIG
  }
}

export async function saveConfig(config: NocapConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true })
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 })
}

export function getConfigDir(): string {
  return CONFIG_DIR
}
