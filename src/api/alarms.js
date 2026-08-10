import { api } from 'boot/axios'

async function unwrap (promise) {
  const { data: body } = await promise
  if (body?.code !== 0) {
    const err = new Error(body?.msg || 'request failed')
    err.code = body?.code
    err.body = body
    throw err
  }
  return body.data
}

/** 告警事件列表 */
export function listAlarmEvents (params = {}) {
  const q = {}
  if (params.status) q.status = params.status
  if (params.level) q.level = params.level
  if (params.code) q.code = params.code
  if (params.limit != null) q.limit = params.limit
  return unwrap(api.get('/alarms/events', { params: q })).then((data) => data || [])
}

/** 上报告警（来自 /alarm_event 话题） */
export function ingestAlarmEvent (payload) {
  return unwrap(api.post('/alarms/events', {
    code: payload.code,
    level: payload.level || 'warn',
    event: payload.event || '',
    detail: payload.detail || '',
    source: payload.source || 'console'
  }))
}

export function ackAlarmEvent (eventId) {
  return unwrap(api.patch(`/alarms/events/${eventId}/ack`))
}
