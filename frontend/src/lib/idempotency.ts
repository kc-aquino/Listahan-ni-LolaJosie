export type IdempotencyAttempt = {
  current: { fingerprint: string; key: string } | null
}

export function idempotencyKeyFor(attempt: IdempotencyAttempt, request: unknown) {
  const fingerprint = JSON.stringify(request)
  if (attempt.current?.fingerprint === fingerprint) {
    return attempt.current.key
  }
  const key = crypto.randomUUID()
  attempt.current = { fingerprint, key }
  return key
}
