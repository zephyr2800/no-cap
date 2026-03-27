import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { StateTracker } from '../../src/state/tracker.js'
import { writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import type { Bookmark } from '../../src/ingest/types.js'

const TEST_DIR = join(import.meta.dirname, '.tmp-integration')

describe('No Cap Pipeline', () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true })
  })

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true })
  })

  it('full pipeline: bookmarks → diff → state tracking', async () => {
    const bookmarks: Bookmark[] = [
      { id: '1', text: 'Great thread on MCTS', authorHandle: 'researcher', authorName: 'R', createdAt: '', url: 'https://x.com/researcher/status/1', links: [], media: [] },
      { id: '2', text: 'BUY MY COURSE', authorHandle: 'spammer', authorName: 'S', createdAt: '', url: 'https://x.com/spammer/status/2', links: [], media: [] },
      { id: '3', text: 'Local inference tips', authorHandle: 'dev', authorName: 'D', createdAt: '', url: 'https://x.com/dev/status/3', links: [], media: [] },
    ]

    // 1. All should be new (no high water mark)
    const tracker = new StateTracker(TEST_DIR)
    const newBookmarks = await tracker.filterNew(bookmarks)
    expect(newBookmarks).toHaveLength(3)

    // 2. Set high water mark
    await tracker.update(newBookmarks[0].id, null)

    // 3. Second run — first bookmark matches HWM, so 0 new
    const newBookmarks2 = await tracker.filterNew(bookmarks)
    expect(newBookmarks2).toHaveLength(0)
  })
})
