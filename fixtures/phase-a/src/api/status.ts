import { defineApi, method } from '@becomeopc/dshx/api'

export interface Status {
  readonly project: string
  readonly startedAt: string
  readonly requestCount: number
}

export const statusApi = defineApi({
  id: 'status',
  version: 1,
  methods: {
    get: method<void, Status>(),
    refresh: method<{ readonly force?: boolean }, Status>(),
  },
})
