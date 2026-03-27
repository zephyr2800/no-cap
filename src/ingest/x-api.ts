// This is X/Twitter's PUBLIC web-app bearer token, embedded in x.com's JavaScript.
// It is NOT a per-user secret. Every X scraping tool uses this same token.
// It authenticates the "app" (web client), not the user (that's the cookie).
// If this gets flagged by a secret scanner, it's a false positive.
export const X_BEARER = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA'

export function buildXHeaders(authToken: string, ct0: string): Record<string, string> {
  return {
    'authorization': `Bearer ${X_BEARER}`,
    'x-csrf-token': ct0,
    'cookie': `auth_token=${authToken}; ct0=${ct0}`,
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  }
}
