import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock query-ids before importing cookie-client
vi.mock('../../src/ingest/query-ids', () => ({
  getQueryIds: vi.fn().mockResolvedValue({
    bookmarks: 'test_bookmarks_id',
    tweetDetail: 'test_tweet_detail_id',
  }),
  discoverQueryIds: vi.fn().mockRejectedValue(new Error('discovery failed')),
  saveQueryIds: vi.fn().mockResolvedValue(undefined),
}))

import { CookieClient, XAuthError, XRateLimitError, XApiChangedError } from '../../src/ingest/cookie-client'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('CookieClient', () => {
  let client: CookieClient

  beforeEach(() => {
    mockFetch.mockReset()
    client = new CookieClient('test_auth_token', 'test_ct0')
  })

  it('sends correct headers with request', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { bookmark_timeline_v2: { timeline: { instructions: [] } } }
      }),
    })

    await client.fetchBookmarks()

    const call = mockFetch.mock.calls[0]
    const url = call[0] as string
    const opts = call[1] as RequestInit
    expect(url).toContain('Bookmarks')
    expect(opts.headers).toHaveProperty('x-csrf-token', 'test_ct0')
    expect((opts.headers as Record<string, string>)['cookie']).toContain('auth_token=test_auth_token')
  })

  it('parses bookmarks from API response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeFakeBookmarkResponse([
        { id: '1', text: 'Test tweet', handle: 'user1' },
      ]),
    })

    const result = await client.fetchBookmarks()
    expect(result.bookmarks).toHaveLength(1)
    expect(result.bookmarks[0].id).toBe('1')
    expect(result.bookmarks[0].text).toBe('Test tweet')
    expect(result.bookmarks[0].authorHandle).toBe('user1')
  })

  it('throws XAuthError on 401', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    })

    await expect(client.fetchBookmarks()).rejects.toThrow(XAuthError)
  })

  it('throws XAuthError on 403', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    })

    await expect(client.fetchBookmarks()).rejects.toThrow(XAuthError)
  })

  it('throws XRateLimitError on 429', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    })

    await expect(client.fetchBookmarks()).rejects.toThrow(XRateLimitError)
  })

  it('throws XApiChangedError on 400 after auto-discovery attempt', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
    })

    await expect(client.fetchBookmarks()).rejects.toThrow(XApiChangedError)
  })

  it('retries with discovered IDs on 400 when discovery succeeds', async () => {
    const { discoverQueryIds, saveQueryIds } = await import('../../src/ingest/query-ids')
    const mockDiscover = vi.mocked(discoverQueryIds)
    const mockSave = vi.mocked(saveQueryIds)

    mockDiscover.mockResolvedValueOnce({
      bookmarks: 'new_bookmarks_id',
      tweetDetail: 'new_tweet_detail_id',
      discovered: ['Bookmarks', 'TweetDetail'],
    })
    mockSave.mockResolvedValueOnce(undefined)

    // First call returns 400, second call (retry) succeeds
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 400, statusText: 'Bad Request' })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { bookmark_timeline_v2: { timeline: { instructions: [] } } },
        }),
      })

    // Need a fresh client since retriedWithDiscovery is per-instance
    const freshClient = new CookieClient('test_auth_token', 'test_ct0')
    const result = await freshClient.fetchBookmarks()
    expect(result.bookmarks).toHaveLength(0)
    expect(mockDiscover).toHaveBeenCalled()
    expect(mockSave).toHaveBeenCalled()
  })

  it('throws generic error on other status codes', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    })

    await expect(client.fetchBookmarks()).rejects.toThrow('X API error: 500')
  })
})

function makeFakeBookmarkResponse(tweets: { id: string; text: string; handle: string }[]) {
  return {
    data: {
      bookmark_timeline_v2: {
        timeline: {
          instructions: [{
            type: 'TimelineAddEntries',
            entries: tweets.map(t => ({
              entryId: `tweet-${t.id}`,
              content: {
                entryType: 'TimelineTimelineItem',
                itemContent: {
                  tweet_results: {
                    result: {
                      rest_id: t.id,
                      legacy: {
                        full_text: t.text,
                        entities: { urls: [] },
                      },
                      core: {
                        user_results: {
                          result: {
                            legacy: {
                              screen_name: t.handle,
                              name: t.handle,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            })),
          }],
        },
      },
    },
  }
}
