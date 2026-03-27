import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'

const QUERY_IDS_PATH = join(homedir(), '.no-cap', 'query-ids.json')

// Baseline IDs — these WILL go stale. Users update via `discover` command
// or by editing ~/.no-cap/query-ids.json directly.
const BASELINE: Record<string, string> = {
  bookmarks: 'tmd4ifV8RHltzn8ymGg1aw',
  tweetDetail: 'nBS-WpgA6ZG0OyoQfQXTNg',
  tweetResultByRestId: 'sBoAB5nqJTOyR9sZ5qVLsw',
}

interface QueryIdFile {
  bookmarks: string
  tweetDetail: string
  tweetResultByRestId: string
  updatedAt?: string
}

/**
 * Get current X GraphQL query IDs.
 * Reads from ~/.no-cap/query-ids.json, falls back to baseline.
 */
export async function getQueryIds(): Promise<{ bookmarks: string; tweetDetail: string; tweetResultByRestId: string }> {
  try {
    const raw = await readFile(QUERY_IDS_PATH, 'utf-8')
    const ids = JSON.parse(raw) as QueryIdFile
    if (ids.bookmarks && ids.tweetDetail) {
      return {
        bookmarks: ids.bookmarks,
        tweetDetail: ids.tweetDetail,
        tweetResultByRestId: ids.tweetResultByRestId ?? BASELINE.tweetResultByRestId,
      }
    }
  } catch {
    // No file yet — use baseline
  }
  return { bookmarks: BASELINE.bookmarks, tweetDetail: BASELINE.tweetDetail, tweetResultByRestId: BASELINE.tweetResultByRestId }
}

/**
 * Save query IDs to disk.
 */
export async function saveQueryIds(ids: { bookmarks: string; tweetDetail: string; tweetResultByRestId?: string }): Promise<void> {
  const data: QueryIdFile = { bookmarks: ids.bookmarks, tweetDetail: ids.tweetDetail, tweetResultByRestId: ids.tweetResultByRestId ?? BASELINE.tweetResultByRestId, updatedAt: new Date().toISOString() }
  await mkdir(join(homedir(), '.no-cap'), { recursive: true })
  await writeFile(QUERY_IDS_PATH, JSON.stringify(data, null, 2))
}

/**
 * Discover current query IDs by scraping X's main JS bundle.
 * Finds IDs in the main bundle; Bookmarks may be in a lazy chunk.
 * Returns whatever it finds, merged with baseline for missing ones.
 */
export async function discoverQueryIds(): Promise<{ bookmarks: string; tweetDetail: string; discovered: string[] }> {
  const mainPage = await fetch('https://x.com', {
    headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
  })
  if (!mainPage.ok) throw new Error('Failed to fetch x.com for query ID discovery (status ' + mainPage.status + ')')
  const html = await mainPage.text()

  const scriptUrls = [...html.matchAll(/src="(https:\/\/abs\.twimg\.com\/responsive-web\/client-web\/[^"]+\.js)"/g)]
    .map(m => m[1])

  const found: Record<string, string> = {}
  const discovered: string[] = []

  for (const url of scriptUrls) {
    try {
      const res = await fetch(url)
      const js = await res.text()

      // Scan all queryId+operationName pairs in the bundle
      const matches = [...js.matchAll(/queryId:"([^"]+)",operationName:"([^"]+)"/g)]
      for (const [, qid, opName] of matches) {
        if (opName === 'Bookmarks') { found.bookmarks = qid; discovered.push('Bookmarks') }
        if (opName === 'TweetDetail') { found.tweetDetail = qid; discovered.push('TweetDetail') }
        if (opName === 'TweetResultByRestId') { found.tweetResultByRestId = qid; discovered.push('TweetResultByRestId') }
      }
      if (found.bookmarks && found.tweetDetail && found.tweetResultByRestId) break
    } catch {
      // Skip failed fetches
    }
  }

  return {
    bookmarks: found.bookmarks ?? BASELINE.bookmarks,
    tweetDetail: found.tweetDetail ?? BASELINE.tweetDetail,
    tweetResultByRestId: found.tweetResultByRestId ?? BASELINE.tweetResultByRestId,
    discovered,
  }
}
