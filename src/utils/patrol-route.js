/**
 * 巡检路线规划（前端近似）：从当前位置最近邻贪心 + 2-opt 改善。
 * 后续可换成后端 / Nav2 全局规划结果。
 */

function dist (a, b) {
  const dx = (a.x ?? a.pose?.position?.x ?? 0) - (b.x ?? b.pose?.position?.x ?? 0)
  const dy = (a.y ?? a.pose?.position?.y ?? 0) - (b.y ?? b.pose?.position?.y ?? 0)
  return Math.hypot(dx, dy)
}

function pointXY (p) {
  if (p?.pose?.position) {
    return { x: p.pose.position.x, y: p.pose.position.y }
  }
  return { x: Number(p.x) || 0, y: Number(p.y) || 0 }
}

function pathLength (start, ordered) {
  let len = 0
  let prev = start
  for (const p of ordered) {
    len += dist(prev, pointXY(p))
    prev = pointXY(p)
  }
  return len
}

/** 最近邻贪心 */
export function nearestNeighborOrder (start, points) {
  const remain = [...(points || [])]
  const ordered = []
  let cur = start
  while (remain.length) {
    let bestI = 0
    let bestD = Infinity
    for (let i = 0; i < remain.length; i++) {
      const d = dist(cur, pointXY(remain[i]))
      if (d < bestD) {
        bestD = d
        bestI = i
      }
    }
    const [next] = remain.splice(bestI, 1)
    ordered.push(next)
    cur = pointXY(next)
  }
  return ordered
}

/** 简单 2-opt */
export function twoOptImprove (start, ordered, maxPass = 8) {
  if (!ordered || ordered.length < 3) return [...(ordered || [])]
  let route = [...ordered]
  let improved = true
  let pass = 0
  while (improved && pass < maxPass) {
    improved = false
    pass += 1
    for (let i = 0; i < route.length - 1; i++) {
      for (let k = i + 1; k < route.length; k++) {
        const next = route.slice(0, i).concat(route.slice(i, k + 1).reverse(), route.slice(k + 1))
        if (pathLength(start, next) + 1e-9 < pathLength(start, route)) {
          route = next
          improved = true
        }
      }
    }
  }
  return route
}

/**
 * @param {{x:number,y:number}} start 机器人当前位置
 * @param {Array} points 巡检点（含 pose 或 x/y）
 */
export function planPatrolOrder (start, points) {
  const nn = nearestNeighborOrder(start, points)
  return twoOptImprove(start, nn)
}

/** 折线点：起点 + 各巡检点 */
export function buildTourPolyline (start, ordered) {
  const pts = [{ x: start.x, y: start.y }]
  for (const p of ordered || []) {
    pts.push(pointXY(p))
  }
  return pts
}
