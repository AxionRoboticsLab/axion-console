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

export function listWaypoints (mapId) {
  return unwrap(api.get(`/maps/${mapId}/waypoints`)).then((data) => data || [])
}

export function createWaypoint (mapId, { name, x, y, yaw }) {
  return unwrap(api.post(`/maps/${mapId}/waypoints`, { name, x, y, yaw }))
}

export function renameWaypoint (mapId, waypointId, name) {
  return unwrap(api.patch(`/maps/${mapId}/waypoints/${waypointId}`, { name }))
}

export function deleteWaypoint (mapId, waypointId) {
  return unwrap(api.delete(`/maps/${mapId}/waypoints/${waypointId}`))
}
