export interface Bookmark {
  id: string
  text: string
  authorHandle: string
  authorName: string
  createdAt: string
  url: string
  quotedTweet?: Bookmark
  links: string[]
  media: string[]
}

export interface IngestResult {
  bookmarks: Bookmark[]
  totalFetched: number
  alreadyProcessed: number
}

export interface Signal {
  title: string
  type: 'technical_insight' | 'market_signal' | 'workflow' | 'tool' | 'trend' | 'opinion'
  actionability: 'immediate' | 'near_term' | 'reference'
  tags: string[]
  source: {
    author: string
    url: string
    date: string
  }
  context: string
}

export interface NoiseResult {
  postId: string
  author: string
  reason: string
  layer: 1 | 2 | 3
}

export interface SessionResult {
  date: string
  sessionNumber: number
  signals: Signal[]
  noise: NoiseResult[]
  stats: {
    bookmarksProcessed: number
    signalsExtracted: number
    noiseFiltered: number
  }
}

export interface NocapConfig {
  repoPath?: string
  ingestion: {
    method: 'cookies'
    authToken?: string
    ct0?: string
  }
  interests?: string[]
  projects?: { name: string; description: string }[]
  output: {
    signalDir: string
    email?: {
      enabled: boolean
      to: string
      resendApiKey: string
    }
  }
}

export interface NocapState {
  lastRun: string | null
  highWaterMark: string | null
  highWaterMarkTimestamp: string | null
  lastBookmarkCursor: string | null
}
