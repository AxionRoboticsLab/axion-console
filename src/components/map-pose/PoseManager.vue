<script setup>
/**
 * 巡检点：edge-agent REST；新增取当前位姿；点击发 /goal_pose；可按列表顺序连跑
 */
import {
  createPatrolPoint,
  deletePatrolPoint,
  listPatrolPoints,
  renamePatrolPoint
} from 'src/api/maps'
import { isValidIdentityName, normalizeIdentityName } from 'src/utils/naming'
import { Notify, useQuasar } from 'quasar'
import { useI18n } from 'vue-i18n'
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue'

const $q = useQuasar()
const { t } = useI18n()
const pageMode = inject('pageMode')
const robotPose = inject('robotPose')
const mapManager = inject('mapManager')
const publish = inject('publish')
const loadedMapName = inject('loadedMapName', null)
const loadedMapId = inject('loadedMapId', null)
const navMode = inject('navMode', ref('auto'))
const navState = inject('navState', ref('idle'))

function stampHeader () {
  const now = Date.now()
  return {
    frame_id: 'map',
    stamp: {
      sec: Math.floor(now / 1000),
      nanosec: (now % 1000) * 1e6
    }
  }
}

function yawFromQuat (q) {
  if (!q) return 0
  return Math.atan2(
    2 * ((q.w || 0) * (q.z || 0) + (q.x || 0) * (q.y || 0)),
    1 - 2 * ((q.y || 0) ** 2 + (q.z || 0) ** 2)
  )
}

function quatFromYaw (yaw) {
  return {
    x: 0,
    y: 0,
    z: Math.sin(yaw / 2),
    w: Math.cos(yaw / 2)
  }
}

function publishGoalPose (pose) {
  publish('/goal_pose', {
    header: stampHeader(),
    pose: {
      position: { ...pose.position },
      orientation: { ...pose.orientation }
    }
  })
}

/** 由父级 v-if 控制挂载；弹框始终打开 */
const dialogOpen = ref(true)
const poseList = ref([])
const selected = ref(null)
const loading = ref(false)
const nameFilter = ref('')
const patrolQueue = ref([])
const patrolRunning = ref(false)
const patrolIndex = ref(-1)

const filteredList = computed(() => {
  const q = (nameFilter.value || '').trim().toLowerCase()
  if (!q) return poseList.value
  return poseList.value.filter((p) => (p.name || '').toLowerCase().includes(q))
})

function normalizePose (raw) {
  if (!raw) return null
  const pose = raw.pose?.position ? raw.pose : raw
  if (!pose?.position || !pose?.orientation) return null
  return {
    position: {
      x: Number(pose.position.x) || 0,
      y: Number(pose.position.y) || 0,
      z: Number(pose.position.z) || 0
    },
    orientation: {
      x: Number(pose.orientation.x) || 0,
      y: Number(pose.orientation.y) || 0,
      z: Number(pose.orientation.z) || 0,
      w: pose.orientation.w == null ? 1 : Number(pose.orientation.w)
    }
  }
}

function currentRobotPose () {
  return normalizePose(robotPose?.value) ||
    normalizePose(mapManager?.pose) ||
    null
}

function toUiItem (row) {
  return {
    id: row.id,
    name: row.name,
    pose: {
      position: { x: row.x, y: row.y, z: 0 },
      orientation: quatFromYaw(row.yaw || 0)
    },
    header: { seq: row.id, frame_id: 'map' }
  }
}

function refreshMapMarkers () {
  mapManager?.loadPoseList?.(poseList.value)
}

async function reloadPoses () {
  const mapId = loadedMapId?.value
  if (!mapId) {
    poseList.value = []
    refreshMapMarkers()
    return
  }
  loading.value = true
  try {
    const rows = await listPatrolPoints(mapId)
    poseList.value = (rows || []).map(toUiItem)
    refreshMapMarkers()
  } catch (e) {
    console.warn('[PoseManager] list failed', e)
    Notify.create({ type: 'negative', message: e.message || t('patrol_empty') })
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  reloadPoses()
})

onUnmounted(() => {
  stopPatrol(false)
  mapManager?.loadPoseList?.([])
})

watch(() => loadedMapId?.value, () => {
  stopPatrol(false)
  reloadPoses()
})

function promptName (title, initial = '') {
  return new Promise((resolve) => {
    $q.dialog({
      title,
      message: t('identity_name_hint'),
      prompt: {
        model: initial,
        type: 'text',
        isValid: (val) => isValidIdentityName(val),
        maxlength: 20
      },
      cancel: { label: t('cancel'), flat: true, color: 'secondary' },
      ok: { label: t('ok'), flat: true, color: 'primary', class: 'text-bold' },
      persistent: true
    }).onOk((val) => resolve(normalizeIdentityName(val)))
      .onCancel(() => resolve(null))
  })
}

async function addPose () {
  if (navMode?.value === 'manual') {
    Notify.create({ type: 'warning', message: t('nav_mode_auto_required') })
    return
  }
  const mapId = loadedMapId?.value
  if (!mapId) {
    Notify.create({ type: 'warning', message: t('patrol_need_map') })
    return
  }
  const pose = currentRobotPose()
  if (!pose) {
    Notify.create({ type: 'warning', message: t('patrol_no_robot') })
    return
  }
  const name = await promptName(t('patrol_add'))
  if (!name) return
  try {
    const row = await createPatrolPoint(mapId, {
      name,
      x: pose.position.x,
      y: pose.position.y,
      yaw: yawFromQuat(pose.orientation)
    })
    await reloadPoses()
    selected.value = row.id
    mapManager?.changePoseColor?.(row.id)
    Notify.create({ type: 'positive', message: t('patrol_added', { name: row.name }) })
  } catch (e) {
    Notify.create({ type: 'negative', message: e.message || t('nav_publish_failed') })
  }
}

function sendToPoint (item, { notify = true } = {}) {
  selected.value = item.id
  mapManager?.changePoseColor?.(item.id)
  if (!item?.pose) return
  mapManager?.updateTargetPose?.(item.pose)
  try {
    publishGoalPose(item.pose)
    if (notify) {
      Notify.create({ type: 'positive', message: t('nav_goto_done') })
    }
  } catch (e) {
    Notify.create({ type: 'negative', message: t('nav_publish_failed') })
  }
}

function choose (item) {
  if (navMode?.value === 'manual') {
    Notify.create({ type: 'warning', message: t('nav_mode_auto_required') })
    return
  }
  if (patrolRunning.value) {
    stopPatrol(false)
  }
  sendToPoint(item)
}

function advancePatrol () {
  if (!patrolRunning.value) return
  const next = patrolIndex.value + 1
  if (next >= patrolQueue.value.length) {
    Notify.create({ type: 'positive', message: t('patrol_run_done') })
    stopPatrol(false)
    return
  }
  patrolIndex.value = next
  const item = patrolQueue.value[next]
  sendToPoint(item, { notify: false })
  Notify.create({
    type: 'info',
    message: t('patrol_run_next', {
      name: item.name,
      i: next + 1,
      n: patrolQueue.value.length
    })
  })
}

function startPatrol () {
  if (navMode?.value === 'manual') {
    Notify.create({ type: 'warning', message: t('nav_mode_auto_required') })
    return
  }
  const list = filteredList.value
  if (!list.length) {
    Notify.create({ type: 'warning', message: t('patrol_empty') })
    return
  }
  patrolQueue.value = [...list]
  patrolIndex.value = -1
  patrolRunning.value = true
  advancePatrol()
}

function stopPatrol (notify = true) {
  const was = patrolRunning.value
  patrolRunning.value = false
  patrolQueue.value = []
  patrolIndex.value = -1
  if (notify && was) {
    Notify.create({ type: 'info', message: t('patrol_run_stopped') })
  }
}

let lastPatrolAdvanceAt = 0
watch(navState, (state, prev) => {
  if (!patrolRunning.value) return
  const hit = state === 'arrived' || (prev === 'navigating' && state === 'idle')
  if (!hit) return
  const now = Date.now()
  // arrived + idle 可能连续到，防双进
  if (now - lastPatrolAdvanceAt < 400) return
  lastPatrolAdvanceAt = now
  setTimeout(() => advancePatrol(), 120)
})

async function editName (item) {
  const name = await promptName(t('patrol_rename_title'), item.name)
  if (!name || !loadedMapId?.value) return
  try {
    await renamePatrolPoint(loadedMapId.value, item.id, name)
    await reloadPoses()
    Notify.create({ type: 'positive', message: t('patrol_renamed', { name }) })
  } catch (e) {
    Notify.create({ type: 'negative', message: e.message || t('nav_publish_failed') })
  }
}

async function removeSelected () {
  if (selected.value == null) {
    Notify.create({ type: 'warning', message: t('patrol_select_first') })
    return
  }
  if (!loadedMapId?.value) return
  try {
    await deletePatrolPoint(loadedMapId.value, selected.value)
    selected.value = null
    await reloadPoses()
  } catch (e) {
    Notify.create({ type: 'negative', message: e.message || t('nav_publish_failed') })
  }
}

function closePanel () {
  stopPatrol(false)
  if (pageMode) pageMode.value = 'default'
}
</script>

<template>
  <q-dialog
    :model-value="dialogOpen"
    seamless
    :position="$q.screen.lt.sm ? 'top' : 'right'"
    @update:model-value="(v) => { if (!v) closePanel() }"
  >
    <q-card style="min-width: 17rem; max-width: 22rem">
      <q-card-section class="row items-start no-wrap q-pb-sm">
        <div class="col">
          <div class="text-h6">{{ $t('patrol_title') }}</div>
          <div class="text-caption text-grey-7">
            {{ loadedMapName ? $t('amr2d_loadMap_current', { name: loadedMapName }) : $t('patrol_need_map') }}
          </div>
        </div>
        <q-btn
          flat
          dense
          round
          icon="sync"
          color="primary"
          :loading="loading"
          :aria-label="$t('patrol_reload')"
          @click="reloadPoses"
        >
          <q-tooltip>{{ $t('patrol_reload') }}</q-tooltip>
        </q-btn>
      </q-card-section>
      <q-separator/>
      <q-card-section class="q-gutter-sm">
        <q-input
          v-model="nameFilter"
          dense
          outlined
          clearable
          :label="$t('patrol_filter')"
          :placeholder="$t('patrol_filter_hint')"
        >
          <template #prepend>
            <q-icon name="search"/>
          </template>
        </q-input>
        <div class="row q-gutter-sm">
          <q-btn
            v-if="!patrolRunning"
            unelevated
            color="primary"
            icon="playlist_play"
            :label="$t('patrol_run')"
            class="col"
            @click="startPatrol"
          />
          <q-btn
            v-else
            unelevated
            color="warning"
            icon="stop"
            :label="$t('patrol_run_stop')"
            class="col"
            @click="stopPatrol(true)"
          />
        </div>
        <div v-if="patrolRunning" class="text-caption text-primary">
          {{ $t('patrol_run_progress', { i: patrolIndex + 1, n: patrolQueue.length }) }}
        </div>
        <q-inner-loading :showing="loading"/>
        <q-list v-if="filteredList.length" bordered separator dense style="overflow: auto; max-height: 36vh">
          <q-item
            v-for="item in filteredList"
            :key="item.id"
            clickable
            v-ripple
            :active="selected === item.id"
            active-class="bg-teal-5 text-white"
            @click="choose(item)"
          >
            <q-item-section>
              <q-item-label>{{ item.name }}</q-item-label>
              <q-item-label caption>
                ({{ item.pose.position.x.toFixed(2) }}, {{ item.pose.position.y.toFixed(2) }})
              </q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-btn
                flat
                dense
                round
                size="sm"
                icon="edit"
                :aria-label="$t('patrol_rename_title')"
                @click.stop="editName(item)"
              />
            </q-item-section>
          </q-item>
        </q-list>
        <div v-else class="text-grey-7 text-body2">
          {{ poseList.length ? $t('patrol_filter_empty') : $t('patrol_empty') }}
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
  <q-dialog seamless :model-value="dialogOpen" position="bottom">
    <div class="q-pa-sm blur">
      <div class="flex justify-center q-gutter-sm">
        <q-btn :label="$t('patrol_add')" icon="add" color="primary" @click="addPose"/>
        <q-btn :label="$t('patrol_remove')" icon="delete" color="negative" outline @click="removeSelected"/>
      </div>
    </div>
  </q-dialog>
</template>
