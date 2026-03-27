import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the resend module
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({
        data: { id: 'test_email_id' },
        error: null,
      }),
    },
  })),
}))

import { sendDigest } from '../../src/output/send-email.js'

describe('sendDigest', () => {
  it('sends email and returns id', async () => {
    const result = await sendDigest({
      apiKey: 'test_key',
      to: 'user@example.com',
      subject: 'Test',
      html: '<h1>Test</h1>',
    })
    expect(result.id).toBe('test_email_id')
  })
})
