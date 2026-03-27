import { getCookies } from 'chrome-cookie-decrypt'

interface XCookies {
  authToken: string
  ct0: string
}

/**
 * Extract X/Twitter session cookies from the user's Chrome browser.
 * Requires: Chrome installed, user logged into X in Chrome.
 * macOS will prompt for Keychain access on first use.
 */
export async function extractXCookies(profile?: string): Promise<XCookies> {
  const cookies = await getCookies('x.com', profile)

  const authToken = cookies.find(c => c.name === 'auth_token')?.value
  const ct0 = cookies.find(c => c.name === 'ct0')?.value

  if (!authToken) {
    throw new Error('Could not find auth_token cookie. Make sure you are logged into X in Chrome.')
  }

  if (!ct0) {
    throw new Error('Could not find ct0 cookie. Make sure you are logged into X in Chrome.')
  }

  return { authToken, ct0 }
}
