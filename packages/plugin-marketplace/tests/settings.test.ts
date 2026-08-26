import { describe, expect, it } from 'vitest'
import { normalizeHubBaseUrl, validateHubBaseUrl } from '../src/settings.js'

describe('Framework Hub settings boundary', () => {
  it('accepts HTTPS and loopback HTTP', () => {
    expect(normalizeHubBaseUrl('https://hub.example.test/path/')).toBe('https://hub.example.test/path')
    expect(validateHubBaseUrl('http://127.0.0.1:8787').href).toBe('http://127.0.0.1:8787/')
    expect(validateHubBaseUrl('http://localhost:8787').href).toBe('http://localhost:8787/')
  })

  it('rejects remote HTTP, credentials, queries and fragments', () => {
    expect(() => validateHubBaseUrl('http://hub.example.test')).toThrow('HTTPS')
    expect(() => validateHubBaseUrl('https://user:secret@hub.example.test')).toThrow('credentials')
    expect(() => validateHubBaseUrl('https://hub.example.test?token=secret')).toThrow('query')
    expect(() => validateHubBaseUrl('https://hub.example.test/#section')).toThrow('query')
  })
})
