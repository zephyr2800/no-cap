import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import type { NocapState, Bookmark } from '../ingest/types'

const STATE_FILE = 'state.json'

const EMPTY_STATE: NocapState = {
  lastRun: null,
  highWaterMark: null,
  highWaterMarkTimestamp: null,
  lastBookmarkCursor: null,
}

export class StateTracker {
  private statePath: string

  constructor(private dir: string) {
    this.statePath = join(dir, STATE_FILE)
  }

  async load(): Promise<NocapState> {
    try {
      const raw = await readFile(this.statePath, 'utf-8')
      return JSON.parse(raw) as NocapState
    } catch {
      return { ...EMPTY_STATE }
    }
  }

  async isHighWaterMark(id: string): Promise<boolean> {
    const state = await this.load()
    return state.highWaterMark === id
  }

  async filterNew(bookmarks: Bookmark[]): Promise<Bookmark[]> {
    const state = await this.load()
    const newBookmarks: Bookmark[] = []
    let foundMark = false

    for (const bookmark of bookmarks) {
      if (bookmark.id === state.highWaterMark) {
        foundMark = true
        break
      }
      newBookmarks.push(bookmark)
    }

    // First run: no high-water mark yet. Only process the 10 most recent
    // bookmarks so the user isn't overwhelmed on their first run.
    const MAX_FIRST_RUN = 10
    if (!state.highWaterMark) {
      if (newBookmarks.length > MAX_FIRST_RUN) {
        console.error(`First run — processing ${MAX_FIRST_RUN} most recent bookmarks (${newBookmarks.length} total).`)
      }
      return newBookmarks.slice(0, MAX_FIRST_RUN)
    }

    // Safety: if high-water mark wasn't found (bookmark was removed),
    // cap to prevent re-processing everything.
    const MAX_NEW_WITHOUT_MARK = 100
    if (!foundMark && newBookmarks.length > MAX_NEW_WITHOUT_MARK) {
      console.error(`Warning: high-water mark not found in bookmarks (may have been unbookmarked). Capping at ${MAX_NEW_WITHOUT_MARK}.`)
      return newBookmarks.slice(0, MAX_NEW_WITHOUT_MARK)
    }

    return newBookmarks
  }

  async update(newestId: string, cursor: string | null): Promise<void> {
    const state = await this.load()
    state.highWaterMark = newestId
    state.highWaterMarkTimestamp = new Date().toISOString()
    state.lastRun = new Date().toISOString()
    if (cursor !== null) {
      state.lastBookmarkCursor = cursor
    }
    await mkdir(this.dir, { recursive: true })
    await writeFile(this.statePath, JSON.stringify(state, null, 2))
  }
}
