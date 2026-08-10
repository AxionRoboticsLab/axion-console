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
        <q-card flat class="app-filter-card q-mb-md q-pa-md">
          <div class="row q-col-gutter-md items-end">
            <div class="col-12 col-sm-6 col-md-3">
              <q-input
                v-model="listFilters.name"
                outlined dense clearable
                :label="t('patrol_task_name')"
                @keyup.enter="applyListFilters"
              />
            </div>
            <div class="col-12 col-sm-6 col-md-2">
              <q-select
                v-model="listFilters.mapId"
                outlined dense clearable emit-value map-options
                :options="mapOptions"
                :label="t('patrol_task_map')"
                @update:model-value="onListMapFilterChange"
              />
            </div>
            <div class="col-12 col-sm-6 col-md-2">
              <q-select
                v-model="listFilters.type"
                outlined dense clearable emit-value map-options
                :options="typeOptions"
                :label="t('patrol_task_type')"
              />
            </div>
            <div class="col-12 col-sm-6 col-md-3">
              <q-select
                v-model="listFilters.pointKey"
                outlined dense clearable emit-value map-options
                :options="listPointOptions"
                :label="t('patrol_task_points')"
              />
            </div>
            <div class="col-12 col-sm-6 col-md-2 row q-gutter-sm">
              <q-btn color="primary" unelevated icon="search" :label="t('patrol_task_search')" @click="applyListFilters"/>
              <q-btn flat icon="refresh" :label="t('patrol_task_reset')" @click="resetListFilters"/>
            </div>
          </div>
        </q-card>

        <AppDataTable
          row-key="id"
          :rows="taskRows"
          :columns="taskColumns"
          :loading="tasksLoading || pointsLoading"
          :pagination="taskPagination"
          @request="onTaskRequest"
        >
          <template #top-right>
            <q-btn
              flat color="secondary" icon="schedule"
              :label="t('patrol_task_scheduler_tick')"
              :loading="tickLoading"
              @click="runSchedulerTick"
            />
            <q-btn color="primary" unelevated class="q-ml-sm" icon="add" :label="t('patrol_task_create')" @click="openCreate"/>
            <q-btn flat class="q-ml-sm" icon="refresh" @click="reloadTasks"/>
          </template>
          <template #body-cell-mapName="props">
            <q-td :props="props">
              <span>{{ props.row.mapName || '—' }}</span>
              <q-badge v-if="props.row.mapId === activeMapId" color="teal" class="q-ml-xs" dense>
                {{ t('patrol_task_map_current') }}
              </q-badge>
            </q-td>
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
          <template #body-cell-typeExtra="props">
            <q-td :props="props">
              <span class="text-caption text-grey-8">{{ typeExtraLabel(props.row) }}</span>
            </q-td>
          </template>
          <template #body-cell-actions="props">
            <q-td :props="props">
              <q-btn flat dense color="primary" icon="edit" :label="t('patrol_task_edit')" @click="openEdit(props.row)"/>
              <q-btn flat dense color="negative" icon="delete" :label="t('patrol_task_delete')" @click="removeTask(props.row)"/>
              <q-btn
                flat dense color="positive" icon="play_arrow"
                :label="t('patrol_task_execute')"
                :disable="!canExecute(props.row)"
                @click="executeTask(props.row)"
              >
                <q-tooltip v-if="!canExecute(props.row)">
                  {{ t('patrol_task_execute_map_mismatch') }}
                </q-tooltip>
              </q-btn>
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
          <template #body-cell-name="props">
            <q-td :props="props">
              <div>{{ props.row.name }}</div>
              <q-badge
                v-if="props.row.trigger === 'schedule'"
                color="deep-purple-4"
                dense
                class="q-mt-xs"
              >
                {{ t('patrol_task_trigger_schedule') }}
              </q-badge>
            </q-td>
          </template>
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
                v-if="props.row.status === 'running' && !isMissionDriving(props.row)"
                flat dense color="positive" icon="near_me"
                :label="t('patrol_task_claim')"
                @click="claimRun(props.row)"
              >
                <q-tooltip>{{ t('patrol_task_claim_hint') }}</q-tooltip>
              </q-btn>
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
                v-if="canViewReport(props.row)"
                flat dense color="primary" icon="description"
                :label="t('patrol_task_report')"
                @click="openReport(props.row)"
              />
            </q-td>
          </template>
        </AppDataTable>
      </q-tab-panel>
    </q-tab-panels>

    <!-- 新建 / 编辑 -->
    <q-dialog v-model="formOpen" persistent>
      <q-card style="min-width: 30rem; max-width: 40rem">
        <q-card-section class="text-h6">
          {{ editingId ? t('patrol_task_edit') : t('patrol_task_create') }}
        </q-card-section>
        <q-card-section class="q-gutter-md">
          <q-input v-model="form.name" outlined dense :label="t('patrol_task_name')"/>
          <q-select
            v-model="form.mapId"
            outlined dense emit-value map-options
            :options="mapOptions"
            :loading="pointsLoading"
            :label="t('patrol_task_map')"
            :disable="Boolean(editingId)"
            @update:model-value="onFormMapChange"
          />
          <q-select
            v-model="form.type"
            outlined dense emit-value map-options
            :options="typeOptions"
            :label="t('patrol_task_type')"
          />

          <template v-if="form.type === 'loop'">
            <q-input
              v-model.number="form.loopCount"
              outlined dense type="number" min="0"
              :label="t('patrol_task_loop_count')"
              :hint="t('patrol_task_loop_count_hint')"
            />
            <q-input
              v-model.number="form.loopIntervalSec"
              outlined dense type="number" min="0"
              :label="t('patrol_task_loop_interval')"
              :hint="t('patrol_task_loop_interval_hint')"
            />
          </template>

          <template v-if="form.type === 'schedule'">
            <q-input
              v-model="form.scheduleTime"
              outlined dense mask="##:##"
              :label="t('patrol_task_schedule_time')"
              :hint="t('patrol_task_schedule_time_hint')"
            >
              <template #append>
                <q-icon name="access_time" class="cursor-pointer">
                  <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                    <q-time v-model="form.scheduleTime" format24h>
                      <div class="row items-center justify-end q-gutter-sm q-pa-sm">
                        <q-btn v-close-popup :label="t('ok')" color="primary" flat/>
                      </div>
                    </q-time>
                  </q-popup-proxy>
                </q-icon>
              </template>
            </q-input>
            <q-input
              v-model="form.scheduleOnceAt"
              outlined dense clearable
              :label="t('patrol_task_schedule_once')"
              :hint="t('patrol_task_schedule_once_hint')"
            >
              <template #append>
                <q-icon name="event" class="cursor-pointer">
                  <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                    <q-date v-model="form.scheduleOnceAt" mask="YYYY-MM-DD HH:mm">
                      <div class="row items-center justify-end q-gutter-sm q-pa-sm">
                        <q-btn v-close-popup :label="t('ok')" color="primary" flat/>
                      </div>
                    </q-date>
                  </q-popup-proxy>
                </q-icon>
              </template>
            </q-input>
          </template>

          <q-select
            v-model="form.pointIds"
            outlined dense multiple emit-value map-options use-chips
            :options="formPointOptions"
            :loading="pointsLoading"
            :label="t('patrol_task_points')"
            :hint="formMapHint"
          />
          <q-toggle
            v-model="form.autoRecordBag"
            color="teal"
            :label="t('patrol_task_auto_record')"
          />
          <div class="text-caption text-grey-7" style="margin-top: -0.5rem">
            {{ t('patrol_task_auto_record_hint') }}
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat :label="t('cancel')" v-close-popup/>
          <q-btn color="primary" unelevated :loading="saving" :label="t('ok')" @click="saveTask"/>
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- 执行报告 -->
    <q-dialog v-model="reportOpen">
      <q-card class="patrol-report-card">
        <q-card-section class="row items-center no-wrap">
          <div class="text-h6 col">{{ t('patrol_task_report_title') }}</div>
          <q-btn flat round dense icon="close" v-close-popup/>
        </q-card-section>
        <q-separator/>
        <q-card-section v-if="report" class="q-pa-md" style="max-height: 82vh; overflow: auto">
          <div class="row q-col-gutter-lg">
            <div class="col-12 col-md-5 column q-gutter-md">
              <div>
                <div class="patrol-report__section-title">{{ t('patrol_task_report_summary') }}</div>
                <div class="patrol-report__summary">
                  <div class="patrol-report__kv">
                    <div class="patrol-report__k">{{ t('patrol_task_name') }}</div>
                    <div class="patrol-report__v">{{ report.summary?.name || '—' }}</div>
                  </div>
                  <div class="patrol-report__kv">
                    <div class="patrol-report__k">{{ t('patrol_task_exec_id') }}</div>
                    <div class="patrol-report__v patrol-report__v--mono">{{ report.summary?.exec_id || '—' }}</div>
                  </div>
                  <div class="patrol-report__kv">
                    <div class="patrol-report__k">{{ t('patrol_task_map') }}</div>
                    <div class="patrol-report__v">{{ report.summary?.map_name || '—' }}</div>
                  </div>
                  <div class="patrol-report__kv">
                    <div class="patrol-report__k">{{ t('patrol_task_status') }}</div>
                    <div class="patrol-report__v">
                      <q-badge :color="statusColor(report.summary?.status)">{{ statusLabel(report.summary?.status) }}</q-badge>
                    </div>
                  </div>
                  <div class="patrol-report__kv">
                    <div class="patrol-report__k">{{ t('patrol_task_result') }}</div>
                    <div class="patrol-report__v">
                      <template v-if="report.summary?.result">
                        <q-badge :color="report.summary.result === 'success' ? 'positive' : 'negative'">
                          {{ resultLabel(report.summary.result) }}
                        </q-badge>
                      </template>
                      <span v-else>—</span>
                    </div>
                  </div>
                  <div class="patrol-report__kv">
                    <div class="patrol-report__k">{{ t('patrol_task_report_progress') }}</div>
                    <div class="patrol-report__v">{{ report.summary?.progress || '—' }}</div>
                  </div>
                  <div class="patrol-report__kv patrol-report__kv--full">
                    <div class="patrol-report__k">{{ t('patrol_task_exec_time') }}</div>
                    <div class="patrol-report__v">
                      {{ report.summary?.startedAt || '—' }}
                      <span class="text-grey-6"> ~ </span>
                      {{ report.summary?.endedAt || '—' }}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div class="patrol-report__section-title">{{ t('patrol_task_route') }}</div>
                <div class="patrol-report__route">
                  {{ (report.route || []).join(' → ') || '—' }}
                  <span v-if="report.charge"> → {{ t('charge_point') }}</span>
                </div>
              </div>

              <div>
                <div class="patrol-report__section-title">{{ t('patrol_task_report_timeline') }}</div>
                <q-timeline color="primary" dense class="patrol-report__timeline">
                  <q-timeline-entry
                    v-for="(ev, idx) in (report.timeline || [])"
                    :key="idx"
                    :title="ev.label"
                    :subtitle="ev.t || ''"
                    :color="timelineColor(ev.event)"
                    :icon="timelineIcon(ev.event)"
                  />
                </q-timeline>
              </div>
            </div>

            <div class="col-12 col-md-7">
              <PatrolReplayPanel
                v-if="showPlayback"
                :report="report"
              />
              <div v-else class="patrol-replay-disabled column flex-center">
                <q-icon name="videocam_off" size="40px" color="grey-6"/>
                <div class="q-mt-sm text-grey-7">{{ t('patrol_replay_disabled') }}</div>
              </div>
            </div>
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<style scoped>
.patrol-report-card {
  width: min(72rem, 96vw);
  max-width: 96vw;
}

.patrol-report__section-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: #263238;
  margin-bottom: 0.55rem;
}

.patrol-report__summary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem 1rem;
  padding: 0.85rem 1rem;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  background: #fafafa;
}

.patrol-report__kv--full {
  grid-column: 1 / -1;
}

.patrol-report__k {
  font-size: 0.75rem;
  color: #78909c;
  margin-bottom: 0.15rem;
}

.patrol-report__v {
  font-size: 0.9rem;
  color: #37474f;
  word-break: break-all;
}

.patrol-report__v--mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.78rem;
}

.patrol-report__route {
  font-size: 0.9rem;
  color: #455a64;
  line-height: 1.5;
}

.patrol-report__timeline :deep(.q-timeline__title) {
  font-size: 0.82rem !important;
  font-weight: 500;
  line-height: 1.35;
}

.patrol-report__timeline :deep(.q-timeline__subtitle) {
  font-size: 0.72rem !important;
  opacity: 0.75;
}

.patrol-replay-disabled {
  min-height: 280px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 10px;
  background: #fafafa;
  padding: 1.5rem;
}
</style>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Notify, useQuasar } from 'quasar'
import AppDataTable from 'components/common/AppDataTable.vue'
import PatrolReplayPanel from 'components/map-pose/PatrolReplayPanel.vue'
import { getChargePoint, listMaps, listPatrolPoints } from 'src/api/maps'
import {
  createPatrolTask,
  deletePatrolTask,
  executePatrolTask,
  getPatrolRun,
  listPatrolRuns,
  listPatrolTasks,
  patrolRunAction,
  tickPatrolScheduler,
  updatePatrolTask
} from 'src/api/patrol-tasks'
import { usePatrolMission } from 'stores/patrol-mission'

defineOptions({ name: 'PatrolTasksPage' })

const { t } = useI18n()
const $q = useQuasar()
const router = useRouter()
const mission = usePatrolMission()
const tab = ref('list')

const mapCatalog = ref([])
const formPointCatalog = ref([])
const pointNameCache = ref({})
const activeMapId = ref(null)
const activeMapName = ref('')
const pointsLoading = ref(false)
const tasksLoading = ref(false)
const runsLoading = ref(false)
const saving = ref(false)

const mapOptions = computed(() =>
  mapCatalog.value.map((m) => ({
    label: m.status === 1 ? `${m.map_name} (${t('patrol_task_map_current')})` : m.map_name,
    value: m.id
  }))
)

const formPointOptions = computed(() =>
  formPointCatalog.value.map((p) => ({ label: p.name, value: p.id }))
)

const formMapHint = computed(() => {
  const m = mapCatalog.value.find((x) => x.id === form.value.mapId)
  if (!m) return t('patrol_need_map')
  return t('amr2d_loadMap_current', { name: m.map_name })
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
  { name: 'mapName', label: t('patrol_task_map'), field: 'mapName', align: 'left' },
  { name: 'type', label: t('patrol_task_type'), field: (r) => typeLabel(r.type), align: 'left' },
  { name: 'typeExtra', label: t('patrol_task_type_params'), field: 'typeExtra', align: 'left' },
  { name: 'pointNames', label: t('patrol_task_points'), field: 'pointNames', align: 'left' },
  { name: 'actions', label: t('patrol_task_actions'), field: 'actions', align: 'left', style: 'min-width: 14rem' }
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

function normalizeTask (row) {
  const cfg = row.config || {}
  return {
    id: row.id,
    name: row.name,
    type: row.type || row.task_type || 'once',
    pointIds: row.point_ids || row.pointIds || [],
    mapId: row.map_id ?? row.mapId,
    mapName: row.map_name || row.mapName || '',
    config: cfg,
    loopCount: cfg.loop_count ?? 0,
    loopIntervalSec: cfg.loop_interval_sec ?? 0,
    scheduleTime: cfg.schedule_time || '',
    scheduleOnceAt: cfg.schedule_once_at || '',
    autoRecordBag: cfg.auto_record_bag !== false
  }
}

function pointNamesOf (ids, mapId) {
  const cache = pointNameCache.value[mapId] || {}
  return (ids || []).map((id) => cache[id] || formPointCatalog.value.find((p) => p.id === id)?.name || String(id))
}

const listFilters = ref({ name: '', mapId: null, type: null, pointKey: null })
const listFilterApplied = ref({ name: '', mapId: null, type: null, pointKey: null })

const listPointOptions = computed(() => {
  const mapId = listFilters.value.mapId
  const mapIds = mapId != null
    ? [mapId]
    : [...new Set(tasks.value.map((r) => r.mapId).filter(Boolean))]
  const opts = []
  for (const mid of mapIds) {
    const cache = pointNameCache.value[mid] || {}
    const mapName = mapCatalog.value.find((m) => m.id === mid)?.map_name || ''
    for (const [id, name] of Object.entries(cache)) {
      opts.push({
        label: mapId != null ? name : (mapName ? `${name} (${mapName})` : name),
        value: `${mid}:${id}`
      })
    }
  }
  return opts
})

const taskRows = computed(() => {
  const f = listFilterApplied.value
  const nameQ = (f.name || '').trim().toLowerCase()
  let pointMapId = null
  let pointId = null
  if (f.pointKey) {
    const [mid, pid] = String(f.pointKey).split(':')
    pointMapId = Number(mid)
    pointId = Number(pid)
  }
  return tasks.value
    .filter((row) => {
      if (nameQ && !(row.name || '').toLowerCase().includes(nameQ)) return false
      if (f.mapId != null && row.mapId !== f.mapId) return false
      if (f.type && row.type !== f.type) return false
      if (pointId != null) {
        if (row.mapId !== pointMapId) return false
        if (!(row.pointIds || []).map(Number).includes(pointId)) return false
      }
      return true
    })
    .map((row) => ({
      ...row,
      pointNames: pointNamesOf(row.pointIds, row.mapId)
    }))
})

const resultFilters = ref({ name: '', status: null, result: null, range: null })

function applyListFilters () {
  listFilterApplied.value = { ...listFilters.value }
  taskPagination.value = {
    ...taskPagination.value,
    page: 1,
    rowsNumber: taskRows.value.length
  }
}

function resetListFilters () {
  listFilters.value = { name: '', mapId: null, type: null, pointKey: null }
  applyListFilters()
}

function onListMapFilterChange () {
  listFilters.value.pointKey = null
}

watch(taskRows, (rows) => {
  taskPagination.value = {
    ...taskPagination.value,
    rowsNumber: rows.length
  }
})

function typeLabel (v) {
  return typeOptions.value.find((o) => o.value === v)?.label || v
}
function typeExtraLabel (row) {
  if (row.type === 'loop') {
    const n = row.loopCount ?? 0
    const iv = row.loopIntervalSec ?? 0
    return t('patrol_task_loop_summary', {
      n: n === 0 ? t('patrol_task_loop_forever') : String(n),
      sec: iv
    })
  }
  if (row.type === 'schedule') {
    const parts = []
    if (row.scheduleTime) parts.push(t('patrol_task_schedule_daily', { time: row.scheduleTime }))
    if (row.scheduleOnceAt) parts.push(t('patrol_task_schedule_once_at', { at: row.scheduleOnceAt }))
    return parts.join(' · ') || '—'
  }
  return '—'
}
function statusLabel (v) {
  return statusOptions.value.find((o) => o.value === v)?.label || v || '—'
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
function canExecute (row) {
  return Boolean(activeMapId.value && row.mapId === activeMapId.value)
}
function isMissionDriving (row) {
  return mission.active && mission.runId === row.id
}
async function claimRun (row) {
  try {
    mission.requestFromRun(row)
    Notify.create({ type: 'positive', message: t('patrol_task_execute_jump', { name: row.name }) })
    await router.push({ name: 'robot_monitor' })
  } catch (e) {
    Notify.create({ type: 'negative', message: e.message || t('patrol_task_execute_failed') })
  }
}
function canViewReport (row) {
  return row.status === 'done' || row.status === 'cancelled' || Boolean(row.result)
}
function timelineColor (ev) {
  if (ev === 'done' || ev === 'arrived' || ev === 'return_charge') return 'positive'
  if (ev === 'fail' || ev === 'cancelled') return 'negative'
  if (ev === 'pending') return 'grey'
  return 'primary'
}
function timelineIcon (ev) {
  if (ev === 'started') return 'play_arrow'
  if (ev === 'arrived') return 'flag'
  if (ev === 'return_charge') return 'battery_charging_full'
  if (ev === 'done') return 'check_circle'
  if (ev === 'fail') return 'error'
  if (ev === 'cancelled') return 'cancel'
  return 'radio_button_unchecked'
}

function onTaskRequest (req) {
  taskPagination.value = { ...taskPagination.value, ...req.pagination, rowsNumber: taskRows.value.length }
}
function onResultRequest (req) {
  resultPagination.value = { ...resultPagination.value, ...req.pagination, rowsNumber: runs.value.length }
}

async function loadMapsAndActive () {
  const maps = await listMaps()
  mapCatalog.value = maps || []
  const active = (maps || []).find((m) => m.status === 1) || (maps || [])[0]
  activeMapId.value = active?.id ?? null
  activeMapName.value = active?.map_name || ''
  return active
}

async function loadPointsForMap (mapId) {
  if (!mapId) {
    formPointCatalog.value = []
    return
  }
  pointsLoading.value = true
  try {
    const rows = await listPatrolPoints(mapId)
    formPointCatalog.value = rows || []
    const cache = { ...(pointNameCache.value[mapId] || {}) }
    for (const p of rows || []) cache[p.id] = p.name
    pointNameCache.value = { ...pointNameCache.value, [mapId]: cache }
  } finally {
    pointsLoading.value = false
  }
}

async function onFormMapChange (mapId) {
  form.value.pointIds = []
  await loadPointsForMap(mapId)
}

async function reloadTasks () {
  tasksLoading.value = true
  try {
    await loadMapsAndActive()
    // 列出全部地图任务；执行按钮按当前地图禁用
    const rows = await listPatrolTasks()
    tasks.value = (rows || []).map(normalizeTask)
    // 预取各任务地图点位名
    const mapIds = [...new Set(tasks.value.map((r) => r.mapId).filter(Boolean))]
    await Promise.all(mapIds.map((id) => loadPointsForMap(id)))
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
    if (!activeMapId.value) await loadMapsAndActive()
    const f = resultFilters.value
    // 结果列表看全部（不按地图过滤），便于跨图审计
    const rows = await listPatrolRuns({
      name: f.name || undefined,
      status: f.status || undefined,
      result: f.result || undefined,
      from: f.range?.from || undefined,
      to: f.range?.to || undefined
    })
    runs.value = (rows || []).map((r) => ({
      ...r,
      execId: r.exec_id || r.execId || '',
      name: r.name || r.task_name || '',
      trigger: r.trigger || 'unknown',
      slot: r.slot || null,
      report: r.report || null
    }))
    resultPagination.value.rowsNumber = runs.value.length
  } catch (e) {
    Notify.create({ type: 'negative', message: e.message || t('patrol_task_load_failed') })
  } finally {
    runsLoading.value = false
  }
}

const tickLoading = ref(false)

async function runSchedulerTick () {
  tickLoading.value = true
  try {
    const r = await tickPatrolScheduler()
    Notify.create({
      type: 'positive',
      message: t('patrol_task_scheduler_tick_ok', {
        enqueued: r?.enqueued ?? 0,
        relayed: r?.relayed ?? 0
      })
    })
    tab.value = 'results'
    await reloadRuns()
  } catch (e) {
    Notify.create({ type: 'negative', message: e.message || t('patrol_task_load_failed') })
  } finally {
    tickLoading.value = false
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
const form = ref(emptyForm())

function emptyForm () {
  return {
    name: '',
    type: 'once',
    mapId: null,
    pointIds: [],
    loopCount: 0,
    loopIntervalSec: 0,
    scheduleTime: '08:00',
    scheduleOnceAt: '',
    autoRecordBag: true
  }
}

function buildConfig (f) {
  const base = { auto_record_bag: f.autoRecordBag !== false }
  if (f.type === 'loop') {
    return {
      ...base,
      loop_count: Number(f.loopCount) || 0,
      loop_interval_sec: Number(f.loopIntervalSec) || 0
    }
  }
  if (f.type === 'schedule') {
    return {
      ...base,
      schedule_time: (f.scheduleTime || '').trim(),
      schedule_once_at: (f.scheduleOnceAt || '').trim() || null
    }
  }
  return base
}

async function openCreate () {
  await loadMapsAndActive()
  editingId.value = null
  form.value = {
    ...emptyForm(),
    mapId: activeMapId.value
  }
  await loadPointsForMap(form.value.mapId)
  formOpen.value = true
}

async function openEdit (row) {
  await loadMapsAndActive()
  editingId.value = row.id
  form.value = {
    name: row.name,
    type: row.type,
    mapId: row.mapId,
    pointIds: [...row.pointIds],
    loopCount: row.loopCount ?? 0,
    loopIntervalSec: row.loopIntervalSec ?? 0,
    scheduleTime: row.scheduleTime || '08:00',
    scheduleOnceAt: row.scheduleOnceAt || '',
    autoRecordBag: row.autoRecordBag !== false
  }
  await loadPointsForMap(form.value.mapId)
  formOpen.value = true
}

async function saveTask () {
  if (!form.value.name?.trim()) {
    Notify.create({ type: 'warning', message: t('patrol_task_name_required') })
    return
  }
  if (!form.value.mapId) {
    Notify.create({ type: 'warning', message: t('patrol_need_map') })
    return
  }
  if (!form.value.pointIds?.length) {
    Notify.create({ type: 'warning', message: t('patrol_task_points_required') })
    return
  }
  if (form.value.type === 'schedule' && !form.value.scheduleTime && !form.value.scheduleOnceAt) {
    Notify.create({ type: 'warning', message: t('patrol_task_schedule_required') })
    return
  }
  saving.value = true
  try {
    const config = buildConfig(form.value)
    if (editingId.value) {
      await updatePatrolTask(editingId.value, {
        name: form.value.name.trim(),
        type: form.value.type,
        pointIds: [...form.value.pointIds],
        mapId: form.value.mapId,
        config
      })
    } else {
      await createPatrolTask({
        mapId: form.value.mapId,
        name: form.value.name.trim(),
        type: form.value.type,
        pointIds: [...form.value.pointIds],
        config
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

async function resolveStartPose (mapId) {
  const mid = mapId || activeMapId.value
  if (mid) {
    try {
      const charge = await getChargePoint(mid)
      if (charge) return { x: charge.x, y: charge.y, yaw: charge.yaw || 0 }
    } catch (_) { /* ignore */ }
  }
  await loadPointsForMap(mid)
  const first = formPointCatalog.value[0]
  if (first) return { x: first.x, y: first.y, yaw: first.yaw || 0 }
  return { x: 0, y: 0, yaw: 0 }
}

async function executeTask (row) {
  if (!row?.id) return
  if (!canExecute(row)) {
    Notify.create({ type: 'warning', message: t('patrol_task_execute_map_mismatch') })
    return
  }
  try {
    const start = await resolveStartPose(row.mapId)
    const run = await executePatrolTask(row.id, {
      startX: start.x,
      startY: start.y,
      startYaw: start.yaw
    })

    if (run.status === 'running' || run.auto_started) {
      Notify.create({
        type: 'positive',
        message: t('patrol_task_started_background', { name: row.name })
      })
      tab.value = 'results'
      await reloadRuns()
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

const reportOpen = ref(false)
const report = ref(null)
const showPlayback = computed(() => Boolean(report.value?.playback?.available))

async function openReport (row) {
  try {
    const detail = row.report ? row : await getPatrolRun(row.id)
    report.value = detail.report || detail
    if (!report.value?.summary) {
      const meta = detail.meta || {}
      report.value = {
        summary: {
          name: detail.name,
          exec_id: detail.exec_id || detail.execId,
          type: detail.type,
          status: detail.status,
          result: detail.result,
          map_name: detail.map_name,
          startedAt: detail.startedAt,
          endedAt: detail.endedAt,
          progress: '—'
        },
        route: (detail.ordered || []).map((p) => p.name || p.id),
        charge: detail.charge,
        timeline: detail.report?.timeline || [],
        playback: {
          kind: 'rosbag',
          available: Boolean(meta.auto_record_bag) && ['done', 'cancelled'].includes(detail.status),
          url: null,
          auto_record_bag: Boolean(meta.auto_record_bag)
        }
      }
    }
    reportOpen.value = true
  } catch (e) {
    Notify.create({ type: 'negative', message: e.message || t('patrol_task_load_failed') })
  }
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
