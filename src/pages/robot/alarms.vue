<template>
  <q-page class="app-page-fill column no-wrap q-pa-md">
    <div class="text-h5 q-mb-md app-page-fill__title">{{ t('alarm_title') }}</div>
    <q-banner dense class="bg-blue-1 text-primary q-mb-md rounded-borders">
      {{ t('alarm_events_hint') }}
    </q-banner>

    <q-tabs v-model="tab" dense align="left" class="text-primary" active-color="primary" indicator-color="primary">
      <q-tab name="list" :label="t('alarm_tab_list')" icon="notifications_active"/>
      <q-tab name="rules" :label="t('alarm_tab_rules')" icon="rule" disable/>
    </q-tabs>
    <q-separator/>

    <q-tab-panels v-model="tab" animated class="col column bg-transparent q-pt-md">
      <q-tab-panel name="list" class="q-pa-none column col">
        <AppDataTable
          row-key="id"
          :rows="alarms"
          :columns="alarmColumns"
          :loading="loading"
          :pagination="alarmPagination"
          @request="onAlarmRequest"
        >
          <template #top-right>
            <q-btn flat dense icon="refresh" :label="t('refresh')" @click="reload"/>
          </template>
          <template #body-cell-level="props">
            <q-td :props="props">
              <q-badge :color="levelColor(props.row.level)">{{ levelLabel(props.row.level) }}</q-badge>
            </q-td>
          </template>
          <template #body-cell-status="props">
            <q-td :props="props">
              {{ statusLabel(props.row.status) }}
            </q-td>
          </template>
          <template #body-cell-actions="props">
            <q-td :props="props">
              <q-btn
                v-if="props.row.status === 'open'"
                flat dense color="primary"
                :label="t('alarm_ack')"
                @click="onAck(props.row)"
              />
            </q-td>
          </template>
        </AppDataTable>
      </q-tab-panel>

      <q-tab-panel name="rules" class="q-pa-none">
        <div class="text-grey-7 q-pa-md">{{ t('alarm_rules_later') }}</div>
      </q-tab-panel>
    </q-tab-panels>
  </q-page>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Notify } from 'quasar'
import AppDataTable from 'components/common/AppDataTable.vue'
import { ackAlarmEvent, listAlarmEvents } from 'src/api/alarms'

defineOptions({ name: 'AlarmsPage' })

const { t } = useI18n()
const tab = ref('list')
const loading = ref(false)
const alarms = ref([])
const alarmPagination = ref({ page: 1, rowsPerPage: 10, rowsNumber: 0 })
let pollTimer = null

const levelOptions = computed(() => [
  { label: t('alarm_level_info'), value: 'info' },
  { label: t('alarm_level_warn'), value: 'warn' },
  { label: t('alarm_level_critical'), value: 'critical' }
])

const alarmColumns = computed(() => [
  { name: 'event', label: t('alarm_event'), field: 'event', align: 'left' },
  { name: 'level', label: t('alarm_level'), field: 'level', align: 'left' },
  { name: 'time', label: t('alarm_time'), field: 'time', align: 'left' },
  { name: 'source', label: t('alarm_source'), field: 'source', align: 'left' },
  { name: 'status', label: t('alarm_status'), field: 'status', align: 'left' },
  { name: 'detail', label: t('alarm_content'), field: 'detail', align: 'left' },
  { name: 'actions', label: t('alarm_actions'), field: 'actions', align: 'left' }
])

function levelLabel (v) {
  return levelOptions.value.find((o) => o.value === v)?.label || v
}
function levelColor (v) {
  if (v === 'critical') return 'negative'
  if (v === 'warn') return 'warning'
  return 'info'
}
function statusLabel (v) {
  return v === 'acked' ? t('alarm_status_acked') : t('alarm_status_open')
}

async function reload () {
  loading.value = true
  try {
    const rows = await listAlarmEvents({ limit: 200 })
    alarms.value = rows || []
    alarmPagination.value = {
      ...alarmPagination.value,
      rowsNumber: alarms.value.length
    }
  } catch (e) {
    Notify.create({ type: 'negative', message: e.message || t('alarm_load_failed') })
  } finally {
    loading.value = false
  }
}

function onAlarmRequest (req) {
  alarmPagination.value = {
    ...alarmPagination.value,
    ...req.pagination,
    rowsNumber: alarms.value.length
  }
}

async function onAck (row) {
  try {
    await ackAlarmEvent(row.id)
    Notify.create({ type: 'positive', message: t('alarm_ack_ok') })
    await reload()
  } catch (e) {
    Notify.create({ type: 'negative', message: e.message || t('alarm_ack_failed') })
  }
}

onMounted(() => {
  reload()
  pollTimer = setInterval(() => { void reload() }, 15000)
})

onUnmounted(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})
</script>
