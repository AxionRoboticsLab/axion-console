import { getCssVar } from 'quasar'
import { useControlParams } from 'stores/control-params'
import { Application, Sprite, Container, Texture, Graphics, Text, Assets, BufferImageSource } from 'pixi.js'

const controlParam = useControlParams()

export default function () {
  const mapRender = {
    dragging: false,
    focusing: false,
    poseColor: '0xFF6666',
    fitScale: 1,
    minScale: 0.5,
    maxScale: 8,
    lastPosition: {
      x: 0,
      y: 0
    },
    poseContainer: new Container()
  }

  /** 固定视口（裁剪）+ 可缩放 world；无黑色装饰底 */
  mapRender.ensureLayers = () => {
    if (!mapRender.app?.stage || mapRender.layersReady) return
    const stage = mapRender.app.stage
    stage.eventMode = 'static'
    mapRender.worldViewport = new Container()
    mapRender.world = new Container()
    mapRender.viewMask = new Graphics()
    mapRender.worldViewport.addChild(mapRender.world)
    mapRender.worldViewport.addChild(mapRender.viewMask)
    mapRender.worldViewport.mask = mapRender.viewMask
    stage.addChild(mapRender.worldViewport)
    mapRender.layersReady = true
    mapRender.layoutViewport()
  }

  /** 视口 = 整块画布；放大内容裁切在容器内，不溢出 */
  mapRender.layoutViewport = () => {
    if (!mapRender.app || !mapRender.viewMask) return
    const w = mapRender.app.screen?.width || mapRender.canvas?.clientWidth || 800
    const h = mapRender.app.screen?.height || mapRender.canvas?.clientHeight || 600
    mapRender.boardRect = { x: 0, y: 0, w, h, mapW: w, mapH: h }
    mapRender.worldViewport.position.set(0, 0)
    mapRender.viewMask.clear()
    mapRender.viewMask.rect(0, 0, w, h)
    mapRender.viewMask.fill({ color: 0xffffff })
  }

  /** @deprecated 兼容旧调用 */
  mapRender.layoutBoard = () => mapRender.layoutViewport()

  mapRender.clampWorldScale = (s) => {
    const minS = mapRender.minScale || 0.5
    const maxS = mapRender.maxScale || 8
    return Math.min(maxS, Math.max(minS, s))
  }

  mapRender.addToWorld = (child) => {
    mapRender.ensureLayers()
    if (child && child.parent !== mapRender.world) {
      mapRender.world.addChild(child)
    }
  }

  mapRender.getWorldScale = () => {
    const s = mapRender.world?.scale?.x
    return Number.isFinite(s) && s > 0 ? s : 1
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

  /** 地图中心对准视口中心 */
  mapRender.centerOnMap = () => {
    if (!mapRender.app || !mapRender.canvas || !mapRender.mapInfo || !mapRender.world) {
      return
    }
    mapRender.layoutViewport()
    const c = mapRender.mapCenter()
    const board = mapRender.boardRect
    const sx = mapRender.world.scale.x
    const sy = mapRender.world.scale.y
    mapRender.world.x = board.mapW / 2 - c.x * sx
    mapRender.world.y = board.mapH / 2 + c.y * sy
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
    // 有导航路径时保留目标高亮，勿被位姿刷新清掉
    if (!mapRender.navPlanPts) {
      mapRender.removeTarget()
    }
    return mapRender.pose
  }

  /** 目标点：圆点 + Target 文字（非箭头） */
  mapRender.updateTargetPose = (pose) => {
    if (!pose?.position || !mapRender.app) return
    const x = pose.position.x
    const y = pose.position.y
    mapRender.drawTargetMarker(x, y)
  }

  mapRender.drawTargetMarker = (x, y) => {
    if (!mapRender.app) return
    if (mapRender.target?.parent) {
      mapRender.target.parent.removeChild(mapRender.target)
    }
    const g = new Container()
    const mark = new Graphics()
    mark.circle(0, 0, 0.12)
    mark.fill({ color: 0x21BA45, alpha: 0.95 })
    mark.circle(0, 0, 0.22)
    mark.stroke({ width: 0.045, color: 0x21BA45, alpha: 1 })
    // 十字准星
    mark.moveTo(-0.32, 0)
    mark.lineTo(0.32, 0)
    mark.moveTo(0, -0.32)
    mark.lineTo(0, 0.32)
    mark.stroke({ width: 0.035, color: 0x1B5E20, alpha: 0.9 })
    g.addChild(mark)

    const label = new Text({
      text: 'Target',
      style: {
        fontFamily: 'Arial, sans-serif',
        fontSize: 28,
        fontWeight: '700',
        fill: 0x1B5E20
      }
    })
    label.anchor.set(0.5, 1)
    label.scale.set(0.012)
    label.position.set(0, -0.38)
    g.addChild(label)

    g.position.set(x, -y)
    mapRender.addToWorld(g)
    mapRender.target = g
  }

  mapRender.removeTarget = () => {
    if (mapRender.target?.parent) {
      mapRender.target.parent.removeChild(mapRender.target)
    }
    mapRender.target = null
    if (mapRender.goalHalo?.parent) {
      mapRender.goalHalo.parent.removeChild(mapRender.goalHalo)
    }
    mapRender.goalHalo = null
  }

  mapRender.loadPoseList = async function (poseList) {
    if (!mapRender.poseContainer) {
      mapRender.poseContainer = new Container()
    }
    mapRender.poseContainer.removeChildren()

    mapRender.poseTexture = await Assets.load('pose.png')

    ;(poseList || []).forEach(p => {
      const pos = p.pose || p
      if (!pos?.position || !pos?.orientation) return
      const point = new Sprite(mapRender.poseTexture)
      point.anchor.set(0.5)
      point.alpha = 0.66
      const scale = controlParam.arrowScale / mapRender.poseTexture.width
      point.scale.set(scale)
      point.tint = getCssVar('info')

      point.x = pos.position.x
      point.y = -pos.position.y
      point.rotation = (90 + mapRender.quaternionToTheta(pos.orientation)) * Math.PI / 180
      point.label = p.header?.seq

      mapRender.poseContainer.addChild(point)
    })

    if (mapRender.poseContainer.parent !== mapRender.world) {
      mapRender.addToWorld(mapRender.poseContainer)
    }
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
    Object.assign(mapRender.canvas.style, {
      touchAction: 'none',
      userSelect: 'none',
      display: 'block',
      overflow: 'hidden'
    })

    const app = new Application()
    await app.init({
      background: '#FFFFFF',
      resizeTo: option.canvas,
      canvas: option.canvas
    })
    mapRender.app = app
    mapRender.ensureLayers()

    if (typeof ResizeObserver !== 'undefined') {
      mapRender._ro = new ResizeObserver(() => {
        mapRender.layoutViewport()
        if (mapRender.mapInfo) {
          mapRender.updateFitScale?.()
          mapRender.centerOnMap()
        }
      })
      mapRender._ro.observe(option.canvas)
    }

    // 视口固定；仅白地图缩放，并裁切在容器内
    app.canvas.addEventListener('wheel', event => {
      event.preventDefault()
      event.stopPropagation()
      if (!mapRender.world) return
      const scale = mapRender.world.scale
      const delta = event.deltaY > 0 ? 0.9 : 1.1
      const next = mapRender.clampWorldScale(scale.x * delta)
      scale.set(next, next)
      mapRender.centerOnMap()
    }, { passive: false })

    const canvasPos = (event) => {
      const rect = app.canvas.getBoundingClientRect()
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      }
    }

    // 禁止拖动画布；仅保留重定位/画路径点击
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
        mapRender.initialScale = mapRender.getWorldScale()
      }
    }, { passive: false })

    app.canvas.addEventListener('touchmove', event => {
      if (event.touches.length === 2 && mapRender.initialDistance && mapRender.world) {
        event.preventDefault()
        const currentDistance = Math.hypot(
          event.touches[0].clientX - event.touches[1].clientX,
          event.touches[0].clientY - event.touches[1].clientY
        )
        const scaleRatio = currentDistance / mapRender.initialDistance
        const next = mapRender.clampWorldScale(scaleRatio * mapRender.initialScale)
        mapRender.world.scale.set(next, next)
        mapRender.centerOnMap()
      }
    }, { passive: false })

    app.canvas.addEventListener('touchend', () => {
      mapRender.initialDistance = null
    })
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
        // 未知：贴近白底，去掉「大黑框」观感
        texturePixels[o] = 255
        texturePixels[o + 1] = 255
        texturePixels[o + 2] = 255
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
      if (mapRender.app?.stage) {
        mapRender.addToWorld(map)
        mapRender.updateStage()
        mapRender.centerOnMap()
      }
      void mapRender.createRobot()
      return
    }

    const world = mapRender.world
    if (world && previousMap.parent === world) {
      const idx = Math.max(0, world.children.indexOf(previousMap))
      world.removeChild(previousMap)
      if (idx <= world.children.length) {
        world.addChildAt(map, idx)
      } else {
        world.addChild(map)
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

    if (mapRender.laserScan?.parent) {
      mapRender.laserScan.parent.removeChild(mapRender.laserScan)
    }
    mapRender.addToWorld(laserScan)
    mapRender.laserScan = laserScan
  }

  mapRender.processPath = (data) => {
    if (!data?.poses || data.poses.length < 2) {
      mapRender.clearNavPlan()
      return
    }
    mapRender.navPlanPts = data.poses.map((p) => ({
      x: Number(p.pose.position.x) || 0,
      y: Number(p.pose.position.y) || 0
    }))
    const last = data.poses[data.poses.length - 1]
    mapRender.drawTargetMarker(last.pose.position.x, last.pose.position.y)
    mapRender.redrawNavPlanProgress()
  }

  mapRender.splitPlanAtRobot = (pts, rx, ry) => {
    let best = { dist: Infinity, seg: 0, t: 0, px: pts[0].x, py: pts[0].y }
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i].x
      const ay = pts[i].y
      const bx = pts[i + 1].x
      const by = pts[i + 1].y
      const abx = bx - ax
      const aby = by - ay
      const len2 = abx * abx + aby * aby || 1e-9
      let t = ((rx - ax) * abx + (ry - ay) * aby) / len2
      t = Math.max(0, Math.min(1, t))
      const px = ax + t * abx
      const py = ay + t * aby
      const d = Math.hypot(rx - px, ry - py)
      if (d < best.dist) best = { dist: d, seg: i, t, px, py }
    }
    const done = pts.slice(0, best.seg + 1).concat([{ x: best.px, y: best.py }])
    const remain = [{ x: best.px, y: best.py }].concat(pts.slice(best.seg + 1))
    return { done, remain }
  }

  mapRender.strokePoly = (gfx, pts, color, width = 0.07, alpha = 1) => {
    if (!pts || pts.length < 2) return
    gfx.moveTo(pts[0].x, -pts[0].y)
    for (let i = 1; i < pts.length; i++) {
      gfx.lineTo(pts[i].x, -pts[i].y)
    }
    gfx.stroke({ width, color, alpha })
  }

  /** 已走灰 / 未走主题色，随机器人位置刷新 */
  mapRender.redrawNavPlanProgress = (robotXY) => {
    const pts = mapRender.navPlanPts
    if (!pts || pts.length < 2 || !mapRender.app) return

    const rx = robotXY?.x ?? mapRender.pose?.position?.x
    const ry = robotXY?.y ?? mapRender.pose?.position?.y
    let done = pts
    let remain = []
    if (rx != null && ry != null && Number.isFinite(rx) && Number.isFinite(ry)) {
      const split = mapRender.splitPlanAtRobot(pts, rx, ry)
      done = split.done
      remain = split.remain
    }

    const layer = new Graphics()
    // 已走过：灰色
    mapRender.strokePoly(layer, done, 0x9E9E9E, 0.08, 0.95)
    // 未走完：蓝色高亮
    mapRender.strokePoly(layer, remain, 0x1976D2, 0.09, 1)

    if (mapRender.path?.parent) {
      mapRender.path.parent.removeChild(mapRender.path)
    }
    mapRender.addToWorld(layer)
    mapRender.path = layer

    // 保证目标高亮在路径之上
    if (mapRender.goalHalo) mapRender.addToWorld(mapRender.goalHalo)
    if (mapRender.target) mapRender.addToWorld(mapRender.target)
    if (mapRender.robot) mapRender.addToWorld(mapRender.robot)
  }

  mapRender.clearNavPlan = () => {
    mapRender.navPlanPts = null
    if (mapRender.path?.parent) {
      mapRender.path.parent.removeChild(mapRender.path)
    }
    mapRender.path = null
    if (mapRender.goalHalo?.parent) {
      mapRender.goalHalo.parent.removeChild(mapRender.goalHalo)
    }
    mapRender.goalHalo = null
    mapRender.removeTarget?.()
  }

  /** 完整巡检路线（当前位置 → 各点排序后折线） */
  mapRender.drawPatrolTour = (pts) => {
    if (!mapRender.app) return
    mapRender.clearPatrolTour()
    if (!pts || pts.length < 2) return
    const layer = new Graphics()
    // 底线：完整巡检路径
    mapRender.strokePoly(layer, pts, 0x00897B, 0.1, 0.85)
    // 各拐点小圆
    for (let i = 1; i < pts.length; i++) {
      layer.circle(pts[i].x, -pts[i].y, 0.1)
      layer.fill({ color: 0x00897B, alpha: 0.55 })
    }
    mapRender.addToWorld(layer)
    mapRender.patrolTour = layer
    if (mapRender.target) mapRender.addToWorld(mapRender.target)
    if (mapRender.robot) mapRender.addToWorld(mapRender.robot)
  }

  mapRender.clearPatrolTour = () => {
    if (mapRender.patrolTour?.parent) {
      mapRender.patrolTour.parent.removeChild(mapRender.patrolTour)
    }
    mapRender.patrolTour = null
  }

  mapRender.processTrajectory = (data) => {
    if (data.poses.length < 2) {
      mapRender.clearTrajectory()
      return
    }
    const trajectory = new Graphics()
    trajectory.lineStyle(0.05, getCssVar('info'), 0.3)
    trajectory.moveTo(data.poses[0].pose.position.x, -data.poses[0].pose.position.y)
    data.poses.forEach(p => {
      trajectory.lineTo(p.pose.position.x, -p.pose.position.y)
    })
    if (mapRender.trajectory?.parent) {
      mapRender.trajectory.parent.removeChild(mapRender.trajectory)
    }
    mapRender.addToWorld(trajectory)
    mapRender.trajectory = trajectory
  }

  mapRender.clearPath = () => {
    mapRender.clearNavPlan()
  }

  mapRender.clearTrajectory = () => {
    if (mapRender.trajectory?.parent) {
      mapRender.trajectory.parent.removeChild(mapRender.trajectory)
    }
    mapRender.trajectory = null
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
      mapRender.addToWorld(mapRender.drawedPath)
      mapRender.drawedPathData = []
    }
    mapRender.drawedPathData.push(pose)
  }

  mapRender.drawPathEnd = () => {
    if (mapRender.drawedPath?.parent) {
      mapRender.drawedPath.parent.removeChild(mapRender.drawedPath)
    }
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
      mapRender.addToWorld(costMap)
      mapRender.costMap = costMap
    }
  }

  mapRender.clearCostMap = () => {
    if (mapRender.costMap?.parent) {
      mapRender.costMap.parent.removeChild(mapRender.costMap)
    }
    mapRender.costMap = null
  }

  /**
   * 重建 world 内容；按黑色容器尺寸适配白底地图初始比例
   */
  mapRender.updateFitScale = () => {
    if (!mapRender.boardRect || !mapRender.mapInfo) return
    const board = mapRender.boardRect
    const info = mapRender.mapInfo
    const mapW = Math.max(info.width * info.resolution, 1)
    const mapH = Math.max(info.height * info.resolution, 1)
    let W = mapW * 1.06
    let H = mapH * 1.06
    const aspect = board.mapH / Math.max(board.mapW, 1)
    if (aspect > H / W) H = W * aspect
    else W = H / aspect
    const s = Math.min(board.mapW / W, board.mapH / H)
    mapRender.fitScale = s
    // 缩小不要太小（接近铺满即可）；放大有上限，且始终裁切在容器内
    mapRender.minScale = s * 0.95
    mapRender.maxScale = s * 5
  }

  mapRender.updateStage = () => {
    if (!mapRender.app || !mapRender.canvas) {
      return
    }
    mapRender.ensureLayers()
    mapRender.layoutViewport()
    mapRender.updateFitScale()
    const s = mapRender.clampWorldScale(mapRender.fitScale)
    mapRender.world.scale.set(s, s)
    mapRender.app.stage.scale.set(1, 1)
    mapRender.app.stage.position.set(0, 0)

    mapRender.rebuildGridOverlay()
    mapRender.world.removeChildren()
    if (mapRender.map) {
      mapRender.addToWorld(mapRender.map)
    }
    if (mapRender.gridOverlay) {
      mapRender.addToWorld(mapRender.gridOverlay)
    }
    mapRender.addToWorld(mapRender.poseContainer || new Container())
    if (mapRender.robot) {
      mapRender.addToWorld(mapRender.robot)
    }
    mapRender.centerOnMap()
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
    if (!mapRender.world || !mapRender.boardRect) {
      return { x: 0, y: 0 }
    }
    const board = mapRender.boardRect
    const sx = mapRender.world.scale.x || 1
    const sy = mapRender.world.scale.y || 1
    const lx = x - board.x
    const ly = y - board.y
    const rosX = (lx - mapRender.world.x) / sx
    const rosY = (mapRender.world.y - ly) / sy
    return { x: rosX, y: rosY }
  }

  /** 清空地图画板 */
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
    if (mapRender.world) {
      mapRender.world.removeChildren()
      mapRender.world.scale.set(1, 1)
      mapRender.world.position.set(0, 0)
    }
    mapRender.layoutViewport()
  }

  return mapRender
}
