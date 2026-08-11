<script setup>
/**
 * 机器人模块全局状态浮标（左下角）。仅 /robot/* 展示。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRobotRuntime } from 'stores/robot-runtime'

defineOptions({ name: 'RobotStatusBuoy' })

const emit = defineEmits(['open-detail'])

const { t } = useI18n()
const runtime = useRobotRuntime()

/** 统一中文运行态：急停 > 离线 > 巡检/暂停 > 导航 > 空闲 */
const statusLabel = computed(() => {
  if (!runtime.online) return t('robot_state_offline')
  if (runtime.estop) return t('robot_estop')
  if (runtime.workState === 'paused') return t('robot_state_paused')
  if (runtime.workState === 'patrol') return t('robot_state_patrol')
  const nav = String(runtime.navState || '').toLowerCase()
  if (nav === 'navigating' || runtime.workState === 'navigating') {
    return t('robot_state_navigating')
  }
  if (nav === 'arrived') return t('robot_state_arrived')
  if (runtime.workState === 'offline') return t('robot_state_offline')
  return t('robot_state_idle')
})

const onlineDot = computed(() => (runtime.online ? 'positive' : 'negative'))
const buoyClass = computed(() => ({
  'robot-status-buoy--estop': runtime.estop,
  'robot-status-buoy--offline': !runtime.online
}))
</script>

<template>
  <button
    type="button"
    class="robot-status-buoy"
    :class="buoyClass"
    @click="emit('open-detail')"
  >
    <div class="robot-status-buoy__row">
      <span class="robot-status-buoy__dot" :class="`bg-${onlineDot}`"/>
      <span class="robot-status-buoy__title">{{ t('robot_status_buoy_title') }}</span>
    </div>
    <div class="robot-status-buoy__meta">
      <span class="robot-status-buoy__state">{{ statusLabel }}</span>
      <span class="robot-status-buoy__sep">·</span>
      <span>{{ runtime.batteryLabel }}</span>
    </div>
    <div v-if="!runtime.locOk" class="robot-status-buoy__warn">
      {{ t('robot_loc_lost') }}
    </div>
  </button>
</template>

<style scoped>
.robot-status-buoy {
  position: fixed;
  /* 避开建图/监控左侧工具栏（约 11.5rem）；列表页略内缩亦可 */
  left: 12.75rem;
  bottom: 1rem;
  z-index: 40;
  min-width: 11.5rem;
  max-width: 16rem;
  padding: 0.55rem 0.75rem;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.12);
  text-align: left;
  cursor: pointer;
  color: #263238;
  backdrop-filter: blur(8px);
}
.robot-status-buoy:hover {
  border-color: rgba(0, 137, 123, 0.45);
}
.robot-status-buoy--estop {
  border-color: rgba(198, 40, 40, 0.45);
  background: rgba(255, 235, 238, 0.96);
}
.robot-status-buoy--offline {
  opacity: 0.92;
}
.robot-status-buoy__row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.2rem;
}
.robot-status-buoy__dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  flex: 0 0 auto;
}
.robot-status-buoy__title {
  font-size: 0.8rem;
  font-weight: 600;
  flex: 1;
}
.robot-status-buoy__meta {
  font-size: 0.72rem;
  color: #546e7a;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.15rem;
}
.robot-status-buoy__state {
  font-weight: 600;
  color: #263238;
}
.robot-status-buoy--estop .robot-status-buoy__state {
  color: #c62828;
}
.robot-status-buoy__sep {
  opacity: 0.5;
}
.robot-status-buoy__warn {
  margin-top: 0.25rem;
  font-size: 0.7rem;
  color: #c62828;
}
</style>
