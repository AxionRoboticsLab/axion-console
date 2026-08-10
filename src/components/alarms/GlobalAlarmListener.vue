<script setup>
/**
 * 订阅 /alarm_event → 右下角站内 Alert → 上报 edge 落库。
 */
import { Notify } from 'quasar'
import { useI18n } from 'vue-i18n'
import { onMounted, onUnmounted, watch } from 'vue'
import { ingestAlarmEvent } from 'src/api/alarms'
import RosClient from 'components/ros/RosClient'
import { useAuthStore } from 'stores/auth'

defineOptions({ name: 'GlobalAlarmListener' })

const { t } = useI18n()
const auth = useAuthStore()
const ros = RosClient()

/** 去重：同 code+ts 只弹一次 */
const seen = new Set()
let lastFingerprint = ''

function levelType (level) {
  if (level === 'critical') return 'negative'
  if (level === 'warn') return 'warning'
  return 'info'
}

function levelLabel (level) {
  if (level === 'critical') return t('alarm_level_critical')
  if (level === 'warn') return t('alarm_level_warn')
  return t('alarm_level_info')
}

function formatTime (raw) {
  if (raw == null || raw === '') {
    const d = new Date()
    return d.toISOString().slice(0, 19).replace('T', ' ')
  }
  if (typeof raw === 'number') {
    const ms = raw < 1e12 ? raw * 1000 : raw
    return new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
  }
  const s = String(raw)
  if (/^\d+$/.test(s)) {
    const n = Number(s)
    const ms = n < 1e12 ? n * 1000 : n
    return new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
  }
  return s
}

function parsePayload (raw) {
  if (!raw) return null
  let data = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw)
    } catch (_) {
      return null
    }
  }
  if (!data || typeof data !== 'object') return null
  const code = String(data.code || '').trim()
  if (!code) return null
  return {
    code,
    level: String(data.level || 'warn').toLowerCase(),
    event: String(data.event || data.title || code),
    detail: String(data.detail || ''),
    source: String(data.source || 'mock_nav'),
    time: formatTime(data.ts ?? data.time)
  }
}

function showAlert (ev) {
  const fp = `${ev.code}|${ev.time}|${ev.event}`
  if (fp === lastFingerprint || seen.has(fp)) return
  lastFingerprint = fp
  seen.add(fp)
  if (seen.size > 80) {
    const first = seen.values().next().value
    seen.delete(first)
  }

  Notify.create({
    position: 'bottom-right',
    timeout: 10000,
    type: levelType(ev.level),
    multiLine: true,
    closeBtn: true,
    message: `${t('alarm_event')}: ${ev.event}`,
    caption: `${t('alarm_level')}: ${levelLabel(ev.level)}  ·  ${t('alarm_time')}: ${ev.time}`
  })
}

async function handleAlarm (raw) {
  if (!auth.isAuthenticated) return
  const ev = parsePayload(raw)
  if (!ev) return
  showAlert(ev)
  try {
    await ingestAlarmEvent(ev)
  } catch (e) {
    console.warn('[GlobalAlarm] ingest failed', e)
  }
}

function ensureSub () {
  if (!auth.isAuthenticated) return
  ros.init()
  ros.subscribe('/alarm_event')
}

watch(
  () => ros.lastAlarmEvent?.value,
  (v) => {
    if (v != null) void handleAlarm(v)
  }
)

watch(
  () => auth.isAuthenticated,
  (ok) => {
    if (ok) ensureSub()
  },
  { immediate: true }
)

onMounted(() => {
  ensureSub()
})

onUnmounted(() => {
  try {
    ros.unsubscribe?.('/alarm_event')
  } catch (_) { /* ignore */ }
})
</script>

<template>
  <span class="global-alarm-listener" hidden aria-hidden="true"/>
</template>
