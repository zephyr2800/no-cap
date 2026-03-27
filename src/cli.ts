import { loadConfig } from './config.js'
import { CookieClient, XRateLimitError } from './ingest/cookie-client.js'
import { LinkFollower } from './ingest/link-follower.js'
import { StateTracker } from './state/tracker.js'
import { sendDigest } from './output/send-email.js'
import type { Bookmark, NocapConfig } from './ingest/types.js'

const command = process.argv[2]

async function main() {
  const config = await loadConfig()

  if (command === 'fetch') {
    await fetchBookmarks(config)
  } else if (command === 'status') {
    await showStatus(config)
  } else if (command === 'mark-done') {
    const newestId = process.argv[3]
    if (!newestId) {
      console.error('Usage: tsx src/cli.ts mark-done <newest-bookmark-id>')
      process.exit(1)
    }
    const tracker = new StateTracker(config.output.signalDir)
    await tracker.update(newestId, null)
    console.log(`High water mark updated to: ${newestId}`)
  } else if (command === 'send-email') {
    const subject = process.argv[3]
    const htmlPath = process.argv[4]
    if (!subject || !htmlPath) {
      console.error('Usage: tsx src/cli.ts send-email <subject> <html-file-path>')
      process.exit(1)
    }
    if (!config.output.email?.enabled || !config.output.email?.resendApiKey || !config.output.email?.to) {
      console.error('Email not configured. Run /no-cap setup first.')
      process.exit(1)
    }
    const { readFile } = await import('fs/promises')
    const html = await readFile(htmlPath, 'utf-8')
    const result = await sendDigest({
      apiKey: config.output.email.resendApiKey,
      to: config.output.email.to,
      subject,
      html,
    })
    console.log(`Email sent: ${result.id}`)
  } else if (command === 'update-cookies') {
    const authToken = process.argv[3]
    const ct0 = process.argv[4]
    if (!authToken || !ct0) {
      console.error('Usage: tsx src/cli.ts update-cookies <auth_token> <ct0>')
      process.exit(1)
    }
    console.log('Testing cookies...')
    try {
      const client = new CookieClient(authToken, ct0)
      const result = await client.fetchBookmarks()
      console.log(`Verified! Found ${result.bookmarks.length} bookmarks. Saving...`)
      const { saveConfig } = await import('./config.js')
      config.ingestion.authToken = authToken
      config.ingestion.ct0 = ct0
      await saveConfig(config)
      console.log('Cookies saved.')
    } catch (err) {
      console.error(`Cookie test failed: ${err instanceof Error ? err.message : err}`)
      console.error('Cookies NOT saved. Please verify they are correct.')
      process.exit(1)
    }
  } else if (command === 'auto-login') {
    const { extractXCookies } = await import('./ingest/chrome-cookies.js')
    const { saveConfig } = await import('./config.js')
    const profile = process.argv[3] // optional Chrome profile name
    console.log('Extracting X cookies from Chrome...')
    try {
      const cookies = await extractXCookies(profile)
      console.log('Cookies extracted. Testing...')
      const client = new CookieClient(cookies.authToken, cookies.ct0)
      const result = await client.fetchBookmarks()
      console.log(`Verified! Found ${result.bookmarks.length} bookmarks. Saving...`)
      config.ingestion.method = 'cookies'
      config.ingestion.authToken = cookies.authToken
      config.ingestion.ct0 = cookies.ct0
      await saveConfig(config)
      console.log('You\'re all set.')
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
      console.error('\nTroubleshooting:')
      console.error('  - Make sure Chrome is installed and you are logged into x.com')
      console.error('  - If macOS asks for Keychain access, click "Allow"')
      console.error('  - If you use a Chrome profile, pass it: auto-login "Profile 1"')
      process.exit(1)
    }
  } else if (command === 'discover') {
    const { discoverQueryIds, saveQueryIds } = await import('./ingest/query-ids.js')
    console.log('Discovering current X GraphQL query IDs from X bundles...')
    const result = await discoverQueryIds()
    await saveQueryIds({ bookmarks: result.bookmarks, tweetDetail: result.tweetDetail })
    console.log(`Bookmarks: ${result.bookmarks}${result.discovered.includes('Bookmarks') ? ' (discovered)' : ' (baseline — not in main bundle, may need manual update)'}`)
    console.log(`TweetDetail: ${result.tweetDetail}${result.discovered.includes('TweetDetail') ? ' (discovered)' : ' (baseline)'}`)
    console.log('Saved to ~/.no-cap/query-ids.json')
  } else {
    console.log('Usage: tsx src/cli.ts <fetch|status|mark-done|send-email|discover|update-cookies|auto-login>')
  }
}

async function fetchBookmarks(config: NocapConfig) {
  if (!config.ingestion.authToken || !config.ingestion.ct0) {
    console.error('Missing auth_token or ct0. Run /no-cap auto-login or /no-cap setup first.')
    process.exit(1)
  }

  const cookieClient = new CookieClient(config.ingestion.authToken, config.ingestion.ct0)
  const allBookmarks: Bookmark[] = []
  let cursor: string | undefined
  const MAX_BOOKMARKS = 200

  while (allBookmarks.length < MAX_BOOKMARKS) {
    try {
      const page = await cookieClient.fetchBookmarks(cursor)
      if (page.bookmarks.length === 0) break
      allBookmarks.push(...page.bookmarks)
      cursor = page.cursor
      if (!cursor) break
    } catch (err) {
      if (err instanceof XRateLimitError) {
        console.error(err.message)
        break
      }
      throw err
    }
  }

  const result = { bookmarks: allBookmarks.slice(0, MAX_BOOKMARKS), totalFetched: allBookmarks.length, alreadyProcessed: 0 }

  // Diff against state — stop at high water mark
  const tracker = new StateTracker(config.output.signalDir)
  const newBookmarks = await tracker.filterNew(result.bookmarks)

  if (newBookmarks.length === 0) {
    console.log('No new bookmarks since last run.')
    return
  }

  // Enrich with linked content (follow quoted tweets, fetch article previews)
  {
    const follower = new LinkFollower(config.ingestion.authToken, config.ingestion.ct0)
    for (let i = 0; i < newBookmarks.length; i++) {
      newBookmarks[i] = await follower.enrich(newBookmarks[i])
    }
  }

  // Output bookmark data as JSON for the skill to process
  const output = {
    bookmarks: newBookmarks,
    totalFetched: result.totalFetched,
    newCount: newBookmarks.length,
    alreadyProcessed: result.totalFetched - newBookmarks.length,
    newestId: newBookmarks.length > 0 ? newBookmarks[0].id : null,
  }

  console.log(JSON.stringify(output, null, 2))
}

async function showStatus(config: NocapConfig) {
  const tracker = new StateTracker(config.output.signalDir)
  const state = await tracker.load()

  console.log(`Last run: ${state.lastRun ?? 'never'}`)
  console.log(`High water mark: ${state.highWaterMark ?? 'none'}`)
  console.log(`Signal directory: ${config.output.signalDir}`)
  console.log(`Ingestion method: ${config.ingestion.method}`)
}

main().catch(err => {
  // Clean error messages for known error types, full trace for unexpected errors
  if (err instanceof Error && ['XAuthError', 'XRateLimitError', 'XApiChangedError'].includes(err.constructor.name)) {
    console.error(err.message)
  } else {
    console.error(err)
  }
  process.exit(1)
})
