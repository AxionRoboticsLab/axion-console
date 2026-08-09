import { provide, ref } from 'vue'
import { Notify } from 'quasar'
import { useControlParams } from 'stores/control-params'
import { useI18n } from 'vue-i18n'
import { v4 as uuidv4 } from 'uuid'
import { useVisualization } from 'stores/visualization'

/** 全局单例：切页不释放，登出时 releaseRosConnection() */
let shared = null

function createRosClient () {
  const { t } = useI18n()
  const connected = ref(false)
  const controlParams = useControlParams()
  const visualization = useVisualization()
  const url = controlParams.rosUrl
  let ws = null
  const advertised = new Set()
  const rosClient = {
    robotPose: ref({}),
    navState: ref('idle'),
    loadMapData: ref(function (data) {}),
    loadMapRaw: ref(function (data) {}),
    loadLaserScan: ref(function (data) {}),
    loadPath: ref(function (data) {}),
    loadTrajectory: ref(function (data) {}),
    loadCostMap: ref(function (data) {})
  }

  let alive = false
  let rec = null

  function isRos2 () {
    return controlParams.rosVersion === 'v2'
  }

  /** rosbridge 对 ROS2 需要 std_msgs/msg/String 这种带 /msg/ 的类型名 */
  function stringType () {
    return isRos2() ? 'std_msgs/msg/String' : 'std_msgs/String'
  }

  function resolveType (topic, type) {
    if (type) return type
    if (topic === '/map_command' || topic === '/map_state' || topic === '/nav_state') {
      return stringType()
    }
    if (topic === controlParams.cmdTopic) {
      return isRos2() ? 'geometry_msgs/msg/Twist' : 'geometry_msgs/Twist'
    }
    if (topic === '/robot_pose' || topic === '/goal_pose') {
      return isRos2() ? 'geometry_msgs/msg/PoseStamped' : 'geometry_msgs/PoseStamped'
    }
    if (topic === '/initialpose') {
      return isRos2()
        ? 'geometry_msgs/msg/PoseWithCovarianceStamped'
        : 'geometry_msgs/PoseWithCovarianceStamped'
    }
    if (topic === '/plan') {
      return isRos2() ? 'nav_msgs/msg/Path' : 'nav_msgs/Path'
    }
    return undefined
  }

  const createWs = () => {
    ws = new WebSocket(url)
    initWs()
  }

  const reConnect = () => {
    console.log('尝试重连')
    if (connected.value || !alive) return
    rec && clearTimeout(rec)
    rec = setTimeout(createWs, 5000)
  }

  const heartCheck = {
    timeoutObj: null,
    start: () => {
      heartCheck.timeoutObj = setTimeout(function () {
        if (!connected.value && alive) reConnect()
      }, 10000)
    },
    reset: () => {
      clearTimeout(heartCheck.timeoutObj)
      heartCheck.start()
    },
    stop: () => {
      clearTimeout(heartCheck.timeoutObj)
      heartCheck.timeoutObj = null
    }
  }

  const initWs = () => {
    ws.onclose = () => {
      connected.value = false
      advertised.clear()
      if (alive) reConnect()
    }

    ws.onerror = () => {
      connected.value = false
      reConnect()
    }

    ws.onopen = () => {
      connected.value = true
      heartCheck.start()
      // 浏览器侧发布前需 advertise，否则部分 rosbridge 会丢弃无 type 的 publish
      rosClient.advertise('/map_command', stringType())
      rosClient.advertise(controlParams.cmdTopic)
      rosClient.advertise('/initialpose')
      rosClient.advertise('/goal_pose')
      Notify.create({ type: 'positive', message: t('notify_ros_connect') })
    }

    ws.onmessage = (e) => {
      heartCheck.reset()
      const resData = JSON.parse(e.data)
      switch (resData.op.valueOf()) {
        case 'publish':
          processTopic(resData)
          break
        case 'service_response':
          serviceRsMap.set(resData.id, resData)
          break
        case 'status':
          if (resData.level === 'error') {
            console.error('[rosbridge]', resData.msg || resData)
          }
          break
      }
    }
  }

  const mapTopic = controlParams.mapTopic
  const laserScanTopic = visualization.laserScanTopic
  const pathTopic = visualization.pathTopic
  const trajectoryTopic = visualization.trajectoryTopic
  const costMapTopic = visualization.costMapTopic

  function processTopic (rosObject) {
    switch (rosObject.topic) {
      case '/robot_pose': rosClient.robotPose.value = rosObject.msg; break
      case '/map_metadata': rosClient.loadMapData.value(rosObject.msg); break
      case mapTopic: rosClient.loadMapRaw.value(rosObject.msg); break
      case laserScanTopic: rosClient.loadLaserScan.value(rosObject.msg); break
      case pathTopic:
      case '/plan':
        rosClient.loadPath.value(rosObject.msg)
        break
      case trajectoryTopic: rosClient.loadTrajectory.value(rosObject.msg); break
      case costMapTopic: rosClient.loadCostMap.value(rosObject.msg); break
      case '/map_state': rosClient.mapState.value = rosObject.msg.data; break
      case '/nav_state': rosClient.navState.value = rosObject.msg.data; break
    }
  }

  function wsSend (object) {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(object))
    } else if (alive) {
      setTimeout(() => wsSend(object), 200)
    }
  }

  rosClient.subscribe = (topic, type) => {
    const payload = { op: 'subscribe', topic }
    const resolved = resolveType(topic, type)
    if (resolved) payload.type = resolved
    wsSend(payload)
  }
  rosClient.unsubscribe = (topic) => { wsSend({ op: 'unsubscribe', topic }) }
  rosClient.advertise = (topic, type) => {
    const resolved = resolveType(topic, type)
    if (!resolved) return
    if (advertised.has(topic)) return
    advertised.add(topic)
    wsSend({ op: 'advertise', topic, type: resolved })
  }
  rosClient.publish = (topic, msg, type) => {
    const resolved = resolveType(topic, type)
    if (resolved) {
      rosClient.advertise(topic, resolved)
      wsSend({ op: 'publish', topic, msg, type: resolved })
    } else {
      wsSend({ op: 'publish', topic, msg })
    }
  }
  rosClient.wsSend = wsSend

  const serviceRsMap = new Map()
  function resolveServiceType (service, type) {
    if (type) return type
    if (service === '/get_map_files') {
      return isRos2() ? 'std_srvs/srv/Trigger' : 'std_srvs/Trigger'
    }
    return undefined
  }
  rosClient.call = async (service, args, options = {}) => {
    const id = uuidv4()
    const timeoutMs = options.timeoutMs ?? 8000
    const rosObj = {
      op: 'call_service',
      id,
      service,
      args: args === '' || args === undefined ? {} : args
    }
    const resolvedType = resolveServiceType(service, options.type)
    if (resolvedType) rosObj.type = resolvedType
    wsSend(rosObj)

    const started = Date.now()
    while (!serviceRsMap.has(id)) {
      if (Date.now() - started > timeoutMs) {
        throw new Error(`service timeout: ${service}`)
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    const result = serviceRsMap.get(id)
    serviceRsMap.delete(id)
    return result
  }

  rosClient.getParams = async (nodeName, params) => {
    const args = [params]
    const res = await rosClient.call(nodeName + '/get_parameters', args)
    return res.values
  }

  rosClient.setParam = async (nodeName, key, value) => {
    return rosClient.call('/rosapi/set_param', [nodeName + ':' + key, value + ''])
  }

  /** 已连接或连接中则复用，不重复弹「已建立」 */
  rosClient.init = () => {
    alive = true
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return
    }
    createWs()
  }

  rosClient.close = () => {
    const hadSocket = Boolean(ws)
    alive = false
    rec && clearTimeout(rec)
    rec = null
    heartCheck.stop()
    connected.value = false
    advertised.clear()
    try {
      ws?.close()
    } catch (_) { /* ignore */ }
    ws = null
    if (hadSocket) {
      Notify.create({ type: 'info', message: t('notify_ros_release') })
    }
  }

  rosClient.mapState = ref('idle')
  rosClient.connected = connected

  return rosClient
}

function provideRos (rosClient) {
  provide('mapState', rosClient.mapState)
  provide('navState', rosClient.navState)
  provide('robotPose', rosClient.robotPose)
  provide('subscribe', rosClient.subscribe)
  provide('unsubscribe', rosClient.unsubscribe)
  provide('publish', rosClient.publish)
  provide('connected', rosClient.connected)
}

/**
 * 在页面 setup 中调用：复用全局连接，并向当前组件树 provide
 */
export default function RosClient () {
  if (!shared) {
    shared = createRosClient()
  }
  provideRos(shared)
  return shared
}

/** 登出时调用：释放 WebSocket，下次进入页面再新建 */
export function releaseRosConnection () {
  if (!shared) return
  shared.close()
  shared = null
}
