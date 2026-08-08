<script setup>
/**
 * 简化交互：
 * - relocate：点地图设「机器人当前在哪」+ 朝向
 * - goto：点地图设「要去哪」+ 朝向（Nav2 通车前仅画布目标）
 */
import { Notify } from 'quasar'
import { useI18n } from 'vue-i18n'
import { computed, inject, ref, watch } from 'vue'

const { t } = useI18n()
const pageMode = inject('pageMode')
const robotPose = inject('robotPose')
const mapManager = inject('mapManager')

/** pageMode: relocate | goto */
const mode = computed(() => pageMode.value)
const active = computed(() => mode.value === 'relocate' || mode.value === 'goto')

const step = ref('position') // position | direction | done
const clicked = ref(false)
const tempPose = ref({
  position: { x: 0, y: 0, z: 0 },
  orientation: { x: 0, y: 0, z: 0, w: 1 }
})

const hint = computed(() => {
  if (mode.value === 'relocate') {
    return step.value === 'position'
      ? t('nav_hint_relocate_pos')
      : t('nav_hint_relocate_dir')
  }
  if (mode.value === 'goto') {
    return step.value === 'position'
      ? t('nav_hint_goto_pos')
      : t('nav_hint_goto_dir')
  }
  return ''
})

function resetInteraction () {
  step.value = 'position'
  clicked.value = false
  mapManager.changeLocation = false
  mapManager.changeDirection = false
  mapManager.drawPath = false
  mapManager.drawPathEnd?.()
}

function begin () {
  resetInteraction()
  const src = robotPose?.value?.pose || mapManager.pose
  if (src?.position) {
    tempPose.value = {
      position: { ...src.position },
      orientation: { ...(src.orientation || { x: 0, y: 0, z: 0, w: 1 }) }
    }
  }
  mapManager.changeLocation = true
  mapManager.changeDirection = false
}

function end () {
  resetInteraction()
  if (mode.value !== 'goto') {
    mapManager.removeTarget?.()
  }
}

watch(active, (on) => {
  if (on) begin()
  else end()
})

watch(mode, (m, prev) => {
  if ((m === 'relocate' || m === 'goto') && m !== prev) begin()
})

mapManager.changePose = (pos) => {
  if (!active.value || step.value !== 'position') return
  tempPose.value.position.x = pos.x
  tempPose.value.position.y = pos.y
  if (mode.value === 'relocate') {
    mapManager.updateRobotPose(tempPose.value)
  } else {
    mapManager.updateTargetPose(tempPose.value)
  }
  clicked.value = true
  step.value = 'direction'
  mapManager.changeLocation = false
  mapManager.changeDirection = true
}

mapManager.changeTheta = (pos) => {
  if (!active.value || step.value !== 'direction') return
  const theta = Math.atan2(
    pos.y - tempPose.value.position.y,
    pos.x - tempPose.value.position.x
  )
  tempPose.value.orientation = {
    x: 0,
    y: 0,
    z: Math.sin(theta / 2),
    w: Math.cos(theta / 2)
  }
  if (mode.value === 'relocate') {
    mapManager.updateRobotPose(tempPose.value)
  } else {
    mapManager.updateTargetPose(tempPose.value)
  }
  clicked.value = true
  step.value = 'done'
  mapManager.changeLocation = false
  mapManager.changeDirection = false
}

function confirm () {
  if (!clicked.value || step.value === 'position') {
    Notify.create({ type: 'warning', message: t('nav_need_click_map') })
    return
  }
  if (mode.value === 'relocate') {
    mapManager.updateRobotPose(tempPose.value)
    Notify.create({ type: 'positive', message: t('nav_relocate_done') })
  } else {
    mapManager.updateTargetPose(tempPose.value)
    Notify.create({ type: 'positive', message: t('nav_goto_done') })
  }
  pageMode.value = 'default'
}

function cancel () {
  clicked.value = false
  pageMode.value = 'default'
  mapManager.removeTarget?.()
  resetInteraction()
}

defineExpose({ cancel, confirm })
</script>

<template>
  <q-dialog seamless :model-value="active" position="bottom" persistent>
    <div class="q-pa-sm nav-tool-bar">
      <div class="text-center text-body2 text-grey-9 q-mb-xs">{{ hint }}</div>
      <div class="flex justify-center q-gutter-sm">
        <q-btn rounded color="secondary" :label="$t('cancel')" @click="cancel"/>
        <q-btn
          rounded
          color="primary"
          :label="$t('ok')"
          :disable="step === 'position'"
          class="text-bold"
          @click="confirm"
        />
      </div>
    </div>
  </q-dialog>
</template>

<style scoped>
.nav-tool-bar {
  background: rgba(255, 255, 255, 0.92);
  border-radius: 12px;
  min-width: min(92vw, 28rem);
}
</style>
