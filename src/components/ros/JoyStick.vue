<script setup>
import { getCssVar } from 'quasar'
import { inject, onMounted, onUnmounted, ref } from 'vue'
import { useControlParams } from 'stores/control-params'
import nipplejs from 'nipplejs'
import SliderItem from 'components/setting/SliderItem.vue'

const props = defineProps({
  togglePosition: { type: String, default: 'bottom-right' },
  visibleSwitch: { type: Boolean, default: true }
})

const left = ref()
const right = ref()
const visible = ref(true)

// Linear and Angular speed
const linearX = ref(0)
const linearY = ref(0)
const angular = ref(0)

const controlParams = useControlParams()

/**
 * Use Nipple-js to create virtual joysticks
 */
function initJoyStick () {
  nipplejs.create({
    zone: left.value,
    mode: 'static',
    position: { left: '50%', top: '55%' },
    color: getCssVar('negative'),
    size: 96
  }).on('start end', function () {
    linearX.value = 0
    linearY.value = 0
  }).on('move', function (evt, data) {
    // 屏幕/地图坐标：右=+x，上=+y（与画板一致，不再用车体坐标系）
    linearX.value = data.vector.x * controlParams.linearRatio
    linearY.value = data.vector.y * controlParams.linearRatio
  })

  nipplejs.create({
    zone: right.value,
    mode: 'static',
    position: { left: '50%', top: '55%' },
    lockX: true,
    color: getCssVar('negative'),
    size: 96
  }).on('end', function () {
    angular.value = 0
  }).on('move', function (evt, data) {
    // 右拨：箭头顺时针（屏幕观感）
    angular.value = data.vector.x * controlParams.angularRatio
  })
}

const connected = inject('connected')
const publish = inject('publish')
const teleop = inject('teleop', null)
let moving = true
const twist = ref({
  linear: { x: 0, y: 0, z: 0 },
  angular: { x: 0, y: 0, z: 0 }
})

/**
 * Publish twist to /cmd_vel
 * @param x Linear Speed
 * @param z Angular Speed
 */
function pubVel (x, y, z) {
  if (!connected.value) return
  if (teleop) {
    teleop.value.vx = x
    teleop.value.vy = y
    teleop.value.wz = z
  }
  if (x || y || z) {
    moving = true
    twist.value.linear.x = x
    twist.value.linear.y = y
    twist.value.angular.z = z
    publish(controlParams.cmdTopic, twist.value)
  } else {
    if (moving) {
      moving = false
      twist.value.linear.x = x
      twist.value.linear.y = y
      twist.value.angular.z = z
      publish(controlParams.cmdTopic, twist.value)
    }
  }
}

function pressMove (dx, dy) {
  linearX.value = dx * controlParams.linearRatio
  linearY.value = dy * controlParams.linearRatio
}

function releaseMove () {
  linearX.value = 0
  linearY.value = 0
}

function pressTurn (dir) {
  // dir: -1 左转（屏幕左），+1 右转
  angular.value = dir * controlParams.angularRatio
}

function releaseTurn () {
  angular.value = 0
}

function initKeyboardCtrl () {
  if (controlParams.keyboardMove) {
    document.onkeydown = (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          linearY.value = controlParams.linearRatio
          break
        case 'KeyS':
        case 'ArrowDown':
          linearY.value = -controlParams.linearRatio
          break
        case 'KeyA':
        case 'ArrowLeft':
          linearX.value = -controlParams.linearRatio
          break
        case 'KeyD':
        case 'ArrowRight':
          linearX.value = controlParams.linearRatio
          break
        case 'KeyJ':
          angular.value = -controlParams.angularRatio
          break
        case 'KeyL':
          angular.value = controlParams.angularRatio
          break
      }
    }
    document.onkeyup = (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'KeyS':
        case 'ArrowDown':
        case 'ArrowUp':
          linearY.value = 0
          break
        case 'KeyA':
        case 'KeyD':
        case 'ArrowLeft':
        case 'ArrowRight':
          linearX.value = 0
          break
        case 'KeyJ':
        case 'KeyL':
          angular.value = 0
          break
      }
    }
  } else {
    document.onkeyup = null
    document.onkeydown = null
  }
}

function init () {
  initJoyStick()
  initKeyboardCtrl()
  timer = setInterval(() => {
    pubVel(linearX.value, linearY.value, angular.value)
  }, controlParams.refreshInterval)
}

/**
 * Create Timer to publish velocity
 */
let timer
onMounted(init)

onUnmounted(() => {
  clearInterval(timer)
  document.onkeyup = null
  document.onkeydown = null
})

</script>

<template>
  <div class="joystick-wrap joystick-wrap--left" v-show="visible">
    <div class="joy-dpad" aria-hidden="false">
      <button
        type="button"
        class="joy-key joy-key--up"
        aria-label="up"
        @pointerdown.prevent="pressMove(0, 1)"
        @pointerup.prevent="releaseMove"
        @pointerleave.prevent="releaseMove"
        @pointercancel.prevent="releaseMove"
      >
        <q-icon name="keyboard_arrow_up" size="28px"/>
      </button>
      <button
        type="button"
        class="joy-key joy-key--left"
        aria-label="left"
        @pointerdown.prevent="pressMove(-1, 0)"
        @pointerup.prevent="releaseMove"
        @pointerleave.prevent="releaseMove"
        @pointercancel.prevent="releaseMove"
      >
        <q-icon name="keyboard_arrow_left" size="28px"/>
      </button>
      <button
        type="button"
        class="joy-key joy-key--right"
        aria-label="right"
        @pointerdown.prevent="pressMove(1, 0)"
        @pointerup.prevent="releaseMove"
        @pointerleave.prevent="releaseMove"
        @pointercancel.prevent="releaseMove"
      >
        <q-icon name="keyboard_arrow_right" size="28px"/>
      </button>
      <button
        type="button"
        class="joy-key joy-key--down"
        aria-label="down"
        @pointerdown.prevent="pressMove(0, -1)"
        @pointerup.prevent="releaseMove"
        @pointerleave.prevent="releaseMove"
        @pointercancel.prevent="releaseMove"
      >
        <q-icon name="keyboard_arrow_down" size="28px"/>
      </button>
    </div>
    <div ref="left" class="joystick-zone"/>
  </div>

  <div class="joystick-wrap joystick-wrap--right" v-show="visible">
    <div class="joy-dpad joy-dpad--turn">
      <button
        type="button"
        class="joy-key joy-key--left"
        aria-label="turn-left"
        @pointerdown.prevent="pressTurn(-1)"
        @pointerup.prevent="releaseTurn"
        @pointerleave.prevent="releaseTurn"
        @pointercancel.prevent="releaseTurn"
      >
        <q-icon name="rotate_left" size="26px"/>
      </button>
      <button
        type="button"
        class="joy-key joy-key--right"
        aria-label="turn-right"
        @pointerdown.prevent="pressTurn(1)"
        @pointerup.prevent="releaseTurn"
        @pointerleave.prevent="releaseTurn"
        @pointercancel.prevent="releaseTurn"
      >
        <q-icon name="rotate_right" size="26px"/>
      </button>
    </div>
    <div ref="right" class="joystick-zone"/>
  </div>

  <q-page-sticky v-show="$q.screen.gt.xs" :position="props.togglePosition" :offset="[15, 15]">
    <q-btn-dropdown v-show="visible" color="primary" :label="$t('joystick_params')" :menu-offset="props.togglePosition === 'bottom-right'?[0,10]:[65,10]">
      <q-card-section>
        <slider-item :label="$t('joystick_linear')" input-label="linear" color="secondary" v-model="controlParams.linearRatio" :min="0.05"
                     :max="Math.max(2, parseFloat(controlParams.linearMax) || 2)"
                     :step="0.05"/>
        <slider-item :label="$t('joystick_angular')" input-label="angular" color="secondary" v-model="controlParams.angularRatio"
                     :min="0.1" :max="3"
                     :step="0.1"/>
        <slider-item :label="$t('joystick_interval')" input-label="interval" v-model="controlParams.refreshInterval" :min="25"
                     :max="100" :step="25"/>
        <q-toggle :label="$t('joystick_keyboard')" v-model="controlParams.keyboardMove" @click="initKeyboardCtrl"/>
      </q-card-section>
    </q-btn-dropdown>
    <q-toggle v-if="props.visibleSwitch" v-model="visible" icon="sports_esports"/>
  </q-page-sticky>
</template>

<style scoped>
.joystick-wrap {
  position: absolute;
  bottom: 0.5rem;
  width: min(46vw, 300px);
  height: min(46vh, 300px);
  z-index: 20;
  pointer-events: none;
}
.joystick-wrap--left {
  left: 0.25rem;
}
.joystick-wrap--right {
  right: 0.25rem;
}

.joystick-zone {
  position: absolute;
  inset: 0;
  pointer-events: auto;
}

.joy-dpad {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}

.joy-key {
  position: absolute;
  width: 2.4rem;
  height: 2.4rem;
  border: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(33, 33, 33, 0.78);
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  pointer-events: auto;
  cursor: pointer;
  -webkit-user-select: none;
  user-select: none;
  touch-action: none;
}
.joy-key:active {
  background: rgba(25, 118, 210, 0.2);
  color: #1565c0;
}

.joy-key--up {
  left: 50%;
  top: 6%;
  transform: translateX(-50%);
}
.joy-key--down {
  left: 50%;
  bottom: 6%;
  transform: translateX(-50%);
}
.joy-key--left {
  left: 6%;
  top: 55%;
  transform: translateY(-50%);
}
.joy-key--right {
  right: 6%;
  top: 55%;
  transform: translateY(-50%);
}

.joy-dpad--turn .joy-key--left,
.joy-dpad--turn .joy-key--right {
  top: 55%;
}
</style>
