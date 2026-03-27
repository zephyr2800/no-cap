import type { Bookmark } from './types'
import { buildXHeaders } from './x-api'
import { getQueryIds } from './query-ids'
const MAX_DEPTH = 2

export class LinkFollower {
  constructor(
    private authToken: string,
    private ct0: string,
  ) {}

  async enrich(bookmark: Bookmark, depth: number = 0): Promise<Bookmark> {
    if (depth >= MAX_DEPTH) return bookmark

    // Check for X article links — enrich the bookmark text with article content
    const articleLinks = bookmark.links.filter(link =>
      /^https?:\/\/(x\.com|twitter\.com)\/i\/article\/\d+/.test(link)
    )

    if (articleLinks.length > 0) {
      const enriched = await this.enrichWithArticle(bookmark)
      if (enriched) return enriched
    }

    if (bookmark.quotedTweet) return bookmark

    const tweetLinks = bookmark.links.filter(link =>
      /^https?:\/\/(x\.com|twitter\.com)\/\w+\/status\/\d+/.test(link)
    )

    if (tweetLinks.length === 0) return bookmark

    const tweetId = tweetLinks[0].match(/status\/(\d+)/)?.[1]
    if (!tweetId) return bookmark

    try {
      const linked = await this.fetchTweet(tweetId)
      if (linked) {
        const enrichedLinked = await this.enrich(linked, depth + 1)
        return { ...bookmark, quotedTweet: enrichedLinked }
      }
    } catch {
      // Silently skip failed link follows
    }

    return bookmark
  }

  /**
   * Re-fetch the bookmark's own tweet via TweetResultByRestId to get
   * embedded article title + preview_text. X articles are stored as
   * metadata on the parent tweet, not as separate content.
   */
  private async enrichWithArticle(bookmark: Bookmark): Promise<Bookmark | null> {
    try {
      const variables = JSON.stringify({
        tweetId: bookmark.id,
        withCommunity: false,
        includePromotedContent: false,
        withVoice: false,
      })
      const features = JSON.stringify({
        creator_subscriptions_tweet_preview_api_enabled: true,
        responsive_web_graphql_timeline_navigation_enabled: true,
        articles_preview_enabled: true,
        responsive_web_twitter_article_tweet_consumption_enabled: true,
        longform_notetweets_inline_media_enabled: true,
        longform_notetweets_rich_text_read_enabled: true,
        responsive_web_graphql_exclude_directive_enabled: true,
        verified_phone_label_enabled: false,
        responsive_web_enhance_cards_enabled: false,
        rweb_tipjar_consumption_enabled: true,
        tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
      })

      const queryIds = await getQueryIds()
      const params = new URLSearchParams({ variables, features })
      const url = `https://x.com/i/api/graphql/${queryIds.tweetResultByRestId}/TweetResultByRestId?${params}`

      const res = await fetch(url, {
        headers: buildXHeaders(this.authToken, this.ct0),
      })

      if (!res.ok) return null

      let data: unknown
      try {
        data = await res.json()
      } catch {
        return null
      }

      const result = (data as any)?.data?.tweetResult?.result
      if (!result) return null

      const article = result.article?.article_results?.result
      if (!article) return null

      const title = article.title || ''
      const preview = article.preview_text || ''

      if (!title && !preview) return null

      // Append article content to the bookmark text
      const articleText = `[Article: ${title}] ${preview}`
      const originalText = bookmark.text.trim()
      const isBareLink = /^https?:\/\/\S+$/.test(originalText)
      return {
        ...bookmark,
        text: isBareLink ? articleText : `${originalText}\n\n${articleText}`,
      }
    } catch {
      return null
    }
  }

  private async fetchTweet(tweetId: string): Promise<Bookmark | null> {
    const queryIds = await getQueryIds()
    const variables = JSON.stringify({ tweetId, withCommunity: false })
    const features = JSON.stringify({
      creator_subscriptions_tweet_preview_api_enabled: true,
      responsive_web_graphql_timeline_navigation_enabled: true,
    })

    const params = new URLSearchParams({ variables, features })
    const url = `https://x.com/i/api/graphql/${queryIds.tweetDetail}/TweetDetail?${params}`

    const res = await fetch(url, {
      headers: buildXHeaders(this.authToken, this.ct0),
    })

    if (!res.ok) return null

    let data: unknown
    try {
      data = await res.json()
    } catch {
      return null
    }
    const tweet = (data as any)?.data?.tweetResult?.result
    if (!tweet) return null

    const legacy = tweet.legacy
    const user = tweet.core?.user_results?.result?.legacy
    if (!legacy || !user) return null

    return {
      id: tweet.rest_id,
      text: legacy.full_text,
      authorHandle: user.screen_name,
      authorName: user.name,
      createdAt: legacy.created_at ?? '',
      url: `https://x.com/${user.screen_name}/status/${tweet.rest_id}`,
      links: (legacy.entities?.urls ?? []).map((u: any) => u.expanded_url).filter(Boolean),
      media: (legacy.entities?.media ?? []).map((m: any) => m.media_url_https).filter(Boolean),
    }
  }
}
