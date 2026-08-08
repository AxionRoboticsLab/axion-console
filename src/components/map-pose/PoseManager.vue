<script setup>
/**
 * 收藏点：edge-agent REST；点击收藏取当前位姿；去这里发 /goal_pose
 */
import {
  createWaypoint,
  deleteWaypoint,
  listWaypoints,
  renameWaypoint
} from 'src/api/maps'
import { isValidIdentityName, normalizeIdentityName } from 'src/utils/naming'
import { Notify, useQuasar } from 'quasar'
import { useI18n } from 'vue-i18n'
import { computed, inject, ref, watch } from 'vue'

const $q = useQuasar()
const { t } = useI18n()
const pageMode = inject('pageMode')
const robotPose = inject('robotPose')
const mapManager = inject('mapManager')
const publish = inject('publish')
const loadedMapName = inject('loadedMapName', null)
const loadedMapId = inject('loadedMapId', null)
const navMode = inject('navMode', ref('auto'))

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

const visible = computed(() => pageMode.value === 'mapPose')
const poseList = ref([])
const selected = ref(null)
const loading = ref(false)

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
    const rows = await listWaypoints(mapId)
    poseList.value = (rows || []).map(toUiItem)
    refreshMapMarkers()
  } catch (e) {
    console.warn('[PoseManager] list failed', e)
    Notify.create({ type: 'negative', message: e.message || t('mapPose_empty') })
  } finally {
    loading.value = false
  }
}

watch(visible, (value) => {
  if (value) {
    reloadPoses()
  } else {
    mapManager?.loadPoseList?.([])
  }
})

watch(() => loadedMapId?.value, () => {
  if (!visible.value) return
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
    Notify.create({ type: 'warning', message: t('mapPose_need_map') })
    return
  }
  const pose = currentRobotPose()
  if (!pose) {
    Notify.create({ type: 'warning', message: t('mapPose_no_robot') })
    return
  }
  const name = await promptName(t('mapPose_add'))
  if (!name) return
  try {
    const row = await createWaypoint(mapId, {
      name,
      x: pose.position.x,
      y: pose.position.y,
      yaw: yawFromQuat(pose.orientation)
    })
    await reloadPoses()
    selected.value = row.id
    mapManager?.changePoseColor?.(row.id)
    Notify.create({ type: 'positive', message: t('mapPose_added', { name: row.name }) })
  } catch (e) {
    Notify.create({ type: 'negative', message: e.message || t('nav_publish_failed') })
  }
}

function choose (item) {
  if (navMode?.value === 'manual') {
    Notify.create({ type: 'warning', message: t('nav_mode_auto_required') })
    return
  }
  selected.value = item.id
  mapManager?.changePoseColor?.(item.id)
  if (item?.pose) {
    mapManager?.updateTargetPose?.(item.pose)
    try {
      publishGoalPose(item.pose)
      Notify.create({ type: 'positive', message: t('nav_goto_done') })
    } catch (e) {
      Notify.create({ type: 'negative', message: t('nav_publish_failed') })
    }
  }
}

async function editName (item) {
  const name = await promptName(t('mapPose_rename_title'), item.name)
  if (!name || !loadedMapId?.value) return
  try {
    await renameWaypoint(loadedMapId.value, item.id, name)
    await reloadPoses()
    Notify.create({ type: 'positive', message: t('mapPose_renamed', { name }) })
  } catch (e) {
    Notify.create({ type: 'negative', message: e.message || t('nav_publish_failed') })
  }
}

async function removeSelected () {
  if (selected.value == null) {
    Notify.create({ type: 'warning', message: t('mapPose_select_first') })
    return
  }
  if (!loadedMapId?.value) return
  try {
    await deleteWaypoint(loadedMapId.value, selected.value)
    selected.value = null
    await reloadPoses()
  } catch (e) {
    Notify.create({ type: 'negative', message: e.message || t('nav_publish_failed') })
  }
}
</script>

<template>
  <q-dialog v-model="visible" seamless :position="$q.screen.lt.sm ? 'top' : 'right'">
    <q-card style="min-width: 16rem">
      <q-card-section class="text-h6">
        {{ $t('mapPose_title') }}
        <div class="text-caption text-grey-7 text-weight-regular">
          {{ loadedMapName ? $t('amr2d_loadMap_current', { name: loadedMapName }) : $t('mapPose_need_map') }}
        </div>
      </q-card-section>
      <q-separator/>
      <q-card-section>
        <q-inner-loading :showing="loading"/>
        <q-list v-if="poseList.length" bordered separator dense style="overflow: auto; max-height: 30vh">
          <q-item
            v-for="item in poseList"
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
                :aria-label="$t('mapPose_rename_title')"
                @click.stop="editName(item)"
              />
            </q-item-section>
          </q-item>
        </q-list>
        <div v-else class="text-grey-7 text-body2">
          {{ $t('mapPose_empty') }}
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
  <q-dialog seamless v-model="visible" position="bottom">
    <div class="q-pa-sm blur">
      <div class="flex justify-center q-gutter-sm">
        <q-btn :label="$t('mapPose_add')" icon="add" color="primary" @click="addPose"/>
        <q-btn :label="$t('mapPose_load')" icon="sync" color="primary" @click="reloadPoses"/>
        <q-btn :label="$t('mapPose_remove')" icon="delete" color="negative" outline @click="removeSelected"/>
      </div>
    </div>
  </q-dialog>
</template>
