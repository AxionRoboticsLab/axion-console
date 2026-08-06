# axion-console

Web console of the **Axion** robotics family.  
Operator UI for edge robots: connect over rosbridge, switch manual/auto, teleop, run tasks, and watch status / alerts.
> Part of **Axion**: `axion-edge-agent` · `axion-console` · (later) `axion-nav` / `axion-slam`  
> UI baseline evolved from [ros2d-quasar](https://github.com/legubiao/ros2d-quasar) (trimmed for Axion MVP).

## What it does (MVP)
| Area | Behavior |
|------|----------|
| Connection | rosbridge online / offline indicator |
| Manual mode | Virtual joystick → `/cmd_vel` |
| Auto mode | Task / GoTo commands; joystick disabled |
| Speed | 0–100% slider → `/robot/speed_scale` (maps to [−2, 2] m/s on agent) |
| Pose / map | Show fake pose on default map (view only; no mapping/editing) |
| Tasks | Go A / Go B / Patrol / Dock — queue, running, success, failure + timestamps |
| Battery | Live %; button to call reset service (password prompt) |
| Alerts | Toast + list: low battery, task failure, disconnect |

## Architecture
```text
Browser (Vue 3 + Quasar)
    │  ws://<host>:9090
    ▼
rosbridge  ←→  axion-edge-agent
```
No separate business backend in MVP: the console talks to ROS through rosbridge.
(A gateway can be added later without renaming this app.)

## Requirements

- Node.js 20+ (or 22+)
- Yarn or npm
- Quasar CLI (dev)
- Running `axion-edge-agent` + rosbridge

## Quick start
```
cd axion-console
yarn          # or: npm install
quasar dev --host 0.0.0.0 --port 9000
```

Open `http://<host>:9000` (or via Nginx on port 80).
In Settings, set rosbridge to `ws://<public-or-lan-ip>:9090` — do **not** use `localhost` when the browser is on another machine.

## Production hint
```
quasar build
# serve dist/spa behind Nginx
```

## Build && Release
```
cd ~/workspace/axion-console
yarn   # 或 npm i
quasar build

sudo mkdir -p /var/www/axion-console
sudo rsync -a --delete dist/spa/ /var/www/axion-console/
```

## Related
- Runtime: [axion-edge-agent]([https://github.com/%3CORG%3E/](https://github.com/AxionRoboticsLab/axion-edge-agent)
- Upstream UI reference: [legubiao/ros2d-quasar](https://github.com/legubiao/ros2d-quasar)
