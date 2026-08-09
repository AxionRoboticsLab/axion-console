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

/** 不传 mapId 则返回全部地图上的任务 */
export function listPatrolTasks (mapId) {
  const params = {}
  if (mapId != null) params.map_id = mapId
  return unwrap(api.get('/patrol_tasks', { params })).then((data) => data || [])
}

export function createPatrolTask ({ mapId, name, type = 'once', pointIds, config }) {
  return unwrap(api.post('/patrol_tasks', {
    map_id: mapId,
    name,
    type,
    point_ids: pointIds,
    config: config || {}
  }))
}

export function updatePatrolTask (taskId, { name, type, pointIds, mapId, config }) {
  const body = {}
  if (name != null) body.name = name
  if (type != null) body.type = type
  if (pointIds != null) body.point_ids = pointIds
  if (mapId != null) body.map_id = mapId
  if (config != null) body.config = config
  return unwrap(api.patch(`/patrol_tasks/${taskId}`, body))
}

export function deletePatrolTask (taskId) {
  return unwrap(api.delete(`/patrol_tasks/${taskId}`))
}

/** 规划最优路线并入任务池；可能 auto_started=true 直接 running */
export function executePatrolTask (taskId, { startX = 0, startY = 0, startYaw = 0 } = {}) {
  return unwrap(api.post(`/patrol_tasks/${taskId}/execute`, {
    start_x: startX,
    start_y: startY,
    start_yaw: startYaw
  }))
}

export function listPatrolRuns (params = {}) {
  const q = {}
  if (params.mapId != null) q.map_id = params.mapId
  if (params.status) q.status = params.status
  if (params.name) q.name = params.name
  if (params.result) q.result = params.result
  if (params.from) q.from = params.from
  if (params.to) q.to = params.to
  return unwrap(api.get('/patrol_tasks/runs', { params: q })).then((data) => data || [])
}

export function getPatrolRun (runId) {
  return unwrap(api.get(`/patrol_tasks/runs/${runId}`))
}

export function patrolRunAction (runId, action, extra = {}) {
  return unwrap(api.patch(`/patrol_tasks/runs/${runId}`, {
    action,
    ...extra
  }))
}
