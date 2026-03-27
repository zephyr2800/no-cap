# No Cap

A Claude Code skill that turns your X/Twitter bookmarks into actionable signals, filtering out the noise.

Bookmark interesting posts on X. Run `/no-cap`. Get a filtered digest of what actually matters — structured markdown for your agents, styled HTML email for you.

## What This Does

- **Fetches your X bookmarks** automatically via session cookies from Chrome
- **Filters noise** through 3 layers — account patterns, post-level spam, content substance
- **Extracts signals** — actionable insights, tools, action items, learning resources
- **Routes to your projects** — signals get categorized by your interests and active projects
- **Delivers a digest** — dated markdown files + optional HTML email (Claude newsletter style)

## Installation

```bash
git clone https://github.com/zephyr2800/no-cap.git
cd no-cap
./install.sh
```

Requires Node.js 18+ and Chrome (logged into X).

## Setup

In Claude Code:

```
/no-cap setup
```

This walks you through:

1. **Auth** — extracts X cookies from Chrome automatically (just type your Mac password)
2. **Output directory** — where signal files get saved (default: `~/no-cap-signals/`)
3. **Interests** — topics you track (e.g. "AI agents", "fine-tuning LLMs")
4. **Projects** — active projects to route signals to (e.g. "my-app — AI dashboard")
5. **Email digest** — optional, needs a free [Resend](https://resend.com) API key (100 emails/day)

Or set up auth manually:

```bash
cd no-cap
npx tsx src/cli.ts auto-login
```

## Usage

```
/no-cap
```

That's it. The skill fetches new bookmarks, filters noise, extracts signals, writes output, and sends the email digest. First run processes your 10 most recent bookmarks. After that, every run picks up where the last one left off.

### Other commands

| Command | What it does |
|---|---|
| `/no-cap setup` | Full configuration walkthrough |
| `/no-cap auto-login` | Re-extract cookies from Chrome |
| `/no-cap status` | Show last run, high water mark, config |
| `/no-cap update-cookies` | Refresh expired cookies manually |

## How It Works

**3-layer noise filter:**

1. **Account-level** — Is this a marketing account? Repeating the same pitch? Carpet-bagging on trends?
2. **Post-level** — Affiliate links? "Link in bio"? Engagement bait? Ads?
3. **Content-level** — Is there an extractable idea? Is it novel or repackaged? Would it change how you build?

Posts that survive get classified by intent (signal, action item, learning resource, project-relevant) and written to dated session files and a rolling master file.

**Article enrichment:** When a bookmark links to an X article (`x.com/i/article/...`), the skill automatically fetches the article title and preview text via the X API — no bare links filtered as noise.

**Email digest:** Claude newsletter-style HTML email with icon cards, two-column layout, project routing, and a noise section showing what was filtered and why. Every @handle links to the original tweet.

## Output

```
~/no-cap-signals/
  MASTER.md              — cumulative signal file (agent-optimized)
  2026-03-25/
    session-1.md         — today's signals, noise, stats
    digest-1.html        — email digest
  state.json             — high water mark for diffing
```

## FAQ

**Auth not working?**
Run `npx tsx src/cli.ts auto-login` from the repo directory. macOS will prompt for Keychain access — click Allow. If that fails, get cookies from Chrome DevTools (Application > Cookies > x.com) and run `npx tsx src/cli.ts update-cookies <auth_token> <ct0>`.

**Getting 400 errors?**
X rotates their internal GraphQL query IDs. Run `npx tsx src/cli.ts discover` to re-discover them.

**Email going to spam?**
Resend's free tier sends from a shared domain. Check spam on first run and mark as "Not Spam." For better deliverability, verify your own domain in Resend.

**First run only processed 10 bookmarks?**
That's intentional — prevents overwhelming you on the first run. After that, every run processes all new bookmarks.

**Where are signals saved?**
In your configured output directory (default `~/no-cap-signals/`), organized by date. `MASTER.md` tracks cumulative signals across sessions.

## Philosophy

- **Assume noise until proven signal.** Most bookmarked content is still noise.
- **Strong opinions from practitioners are signal.** Real expertise sharing genuine takes is not noise. Marketing is.
- **Extract the mechanism, not the story.** Strip narrative, isolate what's useful.
- **Route, don't hoard.** Every signal ends up somewhere — a project, an action item, or a learning resource.

## Built With

TypeScript, Claude Code, Resend

## License

MIT
