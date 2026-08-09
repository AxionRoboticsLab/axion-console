<template>
  <q-page class="app-page-fill column no-wrap q-pa-md">
    <div class="text-h5 q-mb-md app-page-fill__title">{{ t('patrol_task_title') }}</div>
    <q-banner dense class="bg-blue-1 text-primary q-mb-md rounded-borders">
      {{ t('patrol_task_template_hint') }}
    </q-banner>

    <q-tabs v-model="tab" dense align="left" class="text-primary" active-color="primary" indicator-color="primary">
      <q-tab name="list" :label="t('patrol_task_tab_list')" icon="list_alt"/>
      <q-tab name="results" :label="t('patrol_task_tab_results')" icon="history"/>
    </q-tabs>
    <q-separator/>

    <q-tab-panels v-model="tab" animated class="col column bg-transparent q-pt-md">
      <!-- 任务列表 -->
      <q-tab-panel name="list" class="q-pa-none column col">
        <AppDataTable
          row-key="id"
          :rows="taskRows"
          :columns="taskColumns"
          :loading="false"
          :pagination="taskPagination"
          @request="onTaskRequest"
        >
          <template #top-right>
            <q-btn color="primary" unelevated icon="add" :label="t('patrol_task_create')" @click="openCreate"/>
          </template>
          <template #body-cell-pointNames="props">
            <q-td :props="props">
              <q-chip
                v-for="name in props.row.pointNames"
                :key="name"
                dense
                size="sm"
                color="teal-1"
                text-color="teal-10"
                class="q-mr-xs"
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

      <!-- 任务结果 -->
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
          :rows="filteredResults"
          :columns="resultColumns"
          :loading="false"
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
          <template #body-cell-timeRange="props">
            <q-td :props="props">
              <div class="text-body2">{{ props.row.startedAt }}</div>
              <div class="text-caption text-grey-7">~ {{ props.row.endedAt || '—' }}</div>
            </q-td>
          </template>
          <template #body-cell-actions="props">
            <q-td :props="props">
              <q-btn
                flat dense color="warning" icon="pause"
                :disable="props.row.status !== 'running'"
                :label="t('patrol_task_pause')"
                @click="pauseRun(props.row)"
              />
              <q-btn
                flat dense color="negative" icon="cancel"
                :disable="props.row.status === 'done'"
                :label="t('patrol_task_cancel')"
                @click="cancelRun(props.row)"
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
          <q-input v-model="form.name" outlined dense :label="t('patrol_task_name')" :rules="[v => !!v || t('patrol_task_name_required')]"/>
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
            :label="t('patrol_task_points')"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat :label="t('cancel')" v-close-popup/>
          <q-btn color="primary" unelevated :label="t('ok')" @click="saveTask"/>
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Notify, useQuasar } from 'quasar'
import AppDataTable from 'components/common/AppDataTable.vue'

defineOptions({ name: 'PatrolTasksPage' })

const { t } = useI18n()
const $q = useQuasar()
const tab = ref('list')

/** 模板点位（后续对接 edge-agent 巡检点） */
const pointOptions = [
  { label: 'NorthGate', value: 1 },
  { label: 'WestGate', value: 2 },
  { label: 'SouthHall', value: 3 },
  { label: 'ChargeDock', value: 4 }
]

const typeOptions = computed(() => [
  { label: t('patrol_task_type_once'), value: 'once' },
  { label: t('patrol_task_type_loop'), value: 'loop' },
  { label: t('patrol_task_type_schedule'), value: 'schedule' }
])

const statusOptions = computed(() => [
  { label: t('patrol_task_status_waiting'), value: 'waiting' },
  { label: t('patrol_task_status_running'), value: 'running' },
  { label: t('patrol_task_status_done'), value: 'done' }
])

const resultOptions = computed(() => [
  { label: t('patrol_task_result_success'), value: 'success' },
  { label: t('patrol_task_result_fail'), value: 'fail' }
])

const tasks = ref([
  { id: 1, name: '晨间巡检', type: 'once', pointIds: [1, 2] },
  { id: 2, name: '周界循环', type: 'loop', pointIds: [1, 2, 3] }
])

const runs = ref([
  {
    id: 101,
    name: '晨间巡检',
    status: 'done',
    result: 'success',
    startedAt: '2026-08-09 08:00:12',
    endedAt: '2026-08-09 08:18:45'
  },
  {
    id: 102,
    name: '周界循环',
    status: 'running',
    result: null,
    startedAt: '2026-08-09 13:40:00',
    endedAt: null
  },
  {
    id: 103,
    name: '夜班抽检',
    status: 'waiting',
    result: null,
    startedAt: '2026-08-09 22:00:00',
    endedAt: null
  }
])

const taskPagination = ref({ page: 1, rowsPerPage: 10, rowsNumber: 2 })
const resultPagination = ref({ page: 1, rowsPerPage: 10, rowsNumber: 3 })

const taskColumns = computed(() => [
  { name: 'name', label: t('patrol_task_name'), field: 'name', align: 'left' },
  { name: 'type', label: t('patrol_task_type'), field: (r) => typeLabel(r.type), align: 'left' },
  { name: 'pointNames', label: t('patrol_task_points'), field: 'pointNames', align: 'left' },
  { name: 'actions', label: t('patrol_task_actions'), field: 'actions', align: 'left' }
])

const resultColumns = computed(() => [
  { name: 'name', label: t('patrol_task_name'), field: 'name', align: 'left' },
  { name: 'status', label: t('patrol_task_status'), field: 'status', align: 'left' },
  { name: 'result', label: t('patrol_task_result'), field: 'result', align: 'left' },
  { name: 'timeRange', label: t('patrol_task_exec_time'), field: 'timeRange', align: 'left' },
  { name: 'actions', label: t('patrol_task_actions'), field: 'actions', align: 'left' }
])

function pointNamesOf (ids) {
  return (ids || []).map((id) => pointOptions.find((p) => p.value === id)?.label || String(id))
}

const taskRows = computed(() =>
  tasks.value.map((row) => ({ ...row, pointNames: pointNamesOf(row.pointIds) }))
)

const resultFilters = ref({ name: '', status: null, result: null, range: null })

const filteredResults = computed(() => {
  const f = resultFilters.value
  return runs.value.filter((r) => {
    if (f.name && !r.name.includes(f.name.trim())) return false
    if (f.status && r.status !== f.status) return false
    if (f.result && r.result !== f.result) return false
    if (f.range?.from && f.range?.to) {
      const day = (r.startedAt || '').slice(0, 10)
      if (day < f.range.from || day > f.range.to) return false
    }
    return true
  })
})

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
  if (v === 'done') return 'grey-7'
  return 'orange'
}

function onTaskRequest (req) {
  taskPagination.value = { ...taskPagination.value, ...req.pagination, rowsNumber: tasks.value.length }
}
function onResultRequest (req) {
  resultPagination.value = { ...resultPagination.value, ...req.pagination, rowsNumber: filteredResults.value.length }
}

const formOpen = ref(false)
const editingId = ref(null)
const form = ref({ name: '', type: 'once', pointIds: [] })

function openCreate () {
  editingId.value = null
  form.value = { name: '', type: 'once', pointIds: [] }
  formOpen.value = true
}
function openEdit (row) {
  editingId.value = row.id
  form.value = { name: row.name, type: row.type, pointIds: [...row.pointIds] }
  formOpen.value = true
}
function saveTask () {
  if (!form.value.name?.trim()) {
    Notify.create({ type: 'warning', message: t('patrol_task_name_required') })
    return
  }
  if (!form.value.pointIds?.length) {
    Notify.create({ type: 'warning', message: t('patrol_task_points_required') })
    return
  }
  if (editingId.value) {
    const row = tasks.value.find((x) => x.id === editingId.value)
    if (row) Object.assign(row, { ...form.value, name: form.value.name.trim() })
  } else {
    tasks.value.push({
      id: Date.now(),
      name: form.value.name.trim(),
      type: form.value.type,
      pointIds: [...form.value.pointIds]
    })
  }
  formOpen.value = false
  Notify.create({ type: 'info', message: t('patrol_task_template_saved') })
}
function removeTask (row) {
  $q.dialog({
    title: t('patrol_task_delete'),
    message: t('patrol_task_delete_confirm', { name: row.name }),
    cancel: true,
    persistent: true
  }).onOk(() => {
    tasks.value = tasks.value.filter((x) => x.id !== row.id)
    Notify.create({ type: 'info', message: t('patrol_task_template_saved') })
  })
}
function executeTask (row) {
  runs.value.unshift({
    id: Date.now(),
    name: row.name,
    status: 'running',
    result: null,
    startedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    endedAt: null
  })
  tab.value = 'results'
  Notify.create({ type: 'positive', message: t('patrol_task_execute_ok', { name: row.name }) })
}
function pauseRun (row) {
  if (row.status === 'running') row.status = 'waiting'
  Notify.create({ type: 'info', message: t('patrol_task_template_action') })
}
function cancelRun (row) {
  row.status = 'done'
  row.result = 'fail'
  row.endedAt = new Date().toISOString().slice(0, 19).replace('T', ' ')
  Notify.create({ type: 'info', message: t('patrol_task_template_action') })
}
function searchResults () {
  resultPagination.value.page = 1
}
function resetResultFilters () {
  resultFilters.value = { name: '', status: null, result: null, range: null }
}
</script>
