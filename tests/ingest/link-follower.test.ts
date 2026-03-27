import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/ingest/query-ids', () => ({
  getQueryIds: vi.fn().mockResolvedValue({
    bookmarks: 'test_bookmarks_id',
    tweetDetail: 'test_tweet_detail_id',
  }),
}))

import { LinkFollower } from '../../src/ingest/link-follower'
import type { Bookmark } from '../../src/ingest/types'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('LinkFollower', () => {
  let follower: LinkFollower

  beforeEach(() => {
    mockFetch.mockReset()
    follower = new LinkFollower('test_auth', 'test_ct0')
  })

  it('returns bookmark as-is when no links or quotes', async () => {
    const bookmark: Bookmark = {
      id: '1', text: 'Simple tweet', authorHandle: 'user1',
      authorName: 'User', createdAt: '', url: '', links: [], media: [],
    }

    const enriched = await follower.enrich(bookmark)
    expect(enriched).toEqual(bookmark)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('follows x.com links to fetch tweet content', async () => {
    const bookmark: Bookmark = {
      id: '1', text: 'Check this out', authorHandle: 'user1',
      authorName: 'User', createdAt: '', url: '',
      links: ['https://x.com/other/status/999'], media: [],
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { tweetResult: { result: {
          rest_id: '999',
          legacy: { full_text: 'Linked tweet content', entities: { urls: [] } },
          core: { user_results: { result: { legacy: { screen_name: 'other', name: 'Other' } } } },
        } } },
      }),
    })

    const enriched = await follower.enrich(bookmark)
    expect(enriched.quotedTweet).toBeDefined()
    expect(enriched.quotedTweet!.text).toBe('Linked tweet content')
  })

  it('recursively enriches linked tweets', async () => {
    const bookmark: Bookmark = {
      id: '1', text: 'Chain start', authorHandle: 'user1',
      authorName: 'User', createdAt: '', url: '',
      links: ['https://x.com/a/status/2'], media: [],
    }

    // First fetch returns tweet with a link to another tweet
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { tweetResult: { result: {
          rest_id: '2',
          legacy: { full_text: 'Level 1', entities: { urls: [{ expanded_url: 'https://x.com/b/status/3' }] } },
          core: { user_results: { result: { legacy: { screen_name: 'a', name: 'A' } } } },
        } } },
      }),
    })

    // Second fetch returns the deeply linked tweet
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { tweetResult: { result: {
          rest_id: '3',
          legacy: { full_text: 'Level 2', entities: { urls: [] } },
          core: { user_results: { result: { legacy: { screen_name: 'b', name: 'B' } } } },
        } } },
      }),
    })

    const enriched = await follower.enrich(bookmark)
    expect(enriched.quotedTweet).toBeDefined()
    expect(enriched.quotedTweet!.text).toBe('Level 1')
    expect(enriched.quotedTweet!.quotedTweet).toBeDefined()
    expect(enriched.quotedTweet!.quotedTweet!.text).toBe('Level 2')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('respects max depth of 2', async () => {
    const bookmark: Bookmark = {
      id: '1', text: 'Deep chain', authorHandle: 'user1',
      authorName: 'User', createdAt: '', url: '',
      links: ['https://x.com/a/status/2'], media: [],
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { tweetResult: { result: {
          rest_id: '2',
          legacy: { full_text: 'Level 2', entities: { urls: [{ expanded_url: 'https://x.com/b/status/3' }] } },
          core: { user_results: { result: { legacy: { screen_name: 'a', name: 'A' } } } },
        } } },
      }),
    })

    const enriched = await follower.enrich(bookmark, 1)
    expect(enriched.quotedTweet).toBeDefined()
    // At depth=1, it fetches tweet 2, then tries to enrich at depth=2 which hits MAX_DEPTH
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
