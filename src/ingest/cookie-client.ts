import type { Bookmark, IngestResult } from './types'
import { buildXHeaders } from './x-api'
import { getQueryIds, saveQueryIds, discoverQueryIds } from './query-ids'
const BOOKMARKS_FEATURES = '{"graphql_timeline_v2_bookmark_timeline":true,"rweb_tipjar_consumption_enabled":true,"responsive_web_graphql_exclude_directive_enabled":true,"verified_phone_label_enabled":false,"creator_subscriptions_tweet_preview_api_enabled":true,"responsive_web_graphql_timeline_navigation_enabled":true,"responsive_web_graphql_skip_user_profile_image_extensions_enabled":false,"communities_web_enable_tweet_community_results_fetch":true,"c9s_tweet_anatomy_moderator_badge_enabled":true,"articles_preview_enabled":true,"responsive_web_edit_tweet_api_enabled":true,"graphql_is_translatable_rweb_tweet_is_translatable_enabled":true,"view_counts_everywhere_api_enabled":true,"longform_notetweets_consumption_enabled":true,"responsive_web_twitter_article_tweet_consumption_enabled":true,"tweet_awards_web_tipping_enabled":false,"creator_subscriptions_quote_tweet_preview_enabled":false,"freedom_of_speech_not_reach_fetch_enabled":true,"standardized_nudges_misinfo":true,"tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled":true,"rweb_video_timestamps_enabled":true,"longform_notetweets_rich_text_read_enabled":true,"longform_notetweets_inline_media_enabled":true,"responsive_web_enhance_cards_enabled":false}'

export class XAuthError extends Error {
  constructor(status: number) {
    super(`X authentication failed (${status}). Run /no-cap update-cookies to refresh your session cookies.`)
    this.name = 'XAuthError'
  }
}

export class XRateLimitError extends Error {
  constructor() {
    super('X rate limit hit (429). Processing bookmarks already fetched.')
    this.name = 'XRateLimitError'
  }
}

export class XApiChangedError extends Error {
  constructor() {
    super('X API returned 400. The internal API may have changed. Check for no-cap updates.')
    this.name = 'XApiChangedError'
  }
}

export class CookieClient {
  private retriedWithDiscovery = false

  constructor(
    private authToken: string,
    private ct0: string,
  ) {}

  async fetchBookmarks(cursor?: string): Promise<IngestResult & { cursor?: string }> {
    const queryIds = await getQueryIds()
    const variables: Record<string, unknown> = { count: 100 }
    if (cursor) variables.cursor = cursor

    const params = new URLSearchParams({
      variables: JSON.stringify(variables),
      features: BOOKMARKS_FEATURES,
    })

    const url = `https://x.com/i/api/graphql/${queryIds.bookmarks}/Bookmarks?${params}`

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        ...buildXHeaders(this.authToken, this.ct0),
        'content-type': 'application/json',
      },
    })

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new XAuthError(res.status)
      if (res.status === 429) throw new XRateLimitError()
      if (res.status === 400 || res.status === 404) {
        // Query ID might be stale — try auto-discovery and retry once
        if (!this.retriedWithDiscovery) {
          this.retriedWithDiscovery = true
          console.error('Got 400/404 — query ID may be stale. Auto-discovering...')
          try {
            const discovered = await discoverQueryIds()
            await saveQueryIds({ bookmarks: discovered.bookmarks, tweetDetail: discovered.tweetDetail })
            console.error(`Discovered new IDs. Retrying...`)
            return this.fetchBookmarks(cursor)
          } catch {
            // Discovery failed too — throw the original error
          }
        }
        throw new XApiChangedError()
      }
      throw new Error(`X API error: ${res.status} ${res.statusText}`)
    }

    let data: unknown
    try {
      data = await res.json()
    } catch {
      throw new Error('X returned invalid response (expected JSON). Possible HTML error page or empty body.')
    }
    return this.parseResponse(data)
  }

  private parseResponse(data: unknown): IngestResult & { cursor?: string } {
    const instructions = (data as any)?.data?.bookmark_timeline_v2?.timeline?.instructions ?? []
    const entries = instructions
      .filter((i: any) => i.type === 'TimelineAddEntries')
      .flatMap((i: any) => i.entries ?? [])

    const bookmarks: Bookmark[] = []
    let nextCursor: string | undefined

    for (const entry of entries) {
      if (entry.entryId?.startsWith('cursor-bottom')) {
        nextCursor = entry.content?.value
        continue
      }

      const tweet = entry.content?.itemContent?.tweet_results?.result
      if (!tweet) continue

      const bookmark = this.parseTweet(tweet)
      if (bookmark) bookmarks.push(bookmark)
    }

    return {
      bookmarks,
      totalFetched: bookmarks.length,
      alreadyProcessed: 0,
      cursor: nextCursor,
    }
  }

  private parseTweet(tweet: any): Bookmark | null {
    try {
      const legacy = tweet.legacy
      const user = tweet.core?.user_results?.result?.legacy

      if (!legacy || !user) return null

      const urls = (legacy.entities?.urls ?? []).map((u: any) => u.expanded_url).filter(Boolean)
      const media = (legacy.entities?.media ?? []).map((m: any) => m.media_url_https).filter(Boolean)

      let quotedTweet: Bookmark | undefined
      if (tweet.quoted_status_result?.result) {
        quotedTweet = this.parseTweet(tweet.quoted_status_result.result) ?? undefined
      }

      return {
        id: tweet.rest_id,
        text: legacy.full_text,
        authorHandle: user.screen_name,
        authorName: user.name,
        createdAt: legacy.created_at,
        url: `https://x.com/${user.screen_name}/status/${tweet.rest_id}`,
        quotedTweet,
        links: urls,
        media,
      }
    } catch (err) {
      console.error(`Failed to parse tweet ${tweet?.rest_id ?? 'unknown'}: ${err instanceof Error ? err.message : err}`)
      return null
    }
  }
}
