import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { StateTracker } from '../../src/state/tracker'
import { mkdir, rm } from 'fs/promises'
import { join } from 'path'
import type { Bookmark } from '../../src/ingest/types'

const TEST_DIR = join(import.meta.dirname, '.tmp-state-test')

describe('StateTracker', () => {
  let tracker: StateTracker

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true })
    tracker = new StateTracker(TEST_DIR)
  })

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true })
  })

  it('initializes with empty state when no file exists', async () => {
    const state = await tracker.load()
    expect(state.highWaterMark).toBeNull()
    expect(state.highWaterMarkTimestamp).toBeNull()
    expect(state.lastRun).toBeNull()
    expect(state.lastBookmarkCursor).toBeNull()
  })

  it('saves and loads high water mark', async () => {
    await tracker.update('tweet_99', 'cursor_abc')
    const state = await tracker.load()
    expect(state.highWaterMark).toBe('tweet_99')
    expect(state.highWaterMarkTimestamp).not.toBeNull()
    expect(state.lastBookmarkCursor).toBe('cursor_abc')
    expect(state.lastRun).not.toBeNull()
  })

  it('checks if a bookmark ID is the high water mark', async () => {
    await tracker.update('tweet_99', null)
    expect(await tracker.isHighWaterMark('tweet_99')).toBe(true)
    expect(await tracker.isHighWaterMark('tweet_100')).toBe(false)
  })

  it('updates high water mark on subsequent runs', async () => {
    await tracker.update('tweet_50', null)
    await tracker.update('tweet_99', null)
    const state = await tracker.load()
    expect(state.highWaterMark).toBe('tweet_99')
  })

  it('filterNew returns all bookmarks when no high water mark', async () => {
    const bookmarks: Bookmark[] = [
      { id: '3', text: 'Third', authorHandle: 'u', authorName: 'U', createdAt: '', url: '', links: [], media: [] },
      { id: '2', text: 'Second', authorHandle: 'u', authorName: 'U', createdAt: '', url: '', links: [], media: [] },
      { id: '1', text: 'First', authorHandle: 'u', authorName: 'U', createdAt: '', url: '', links: [], media: [] },
    ]
    const result = await tracker.filterNew(bookmarks)
    expect(result).toHaveLength(3)
  })

  it('filterNew stops at high water mark', async () => {
    await tracker.update('2', null)
    const bookmarks: Bookmark[] = [
      { id: '4', text: 'Newest', authorHandle: 'u', authorName: 'U', createdAt: '', url: '', links: [], media: [] },
      { id: '3', text: 'New', authorHandle: 'u', authorName: 'U', createdAt: '', url: '', links: [], media: [] },
      { id: '2', text: 'Old', authorHandle: 'u', authorName: 'U', createdAt: '', url: '', links: [], media: [] },
      { id: '1', text: 'Oldest', authorHandle: 'u', authorName: 'U', createdAt: '', url: '', links: [], media: [] },
    ]
    const result = await tracker.filterNew(bookmarks)
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('4')
    expect(result[1].id).toBe('3')
  })

  it('filterNew caps results when high-water mark is missing (unbookmarked)', async () => {
    // Set a high-water mark that won't appear in the bookmark list
    await tracker.update('deleted_tweet', null)

    // Generate 150 bookmarks — more than the 100 safety cap
    const bookmarks: Bookmark[] = Array.from({ length: 150 }, (_, i) => ({
      id: `tweet_${i}`,
      text: `Bookmark ${i}`,
      authorHandle: 'u',
      authorName: 'U',
      createdAt: '',
      url: '',
      links: [],
      media: [],
    }))

    const result = await tracker.filterNew(bookmarks)
    expect(result).toHaveLength(100)
    expect(result[0].id).toBe('tweet_0')
    expect(result[99].id).toBe('tweet_99')
  })

  it('filterNew returns all when mark missing but count is under cap', async () => {
    await tracker.update('deleted_tweet', null)

    const bookmarks: Bookmark[] = Array.from({ length: 50 }, (_, i) => ({
      id: `tweet_${i}`,
      text: `Bookmark ${i}`,
      authorHandle: 'u',
      authorName: 'U',
      createdAt: '',
      url: '',
      links: [],
      media: [],
    }))

    const result = await tracker.filterNew(bookmarks)
    expect(result).toHaveLength(50)
  })
})
