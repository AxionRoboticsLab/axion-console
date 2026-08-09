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

export function listMaps () {
  return unwrap(api.get('/maps')).then((data) => data || [])
}

/** 数据库中 status=1 的当前使用地图 */
export async function getActiveMap () {
  const maps = await listMaps()
  return (maps || []).find((m) => m.status === 1) || null
}

export function upsertMap (mapName, fileReady = true) {
  return unwrap(api.post('/maps', {
    map_name: mapName,
    file_ready: fileReady
  }))
}

export function activateMap (mapId) {
  return unwrap(api.post(`/maps/${mapId}/activate`))
}

export function deleteMap (mapId) {
  return unwrap(api.delete(`/maps/${mapId}`))
}

export function listPatrolPoints (mapId) {
  return unwrap(api.get(`/maps/${mapId}/patrol_points`)).then((data) => data || [])
}

export function createPatrolPoint (mapId, { name, x, y, yaw }) {
  return unwrap(api.post(`/maps/${mapId}/patrol_points`, { name, x, y, yaw }))
}

export function renamePatrolPoint (mapId, pointId, name) {
  return unwrap(api.patch(`/maps/${mapId}/patrol_points/${pointId}`, { name }))
}

export function deletePatrolPoint (mapId, pointId) {
  return unwrap(api.delete(`/maps/${mapId}/patrol_points/${pointId}`))
}
