<script setup>
/**
 * 录包回放：优先播真实 video url；无文件时用演示叠加 + 自定义控件。
 */
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  report: { type: Object, default: null }
})

const { t } = useI18n()
const videoRef = ref(null)
const muted = ref(false)
const playing = ref(false)
const cursor = ref(0)
let timer = null

const playback = computed(() => props.report?.playback || {})
const videoUrl = computed(() => playback.value.url || '')
const hasRealVideo = computed(() => Boolean(videoUrl.value))

const waypoints = computed(() => {
  const route = props.report?.route || []
  const pts = route.map((name, i) => ({ i, name }))
  if (props.report?.charge) {
    pts.push({ i: pts.length, name: props.report.charge?.name || t('charge_point') })
  }
  return pts
})
const total = computed(() => Math.max(waypoints.value.length, 1))
const currentLabel = computed(() => {
  if (!waypoints.value.length) return '—'
  const idx = Math.min(Math.max(cursor.value - 1, 0), waypoints.value.length - 1)
  if (cursor.value <= 0) return waypoints.value[0]?.name || '—'
  return waypoints.value[idx]?.name || '—'
})

function stopTimer () {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

async function playDemo () {
  if (!waypoints.value.length) return
  playing.value = true
  stopTimer()
  const el = videoRef.value
  if (el && hasRealVideo.value) {
    try { await el.play() } catch (_) { /* ignore */ }
  }
  timer = setInterval(() => {
    if (cursor.value >= total.value) {
      pauseDemo()
      return
    }
    cursor.value += 1
  }, 1200)
}

function pauseDemo () {
  playing.value = false
  stopTimer()
  videoRef.value?.pause?.()
}

function resetDemo () {
  pauseDemo()
  cursor.value = 0
  const el = videoRef.value
  if (el) el.currentTime = 0
}

function toggleMute () {
  muted.value = !muted.value
  if (videoRef.value) videoRef.value.muted = muted.value
}

async function onPlayClick () {
  if (hasRealVideo.value) {
    try {
      await videoRef.value?.play()
      playing.value = true
    } catch (_) { /* ignore */ }
    return
  }
  playDemo()
}

function onPauseClick () {
  if (hasRealVideo.value) {
    videoRef.value?.pause()
    playing.value = false
    return
  }
  pauseDemo()
}

function onVideoPlay () {
  playing.value = true
}

function onVideoPause () {
  playing.value = false
}

watch(
  () => props.report?.summary?.exec_id,
  async () => {
    resetDemo()
    await nextTick()
    if (videoRef.value) videoRef.value.muted = muted.value
  }
)

onUnmounted(() => stopTimer())
</script>

<template>
  <div class="patrol-replay">
    <div class="patrol-replay__title">{{ t('patrol_replay_title') }}</div>
    <div class="patrol-replay__hint">{{ t('patrol_replay_hint') }}</div>

    <div class="patrol-replay__panel">
      <div class="patrol-replay__frame">
        <video
          v-if="hasRealVideo"
          ref="videoRef"
          class="patrol-replay__video"
          controls
          playsinline
          preload="metadata"
          :src="videoUrl"
          :muted="muted"
          @play="onVideoPlay"
          @pause="onVideoPause"
        />
        <div v-else class="patrol-replay__stage">
          <q-icon name="movie" size="40px" color="teal-7"/>
          <div class="patrol-replay__stage-title">{{ t('patrol_replay_demo_mode') }}</div>
          <div class="patrol-replay__stage-sub">
            {{ t('patrol_replay_now') }}: {{ currentLabel }}
            ({{ Math.min(cursor, total) }}/{{ total }})
          </div>
          <div class="patrol-replay__dots">
            <q-badge
              v-for="p in waypoints"
              :key="p.i"
              :color="p.i < cursor ? 'teal' : 'grey-5'"
              :outline="p.i >= cursor"
              class="q-ma-xs"
            >
              {{ p.name }}
            </q-badge>
          </div>
        </div>
      </div>

      <div class="patrol-replay__actions">
        <q-btn
          dense unelevated no-wrap
          color="primary"
          icon="play_arrow"
          :label="t('patrol_replay_play')"
          :disable="playing"
          @click="onPlayClick"
        />
        <q-btn
          dense unelevated no-wrap
          color="warning"
          text-color="dark"
          icon="pause"
          :label="t('patrol_task_pause')"
          :disable="!playing"
          @click="onPauseClick"
        />
        <q-btn
          dense outline no-wrap
          color="grey-8"
          :icon="muted ? 'volume_off' : 'volume_up'"
          :label="muted ? t('patrol_replay_unmute') : t('patrol_replay_mute')"
          @click="toggleMute"
        />
        <q-btn
          dense flat no-wrap
          icon="replay"
          :label="t('patrol_replay_reset')"
          @click="resetDemo"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.patrol-replay {
  position: relative;
  isolation: isolate;
  min-width: 0;
}

.patrol-replay__title {
  font-size: 1.05rem;
  font-weight: 700;
  color: #263238;
  margin-bottom: 0.35rem;
}

.patrol-replay__hint {
  font-size: 0.78rem;
  color: #78909c;
  margin-bottom: 0.65rem;
  line-height: 1.4;
}

.patrol-replay__panel {
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  background: #fafafa;
  padding: 0.85rem;
  box-sizing: border-box;
}

.patrol-replay__frame {
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  overflow: hidden;
  background: #111;
}

.patrol-replay__video {
  display: block;
  width: 100%;
  height: auto;
  min-height: 220px;
  max-height: 340px;
  object-fit: contain;
  background: #000;
  vertical-align: top;
}

.patrol-replay__stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 220px;
  padding: 1.25rem 1rem;
  text-align: center;
  background: linear-gradient(160deg, #e0f2f1 0%, #eceff1 55%, #f5f5f5 100%);
  color: #37474f;
}

.patrol-replay__stage-title {
  margin-top: 0.5rem;
  font-size: 0.95rem;
  font-weight: 600;
}

.patrol-replay__stage-sub {
  margin-top: 0.35rem;
  font-size: 0.78rem;
  color: #607d8b;
}

.patrol-replay__dots {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 0.75rem;
  max-width: 100%;
}

.patrol-replay__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
</style>
