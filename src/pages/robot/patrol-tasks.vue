<template>
  <q-page class="app-page-fill column no-wrap q-pa-md">
    <div class="text-h5 q-mb-md app-page-fill__title">{{ t('patrol_task_title') }}</div>

    <q-tabs v-model="tab" dense align="left" class="text-primary" active-color="primary" indicator-color="primary">
      <q-tab name="list" :label="t('patrol_task_tab_list')" icon="list_alt"/>
      <q-tab name="results" :label="t('patrol_task_tab_results')" icon="history"/>
    </q-tabs>
    <q-separator/>

    <q-tab-panels v-model="tab" animated class="col column bg-transparent q-pt-md">
      <q-tab-panel name="list" class="q-pa-none column col">
        <AppDataTable
          row-key="id"
          :rows="taskRows"
          :columns="taskColumns"
          :loading="tasksLoading || pointsLoading"
          :pagination="taskPagination"
          @request="onTaskRequest"
        >
          <template #top-right>
            <q-btn color="primary" unelevated icon="add" :label="t('patrol_task_create')" @click="openCreate"/>
            <q-btn flat class="q-ml-sm" icon="refresh" :label="t('patrol_task_reset')" @click="reloadTasks"/>
          </template>
          <template #body-cell-pointNames="props">
            <q-td :props="props">
              <q-chip
                v-for="name in props.row.pointNames"
                :key="name"
                dense size="sm" color="teal-1" text-color="teal-10" class="q-mr-xs"
              >
                {{ name }}
              </q-chip>
            </q-td>
          </template>
          <template #body-cell-actions="props">
            <q-td :props="props">
              <q-btn flat dense color="primary" icon="edit" :label="t('patrol_task_edit')" @click="openEdit(props.row)"/>
              <q-btn flat dense color="negative" icon="delete" :label="t('patrol_task_delete')" @click="removeTask(props.row)"/>
              <q-btn flat dense color="positive" icon="play_arrow" :label="t('patrol_task_execute')" @click="executeTask(props.row)"/>
            </q-td>
          </template>
        </AppDataTable>
      </q-tab-panel>

      <q-tab-panel name="results" class="q-pa-none column col">
        <q-card flat class="app-filter-card q-mb-md q-pa-md">
          <div class="row q-col-gutter-md items-end">
            <div class="col-12 col-sm-6 col-md-3">
              <q-input v-model="resultFilters.name" outlined dense clearable :label="t('patrol_task_name')" @keyup.enter="searchResults"/>
            </div>
            <div class="col-12 col-sm-6 col-md-2">
              <q-select
                v-model="resultFilters.status"
                outlined dense clearable emit-value map-options
                :options="statusOptions"
                :label="t('patrol_task_status')"
              />
            </div>
            <div class="col-12 col-sm-6 col-md-2">
              <q-select
                v-model="resultFilters.result"
                outlined dense clearable emit-value map-options
                :options="resultOptions"
                :label="t('patrol_task_result')"
              />
            </div>
            <div class="col-12 col-sm-6 col-md-3">
              <q-input v-model="resultFilters.range" outlined dense clearable :label="t('patrol_task_time_range')">
                <template #append>
                  <q-icon name="event" class="cursor-pointer">
                    <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                      <q-date v-model="resultFilters.range" range>
                        <div class="row items-center justify-end q-gutter-sm q-pa-sm">
                          <q-btn v-close-popup :label="t('ok')" color="primary" flat/>
                        </div>
                      </q-date>
                    </q-popup-proxy>
                  </q-icon>
                </template>
              </q-input>
            </div>
            <div class="col-12 col-sm-6 col-md-2 row q-gutter-sm">
              <q-btn color="primary" unelevated icon="search" :label="t('patrol_task_search')" @click="searchResults"/>
              <q-btn flat icon="refresh" :label="t('patrol_task_reset')" @click="resetResultFilters"/>
            </div>
          </div>
        </q-card>

        <AppDataTable
          row-key="id"
          :rows="runs"
          :columns="resultColumns"
          :loading="runsLoading"
          :pagination="resultPagination"
          @request="onResultRequest"
        >
          <template #body-cell-status="props">
            <q-td :props="props">
              <q-badge :color="statusColor(props.row.status)">{{ statusLabel(props.row.status) }}</q-badge>
            </q-td>
          </template>
          <template #body-cell-result="props">
            <q-td :props="props">
              <q-badge v-if="props.row.result" :color="props.row.result === 'success' ? 'positive' : 'negative'">
                {{ resultLabel(props.row.result) }}
              </q-badge>
              <span v-else class="text-grey-6">—</span>
            </q-td>
          </template>
          <template #body-cell-route="props">
            <q-td :props="props">
              <span class="text-caption">{{ routeLabel(props.row) }}</span>
            </q-td>
          </template>
          <template #body-cell-timeRange="props">
            <q-td :props="props">
              <div class="text-body2">{{ props.row.startedAt || '—' }}</div>
              <div class="text-caption text-grey-7">~ {{ props.row.endedAt || '—' }}</div>
            </q-td>
          </template>
          <template #body-cell-execId="props">
            <q-td :props="props">
              <span class="text-caption text-grey-8" :title="props.row.execId">{{ shortExecId(props.row.execId) }}</span>
            </q-td>
          </template>
          <template #body-cell-actions="props">
            <q-td :props="props">
              <q-btn
                v-if="props.row.status === 'running'"
                flat dense color="warning" icon="pause"
                :label="t('patrol_task_pause')"
                @click="pauseRun(props.row)"
              />
              <q-btn
                v-if="props.row.status === 'paused'"
                flat dense color="positive" icon="play_arrow"
                :label="t('patrol_task_resume')"
                @click="resumeRun(props.row)"
              />
              <q-btn
                v-if="props.row.status === 'waiting' || props.row.status === 'running' || props.row.status === 'paused'"
                flat dense color="negative" icon="cancel"
                :label="t('patrol_task_cancel')"
                @click="cancelRun(props.row)"
              />
              <q-btn
                v-if="canDeleteRun(props.row)"
                flat dense color="grey-8" icon="delete"
                :label="t('patrol_task_delete')"
                @click="removeRun(props.row)"
              />
            </q-td>
          </template>
        </AppDataTable>
      </q-tab-panel>
    </q-tab-panels>

    <q-dialog v-model="formOpen" persistent>
      <q-card style="min-width: 28rem; max-width: 36rem">
        <q-card-section class="text-h6">
          {{ editingId ? t('patrol_task_edit') : t('patrol_task_create') }}
        </q-card-section>
        <q-card-section class="q-gutter-md">
          <q-input v-model="form.name" outlined dense :label="t('patrol_task_name')"/>
          <q-select
            v-model="form.type"
            outlined dense emit-value map-options
            :options="typeOptions"
            :label="t('patrol_task_type')"
          />
          <q-select
            v-model="form.pointIds"
            outlined dense multiple emit-value map-options use-chips
            :options="pointOptions"
            :loading="pointsLoading"
            :label="t('patrol_task_points')"
            :hint="activeMapLabel"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat :label="t('cancel')" v-close-popup/>
          <q-btn color="primary" unelevated :loading="saving" :label="t('ok')" @click="saveTask"/>
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Notify, useQuasar } from 'quasar'
import AppDataTable from 'components/common/AppDataTable.vue'
import { getChargePoint, listMaps, listPatrolPoints } from 'src/api/maps'
import {
  createPatrolTask,
  deletePatrolRun,
  deletePatrolTask,
  executePatrolTask,
  listPatrolRuns,
  listPatrolTasks,
  patrolRunAction,
  updatePatrolTask
} from 'src/api/patrol-tasks'
import { usePatrolMission } from 'stores/patrol-mission'

defineOptions({ name: 'PatrolTasksPage' })

const { t } = useI18n()
const $q = useQuasar()
const router = useRouter()
const mission = usePatrolMission()
const tab = ref('list')

const pointCatalog = ref([])
const activeMapId = ref(null)
const activeMapName = ref('')
const pointsLoading = ref(false)
const tasksLoading = ref(false)
const runsLoading = ref(false)
const saving = ref(false)

const pointOptions = computed(() =>
  pointCatalog.value.map((p) => ({ label: p.name, value: p.id }))
)

const activeMapLabel = computed(() => {
  if (!activeMapName.value) return t('patrol_need_map')
  return t('amr2d_loadMap_current', { name: activeMapName.value })
})

const typeOptions = computed(() => [
  { label: t('patrol_task_type_once'), value: 'once' },
  { label: t('patrol_task_type_loop'), value: 'loop' },
  { label: t('patrol_task_type_schedule'), value: 'schedule' }
])

const statusOptions = computed(() => [
  { label: t('patrol_task_status_waiting'), value: 'waiting' },
  { label: t('patrol_task_status_running'), value: 'running' },
  { label: t('patrol_task_status_paused'), value: 'paused' },
  { label: t('patrol_task_status_done'), value: 'done' },
  { label: t('patrol_task_status_cancelled'), value: 'cancelled' }
])

const resultOptions = computed(() => [
  { label: t('patrol_task_result_success'), value: 'success' },
  { label: t('patrol_task_result_fail'), value: 'fail' }
])

const tasks = ref([])
const runs = ref([])

const taskPagination = ref({ page: 1, rowsPerPage: 10, rowsNumber: 0 })
const resultPagination = ref({ page: 1, rowsPerPage: 10, rowsNumber: 0 })

const taskColumns = computed(() => [
  { name: 'name', label: t('patrol_task_name'), field: 'name', align: 'left' },
  { name: 'type', label: t('patrol_task_type'), field: (r) => typeLabel(r.type), align: 'left' },
  { name: 'pointNames', label: t('patrol_task_points'), field: 'pointNames', align: 'left' },
  { name: 'actions', label: t('patrol_task_actions'), field: 'actions', align: 'left' }
])

const resultColumns = computed(() => [
  { name: 'name', label: t('patrol_task_name'), field: 'name', align: 'left' },
  { name: 'execId', label: t('patrol_task_exec_id'), field: 'execId', align: 'left' },
  { name: 'status', label: t('patrol_task_status'), field: 'status', align: 'left' },
  { name: 'result', label: t('patrol_task_result'), field: 'result', align: 'left' },
  { name: 'route', label: t('patrol_task_route'), field: 'route', align: 'left' },
  { name: 'timeRange', label: t('patrol_task_exec_time'), field: 'timeRange', align: 'left' },
  { name: 'actions', label: t('patrol_task_actions'), field: 'actions', align: 'left', style: 'min-width: 12rem' }
])

function canDeleteRun (row) {
  const s = row?.status
  // 待执行 / 执行中 / 暂停：不可删
  if (s === 'waiting' || s === 'running' || s === 'paused') return false
  return s === 'done' || s === 'cancelled' || Boolean(row?.result)
}

function normalizeTask (row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type || row.task_type || 'once',
    pointIds: row.point_ids || row.pointIds || [],
    mapId: row.map_id ?? row.mapId
  }
}

function pointNamesOf (ids) {
  return (ids || []).map((id) => pointCatalog.value.find((p) => p.id === id)?.name || String(id))
}

const taskRows = computed(() =>
  tasks.value.map((row) => ({ ...row, pointNames: pointNamesOf(row.pointIds) }))
)

const resultFilters = ref({ name: '', status: null, result: null, range: null })

function typeLabel (v) {
  return typeOptions.value.find((o) => o.value === v)?.label || v
}
function statusLabel (v) {
  return statusOptions.value.find((o) => o.value === v)?.label || v
}
function resultLabel (v) {
  return resultOptions.value.find((o) => o.value === v)?.label || v
}
function statusColor (v) {
  if (v === 'running') return 'primary'
  if (v === 'paused') return 'warning'
  if (v === 'waiting') return 'orange'
  if (v === 'cancelled') return 'negative'
  if (v === 'done') return 'grey-7'
  return 'grey'
}
function routeLabel (row) {
  const names = (row.ordered || []).map((p) => p.name || p.id)
  if (row.charge?.name || row.charge) names.push(t('charge_point'))
  return names.length ? names.join(' → ') : '—'
}
function shortExecId (id) {
  if (!id) return '—'
  return id.length > 14 ? `${id.slice(0, 10)}…` : id
}

function onTaskRequest (req) {
  taskPagination.value = { ...taskPagination.value, ...req.pagination, rowsNumber: tasks.value.length }
}
function onResultRequest (req) {
  resultPagination.value = { ...resultPagination.value, ...req.pagination, rowsNumber: runs.value.length }
}

async function loadPointCatalog () {
  pointsLoading.value = true
  try {
    const maps = await listMaps()
    const active = (maps || []).find((m) => m.status === 1) || (maps || [])[0]
    if (!active) {
      pointCatalog.value = []
      activeMapId.value = null
      activeMapName.value = ''
      return
    }
    activeMapId.value = active.id
    activeMapName.value = active.map_name
    const rows = await listPatrolPoints(active.id)
    pointCatalog.value = rows || []
  } catch (e) {
    console.warn('[patrol-tasks] load points failed', e)
    Notify.create({ type: 'warning', message: e.message || t('patrol_empty') })
  } finally {
    pointsLoading.value = false
  }
}

async function reloadTasks () {
  tasksLoading.value = true
  try {
    await loadPointCatalog()
    const rows = await listPatrolTasks(activeMapId.value || undefined)
    tasks.value = (rows || []).map(normalizeTask)
    taskPagination.value.rowsNumber = tasks.value.length
  } catch (e) {
    Notify.create({ type: 'negative', message: e.message || t('patrol_task_load_failed') })
  } finally {
    tasksLoading.value = false
  }
}

async function reloadRuns () {
  runsLoading.value = true
  try {
    const f = resultFilters.value
    const rows = await listPatrolRuns({
      mapId: activeMapId.value || undefined,
      name: f.name || undefined,
      status: f.status || undefined,
      result: f.result || undefined,
      from: f.range?.from || undefined,
      to: f.range?.to || undefined
    })
    runs.value = (rows || []).map((r) => ({
      ...r,
      execId: r.exec_id || r.execId || '',
      name: r.name || r.task_name || ''
    }))
    resultPagination.value.rowsNumber = runs.value.length
  } catch (e) {
    Notify.create({ type: 'negative', message: e.message || t('patrol_task_load_failed') })
  } finally {
    runsLoading.value = false
  }
}

onMounted(async () => {
  await reloadTasks()
  await reloadRuns()
})

watch(tab, (v) => {
  if (v === 'results') reloadRuns()
  if (v === 'list') reloadTasks()
})

const formOpen = ref(false)
const editingId = ref(null)
const form = ref({ name: '', type: 'once', pointIds: [] })

async function openCreate () {
  await loadPointCatalog()
  editingId.value = null
  form.value = { name: '', type: 'once', pointIds: [] }
  formOpen.value = true
}
async function openEdit (row) {
  await loadPointCatalog()
  editingId.value = row.id
  form.value = { name: row.name, type: row.type, pointIds: [...row.pointIds] }
  formOpen.value = true
}

async function saveTask () {
  if (!form.value.name?.trim()) {
    Notify.create({ type: 'warning', message: t('patrol_task_name_required') })
    return
  }
  if (!form.value.pointIds?.length) {
    Notify.create({ type: 'warning', message: t('patrol_task_points_required') })
    return
  }
  if (!activeMapId.value) {
    Notify.create({ type: 'warning', message: t('patrol_need_map') })
    return
  }
  saving.value = true
  try {
    if (editingId.value) {
      await updatePatrolTask(editingId.value, {
        name: form.value.name.trim(),
        type: form.value.type,
        pointIds: [...form.value.pointIds]
      })
    } else {
      await createPatrolTask({
        mapId: activeMapId.value,
        name: form.value.name.trim(),
        type: form.value.type,
        pointIds: [...form.value.pointIds]
      })
    }
    formOpen.value = false
    Notify.create({ type: 'positive', message: t('patrol_task_saved') })
    await reloadTasks()
  } catch (e) {
    Notify.create({ type: 'negative', message: e.message || t('patrol_task_save_failed') })
  } finally {
    saving.value = false
  }
}

function removeTask (row) {
  $q.dialog({
    title: t('patrol_task_delete'),
    message: t('patrol_task_delete_confirm', { name: row.name }),
    cancel: true,
    persistent: true
  }).onOk(async () => {
    try {
      await deletePatrolTask(row.id)
      Notify.create({ type: 'positive', message: t('patrol_task_deleted') })
      await reloadTasks()
    } catch (e) {
      Notify.create({ type: 'negative', message: e.message || t('patrol_task_save_failed') })
    }
  })
}

async function resolveStartPose () {
  // 优先充电点（返航基地）作为规划起点；否则用地图上第一个点近似
  if (activeMapId.value) {
    try {
      const charge = await getChargePoint(activeMapId.value)
      if (charge) return { x: charge.x, y: charge.y, yaw: charge.yaw || 0 }
    } catch (_) { /* ignore */ }
  }
  const first = pointCatalog.value[0]
  if (first) return { x: first.x, y: first.y, yaw: first.yaw || 0 }
  return { x: 0, y: 0, yaw: 0 }
}

async function executeTask (row) {
  if (!row?.id) return
  try {
    const start = await resolveStartPose()
    const run = await executePatrolTask(row.id, {
      startX: start.x,
      startY: start.y,
      startYaw: start.yaw
    })

    if (run.status === 'running' || run.auto_started) {
      mission.requestFromRun(run)
      Notify.create({ type: 'positive', message: t('patrol_task_execute_jump', { name: row.name }) })
      await router.push({ name: 'robot_monitor' })
    } else {
      Notify.create({ type: 'info', message: t('patrol_task_queued', { name: row.name }) })
      tab.value = 'results'
      await reloadRuns()
    }
  } catch (e) {
    Notify.create({ type: 'negative', message: e.message || t('patrol_task_execute_failed') })
  }
}

async function pauseRun (row) {
  try {
    await patrolRunAction(row.id, 'pause')
    if (mission.runId === row.id) mission.pause()
    Notify.create({ type: 'info', message: t('patrol_task_paused') })
    await reloadRuns()
  } catch (e) {
    Notify.create({ type: 'negative', message: e.message || t('patrol_task_save_failed') })
  }
}

async function resumeRun (row) {
  try {
    if (mission.runId === row.id && mission.active) {
      await patrolRunAction(row.id, 'resume')
      mission.resume()
      Notify.create({ type: 'positive', message: t('patrol_task_resume') })
      await reloadRuns()
      return
    }
    const run = await patrolRunAction(row.id, 'resume')
    mission.requestFromRun(run, { resume: true })
    Notify.create({ type: 'positive', message: t('patrol_task_execute_jump', { name: row.name }) })
    await router.push({ name: 'robot_monitor' })
  } catch (e) {
    Notify.create({ type: 'negative', message: e.message || t('patrol_task_save_failed') })
  }
}

async function cancelRun (row) {
  try {
    const resp = await patrolRunAction(row.id, 'cancel')
    if (mission.runId === row.id) mission.cancel()
    // 取消后若池中有下一条被自动 start，且当前无会话，可直接接管
    const next = resp?.next_run || resp?.nextRun
    if (next?.id && !mission.active && !mission.pending) {
      mission.requestFromRun(next)
      Notify.create({ type: 'info', message: t('patrol_task_cancelled') })
      await router.push({ name: 'robot_monitor' })
      return
    }
    Notify.create({ type: 'info', message: t('patrol_task_cancelled') })
    await reloadRuns()
  } catch (e) {
    Notify.create({ type: 'negative', message: e.message || t('patrol_task_save_failed') })
  }
}

function removeRun (row) {
  if (!canDeleteRun(row)) {
    Notify.create({ type: 'warning', message: t('patrol_run_cannot_delete') })
    return
  }
  $q.dialog({
    title: t('patrol_task_delete'),
    message: t('patrol_run_delete_confirm', { name: row.name || row.execId || row.id }),
    cancel: true,
    persistent: true
  }).onOk(async () => {
    try {
      await deletePatrolRun(row.id)
      Notify.create({ type: 'positive', message: t('patrol_task_deleted') })
      await reloadRuns()
    } catch (e) {
      Notify.create({ type: 'negative', message: e.message || t('patrol_run_cannot_delete') })
    }
  })
}

function searchResults () {
  resultPagination.value.page = 1
  reloadRuns()
}
function resetResultFilters () {
  resultFilters.value = { name: '', status: null, result: null, range: null }
  reloadRuns()
}
</script>
