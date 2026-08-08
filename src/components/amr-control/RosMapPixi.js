import { getCssVar } from 'quasar'
import { useControlParams } from 'stores/control-params'
import { Application, Sprite, Container, Texture, Graphics, Assets, BufferImageSource } from 'pixi.js'

const controlParam = useControlParams()

export default function () {
  const mapRender = {
    dragging: false,
    focusing: false,
    poseColor: '0xFF6666',
    lastPosition: {
      x: 0,
      y: 0
    },
    poseContainer: new Container()
  }

  /**
   * 在Canvas中渲染机器人的图标
   */
  mapRender.createRobot = async () => {
    if (mapRender.robot) {
      return
    }
    mapRender.robotTexture = await Assets.load('arrow.png')

    const robot = new Sprite(mapRender.robotTexture)
    robot.alpha = 1
    robot.scale.set(controlParam.arrowScale / mapRender.robotTexture.width)
    robot.anchor.set(0.5)
    robot.tint = getCssVar('primary')
    mapRender.robot = new Container()
    mapRender.robot.addChild(robot)
    mapRender.placeRobotAtMapCenter()
    mapRender.updateStage()
    mapRender.centerOnMap()
  }

  mapRender.mapCenter = () => {
    const info = mapRender.mapInfo
    if (!info) {
      return { x: 0, y: 0 }
    }
    return {
      x: info.origin.position.x + (info.width * info.resolution) / 2,
      y: info.origin.position.y + (info.height * info.resolution) / 2
    }
  }

  /** 地图世界坐标包围盒（略向内收，避免贴边） */
  mapRender.mapBounds = () => {
    const info = mapRender.mapInfo
    if (!info) return null
    const pad = Math.max(info.resolution * 3, 0.15)
    const minX = info.origin.position.x + pad
    const minY = info.origin.position.y + pad
    const maxX = info.origin.position.x + info.width * info.resolution - pad
    const maxY = info.origin.position.y + info.height * info.resolution - pad
    return { minX, minY, maxX, maxY }
  }

  mapRender.clampWorld = (x, y) => {
    const b = mapRender.mapBounds()
    if (!b) return { x, y }
    return {
      x: Math.min(b.maxX, Math.max(b.minX, x)),
      y: Math.min(b.maxY, Math.max(b.minY, y))
    }
  }

  /** 无 /robot_pose 时，把箭头放在地图中心，避免停在画布左上角 */
  mapRender.placeRobotAtMapCenter = () => {
    if (!mapRender.robot) {
      return
    }
    const c = mapRender.mapCenter()
    mapRender.robot.x = c.x
    mapRender.robot.y = -c.y
    mapRender.robot.rotation = 0
    mapRender.pose = {
      position: { x: c.x, y: c.y, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 }
    }
  }

  /** 把地图中心对准画布可视区域中心 */
  mapRender.centerOnMap = () => {
    if (!mapRender.app || !mapRender.canvas || !mapRender.mapInfo) {
      return
    }
    const c = mapRender.mapCenter()
    const w = mapRender.app.screen?.width || mapRender.canvas.clientWidth || mapRender.canvas.offsetWidth
    const h = mapRender.app.screen?.height || mapRender.canvas.clientHeight || mapRender.canvas.offsetHeight
    const sx = mapRender.app.stage.scale.x
    const sy = mapRender.app.stage.scale.y
    mapRender.app.stage.x = w / 2 - c.x * sx
    mapRender.app.stage.y = h / 2 + c.y * sy
  }

  /**
   * 更新机器人的位置和角度
   * @param pose 机器人的Pose
   */
  mapRender.updateRobotPose = (pose) => {
    if (!mapRender.robot || !pose?.position || !pose?.orientation) {
      return
    }
    const clamped = mapRender.clampWorld(pose.position.x, pose.position.y)
    mapRender.robot.x = clamped.x
    mapRender.robot.y = -clamped.y
    // 箭头贴图朝上；yaw=0 朝屏幕上方（与摇杆「上」一致）
    mapRender.robot.rotation = -mapRender.quaternionToTheta(pose.orientation) * Math.PI / 180
    mapRender.pose = {
      position: { x: clamped.x, y: clamped.y, z: pose.position.z || 0 },
      orientation: pose.orientation
    }
    mapRender.removeTarget()
    return mapRender.pose
  }

  mapRender.updateTargetPose = (pose) => {
    if (mapRender.target) {
      mapRender.target.x = pose.position.x
      mapRender.target.y = -pose.position.y
      mapRender.target.rotation = (90 + mapRender.quaternionToTheta(pose.orientation)) * Math.PI / 180
    } else {
      const target = new Sprite(mapRender.robotTexture)
      target.anchor.set(0.5)
      target.alpha = 0.66
      target.scale.set(controlParam.arrowScale / mapRender.robotTexture.width)
      target.tint = getCssVar('positive')
      target.x = pose.position.x
      target.y = -pose.position.y
      target.rotation = (90 + mapRender.quaternionToTheta(pose.orientation)) * Math.PI / 180
      mapRender.target = target
      mapRender.app.stage.addChild(mapRender.target)
    }
  }

  mapRender.removeTarget = () => {
    if (mapRender.target?.parent) {
      mapRender.target.parent.removeChild(mapRender.target)
    }
    mapRender.target = null
  }

  mapRender.loadPoseList = async function (poseList) {
    mapRender.poseContainer.removeChildren()

    mapRender.poseTexture = await Assets.load('pose.png')

    poseList.forEach(p => {
      const pos = p.pose || p
      const point = new Sprite(mapRender.poseTexture)
      point.anchor.set(0.5)
      point.alpha = 0.66
      const scale = controlParam.arrowScale / mapRender.poseTexture.width
      point.scale.set(scale)
      point.tint = getCssVar('info')

      point.x = pos.position.x
      point.y = -pos.position.y
      point.rotation = (90 + mapRender.quaternionToTheta(pos.orientation)) * Math.PI / 180
      point.label = p.header.seq

      mapRender.poseContainer.addChild(point)
    })
  }

  mapRender.changePoseColor = (seq) => {
    mapRender.poseContainer.children.forEach(point => {
      if (point.label === seq) {
        point.tint = getCssVar('positive')
      } else {
        point.tint = getCssVar('info')
      }
    })
  }

  mapRender.quaternionToTheta = (quaternion) => {
    const q0 = quaternion.w
    const q1 = quaternion.x
    const q2 = quaternion.y
    const q3 = quaternion.z
    // Canvas rotation is clock wise and in degrees
    return (-Math.atan2(2 * (q0 * q3 + q1 * q2), 1 - 2 * (q2 * q2 + q3 * q3)) * 180.0 / Math.PI)
  }

  /**
   * 初始化地图
   * @param option 传入参数，需包含需要渲染的canvas
   */
  mapRender.init = async (option) => {
    mapRender.canvas = option.canvas
    // 禁止浏览器默认拖拽/滚动，避免「外层画板」跟着跑
    Object.assign(mapRender.canvas.style, {
      touchAction: 'none',
      userSelect: 'none',
      display: 'block',
      overflow: 'hidden'
    })

    const app = new Application()
    await app.init({
      background: getCssVar('info'),
      resizeTo: option.canvas,
      canvas: option.canvas
    })

    /*
    鼠标滚轮缩放
     */
    app.canvas.addEventListener('wheel', event => {
      event.preventDefault()
      event.stopPropagation()
      const scale = mapRender.app.stage.scale
      const delta = event.deltaY > 0 ? 0.9 : 1.1
      scale.set(scale.x * delta, scale.y * delta)
      mapRender.centerOnMap()
    }, { passive: false })

    const canvasPos = (event) => {
      const rect = app.canvas.getBoundingClientRect()
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      }
    }

    // 禁止拖动画板；仅保留重定位/画路径点击
    app.canvas.addEventListener('pointerdown', event => {
      event.preventDefault()
      event.stopPropagation()
      const pos = canvasPos(event)
      if (mapRender.changeLocation) {
        mapRender.changePose(mapRender.globalToRos(pos.x, pos.y))
      } else if (mapRender.changeDirection) {
        mapRender.changeTheta(mapRender.globalToRos(pos.x, pos.y))
      } else if (mapRender.drawPath) {
        mapRender.drawPathInit()
      }
    })

    app.canvas.addEventListener('pointermove', event => {
      if (!mapRender.drawing) return
      const pos = canvasPos(event)
      mapRender.drawPathUpdate(mapRender.globalToRos(pos.x, pos.y))
    })

    app.canvas.addEventListener('pointerup', () => {
      mapRender.drawing = false
    })

    app.canvas.addEventListener('touchstart', event => {
      if (event.touches.length === 2) {
        event.preventDefault()
        mapRender.initialDistance = Math.hypot(
          event.touches[0].clientX - event.touches[1].clientX,
          event.touches[0].clientY - event.touches[1].clientY
        )
        mapRender.initialScale = mapRender.app.stage.scale.x
      }
    }, { passive: false })

    app.canvas.addEventListener('touchmove', event => {
      if (event.touches.length === 2 && mapRender.initialDistance) {
        event.preventDefault()
        const currentDistance = Math.hypot(
          event.touches[0].clientX - event.touches[1].clientX,
          event.touches[0].clientY - event.touches[1].clientY
        )
        const scaleRatio = currentDistance / mapRender.initialDistance
        mapRender.app.stage.scale.set(scaleRatio * mapRender.initialScale, scaleRatio * mapRender.initialScale)
        mapRender.centerOnMap()
      }
    }, { passive: false })

    app.canvas.addEventListener('touchend', () => {
      mapRender.initialDistance = null
    })

    mapRender.app = app
  }

  /** 画板固定居中 */
  mapRender.focus = () => {
    mapRender.centerOnMap()
  }

  /**
   * 使用ros上报的原始地图数据进行渲染
   * @param data OccupancyGrid格式的地图
   */
  mapRender.processMapRaw = (data) => {
    const cells = Array.from(data.data || [], raw => {
      let x = Number(raw)
      // rosbridge 常把 int8(-1) 编成 255
      if (x > 100) x = -1
      return x
    })
    // 旧版 PGM 极性错误时整图几乎全是 100：自动翻转，避免「加载后一片黑」
    let occ = 0
    let free = 0
    for (const x of cells) {
      if (x >= 100) occ += 1
      else if (x === 0) free += 1
    }
    const invert = cells.length > 0 && occ > free && occ / cells.length > 0.55
    if (invert) {
      console.warn('[RosMapPixi] occupancy looks inverted; flipping for display')
    }

    const texturePixels = new Uint8Array(cells.length * 4)
    for (let i = 0; i < cells.length; i++) {
      let x = cells[i]
      if (invert && x >= 0) x = 100 - x
      const o = i * 4
      if (x < 0) {
        // 未知：深灰可见，不再几乎透明黑
        texturePixels[o] = 48
        texturePixels[o + 1] = 48
        texturePixels[o + 2] = 48
        texturePixels[o + 3] = 255
      } else {
        const grayScale = Math.max(0, Math.min(255, ((100 - x) / 100) * 255))
        texturePixels[o] = grayScale
        texturePixels[o + 1] = grayScale
        texturePixels[o + 2] = grayScale
        texturePixels[o + 3] = 255
      }
    }

    const w = data.info.width
    const h = data.info.height
    const previousMap = mapRender.map
    const sameSize = previousMap &&
      mapRender.mapInfo?.width === w &&
      mapRender.mapInfo?.height === h &&
      previousMap.texture?.source

    // 同尺寸只更新像素，避免 2Hz 销毁重建导致青/白背景闪烁
    if (sameSize) {
      const source = previousMap.texture.source
      const buf = source.resource
      if (buf instanceof Uint8Array && buf.length === texturePixels.length) {
        buf.set(texturePixels)
      } else {
        source.resource = texturePixels
      }
      source.update?.()
      mapRender.mapInfo = data.info
      return
    }

    const texture = new Texture({
      source: new BufferImageSource({
        resource: texturePixels,
        width: w,
        height: h,
        format: 'rgba8unorm'
      })
    })

    const map = new Sprite(texture)

    map.scale.set(data.info.resolution)
    map.anchor.y = 1
    map.scale.set(map.scale.x, -map.scale.y)

    map.y = -map.height

    map.x += data.info.origin.position.x
    map.y -= data.info.origin.position.y

    mapRender.mapInfo = data.info
    mapRender.map = map

    if (!previousMap) {
      // 先把地图挂上 stage，避免等 arrow.png 加载导致「很久才出现」
      if (mapRender.app?.stage) {
        mapRender.app.stage.addChild(map)
        mapRender.updateStage()
        mapRender.centerOnMap()
      }
      void mapRender.createRobot()
      return
    }

    const stage = mapRender.app?.stage
    if (stage && previousMap.parent === stage) {
      const idx = Math.max(0, stage.children.indexOf(previousMap))
      stage.removeChild(previousMap)
      if (idx <= stage.children.length) {
        stage.addChildAt(map, idx)
      } else {
        stage.addChild(map)
      }
    } else if (mapRender.robot) {
      mapRender.updateStage()
    }

    mapRender.centerOnMap()
    if (!mapRender.pose) {
      mapRender.placeRobotAtMapCenter()
    }

    try {
      previousMap.destroy({ children: true, texture: true })
    } catch (e) {
      // ignore destroy errors from already-cleared textures
    }
  }

  mapRender.processLaserScan = (data) => {
    if (!mapRender.robot) {
      console.log('no robot')
      return
    }

    // mapRender.lastLaserScan = data
    const laserScan = new Container()
    data.ranges.forEach((range, i) => {
      const angle = data.angle_min + i * data.angle_increment
      const x = range * Math.cos(angle)
      const y = -range * Math.sin(angle)

      // 创建一个新的Graphics对象，用于绘制单个激光点
      const point = new Graphics()
      point.circle(x, y, 0.05) // 0.05是圆点的半径，你可以根据需要调整
      point.fill(getCssVar('negative'))

      // 将激光点添加到laserScan中
      laserScan.addChild(point)
    })

    laserScan.position.x = mapRender.robot.x
    laserScan.position.y = mapRender.robot.y
    laserScan.rotation = mapRender.robot.rotation - Math.PI / 2

    if (mapRender.laserScan) {
      mapRender.app.stage.removeChild(mapRender.laserScan)
    }
    mapRender.app.stage.addChild(laserScan)
    mapRender.laserScan = laserScan
  }

  mapRender.processPath = (data) => {
    if (data.poses.length < 2) {
      mapRender.clearPath()
      return
    }
    const path = new Graphics()
    path.setStrokeStyle({
      width: 0.05,
      color: getCssVar('positive')
    })
    path.moveTo(data.poses[0].pose.position.x, -data.poses[0].pose.position.y)
    data.poses.forEach(p => {
      path.lineTo(p.pose.position.x, -p.pose.position.y)
    })
    if (mapRender.path) {
      mapRender.app.stage.removeChild(mapRender.path)
    }
    mapRender.app.stage.addChild(path)
    mapRender.path = path
  }

  mapRender.processTrajectory = (data) => {
    if (data.poses.length < 2) {
      mapRender.clearPath()
      return
    }
    const trajectory = new Graphics()
    trajectory.lineStyle(0.05, getCssVar('info'), 0.3)
    trajectory.moveTo(data.poses[0].pose.position.x, -data.poses[0].pose.position.y)
    data.poses.forEach(p => {
      trajectory.lineTo(p.pose.position.x, -p.pose.position.y)
    })
    if (mapRender.trajectory) {
      mapRender.app.stage.removeChild(mapRender.trajectory)
    }
    mapRender.app.stage.addChild(trajectory)
    mapRender.trajectory = trajectory
  }

  mapRender.clearPath = () => {
    if (mapRender.path) {
      mapRender.app.stage.removeChild(mapRender.path)
      mapRender.path = null
    }
  }

  mapRender.clearTrajectory = () => {
    if (mapRender.trajectory) {
      mapRender.app.stage.removeChild(mapRender.trajectory)
      mapRender.trajectory = null
    }
  }

  mapRender.drawPathInit = () => {
    mapRender.drawPathEnd()
    mapRender.removeTarget()
    mapRender.drawing = true
  }

  mapRender.drawPathUpdate = (pose) => {
    if (mapRender.drawedPath) {
      const length = mapRender.drawedPathData.length
      mapRender.drawedPath.moveTo(mapRender.drawedPathData[length - 1].x, -mapRender.drawedPathData[length - 1].y)
      mapRender.drawedPath.lineTo(pose.x, -pose.y)
    } else {
      const line = new Graphics()
      line.setStrokeStyle({
        width: 0.05,
        color: getCssVar('accent')
      }) // 设置线的样式
      line.moveTo(pose.x, -pose.y)
      mapRender.drawedPath = line
      mapRender.app.stage.addChild(mapRender.drawedPath)
      mapRender.drawedPathData = []
    }
    mapRender.drawedPathData.push(pose)
  }

  mapRender.drawPathEnd = () => {
    mapRender.app.stage.removeChild(mapRender.drawedPath)
    mapRender.drawedPath = null
  }

  mapRender.processCostMap = (data) => {
    const texturePixels = new Uint8Array(data.data.map(x => {
      switch (x) {
        case -1:
          return [0, 0, 0, 0]
        default: {
          const grayScale = (100 - x) / 100 * 255
          return [grayScale, grayScale, grayScale, 200]
        }
      }
    }).flat())

    const texture = Texture.from({
      resource: texturePixels,
      width: data.info.width,
      height: data.info.height
    })

    const costMap = new Sprite(texture)

    costMap.scale.set(data.info.resolution)
    costMap.anchor.y = 1
    costMap.scale.set(costMap.scale.x, -costMap.scale.y)

    if (mapRender.robot) {
      costMap.x += mapRender.robot.x - costMap.width / 2
      costMap.y += mapRender.robot.y - costMap.height / 2

      if (mapRender.costMap?.parent) {
        mapRender.costMap.parent.removeChild(mapRender.costMap)
      }
      mapRender.app.stage.addChild(costMap)
      mapRender.costMap = costMap
    }
  }

  mapRender.clearCostMap = () => {
    if (mapRender.costMap) {
      mapRender.app.stage.removeChild(mapRender.costMap)
      mapRender.costMap = null
    }
  }

  /**
   * 渲染Canvas中需要渲染的元素
   */
  mapRender.updateStage = () => {
    if (!mapRender.app || !mapRender.canvas) {
      return
    }
    const info = mapRender.mapInfo
    const mapW = info ? info.width * info.resolution : 10
    const mapH = info ? info.height * info.resolution : 10
    let W = Math.max(mapW, 1) * 1.15
    let H = Math.max(mapH, 1) * 1.15
    if (mapRender.canvas.offsetHeight > mapRender.canvas.offsetWidth) {
      H = W * mapRender.canvas.offsetHeight / mapRender.canvas.offsetWidth
    } else {
      W = H * mapRender.canvas.offsetWidth / mapRender.canvas.offsetHeight
    }
    mapRender.app.stage.scale.set(
      mapRender.canvas.offsetWidth / W,
      mapRender.canvas.offsetHeight / H
    )

    mapRender.rebuildGridOverlay()
    mapRender.app.stage.removeChildren()
    if (mapRender.map) {
      mapRender.app.stage.addChild(mapRender.map)
    }
    if (mapRender.gridOverlay) {
      mapRender.app.stage.addChild(mapRender.gridOverlay)
    }
    mapRender.app.stage.addChild(mapRender.poseContainer || new Container())
    if (mapRender.robot) {
      mapRender.app.stage.addChild(mapRender.robot)
    }
  }

  /** 世界坐标浅色格网（旧地图没有格线像素时也能看见栅格） */
  mapRender.rebuildGridOverlay = () => {
    const info = mapRender.mapInfo
    if (!info) {
      mapRender.gridOverlay = null
      return
    }
    const g = new Graphics()
    const minX = info.origin.position.x
    const minY = info.origin.position.y
    const maxX = minX + info.width * info.resolution
    const maxY = minY + info.height * info.resolution
    const step = Math.max(info.resolution * 10, 0.5)
    const color = 0x90a4ae
    const stroke = { width: Math.max(info.resolution * 0.4, 0.02), color, alpha: 0.65 }
    for (let x = minX; x <= maxX + 1e-6; x += step) {
      g.moveTo(x, -minY)
      g.lineTo(x, -maxY)
      g.stroke(stroke)
    }
    for (let y = minY; y <= maxY + 1e-6; y += step) {
      g.moveTo(minX, -y)
      g.lineTo(maxX, -y)
      g.stroke(stroke)
    }
    mapRender.gridOverlay = g
  }

  /**
   * 全局坐标转ros坐标
   * @param x 全局水平坐标
   * @param y 全局垂直坐标
   */
  mapRender.globalToRos = (x, y) => {
    const rosX = (x - mapRender.app.stage.x) / mapRender.app.stage.scale.x
    const rosY = (mapRender.app.stage.y - y + 50) / mapRender.app.stage.scale.y
    return {
      x: rosX,
      y: rosY
    }
  }

  /** 清空地图画板（未建图 / 取消后只留背景） */
  mapRender.clearMap = () => {
    if (mapRender.map?.parent) {
      mapRender.map.parent.removeChild(mapRender.map)
    }
    if (mapRender.map) {
      try {
        mapRender.map.destroy({ children: true, texture: true })
      } catch (e) { /* ignore */ }
    }
    mapRender.map = null
    mapRender.mapInfo = null
    mapRender.gridOverlay = null
    if (mapRender.robot?.parent) {
      mapRender.robot.parent.removeChild(mapRender.robot)
    }
    mapRender.robot = null
    mapRender.pose = null
    if (mapRender.app?.stage) {
      mapRender.app.stage.removeChildren()
      mapRender.app.stage.x = 0
      mapRender.app.stage.y = 0
    }
  }

  return mapRender
}
