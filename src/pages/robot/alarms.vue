<template>
  <q-page class="app-page-fill column no-wrap q-pa-md">
    <div class="text-h5 q-mb-md app-page-fill__title">{{ t('alarm_title') }}</div>
    <q-banner dense class="bg-blue-1 text-primary q-mb-md rounded-borders">
      {{ t('alarm_template_hint') }}
    </q-banner>

    <q-tabs v-model="tab" dense align="left" class="text-primary" active-color="primary" indicator-color="primary">
      <q-tab name="list" :label="t('alarm_tab_list')" icon="notifications_active"/>
      <q-tab name="rules" :label="t('alarm_tab_rules')" icon="rule"/>
    </q-tabs>
    <q-separator/>

    <q-tab-panels v-model="tab" animated class="col column bg-transparent q-pt-md">
      <q-tab-panel name="list" class="q-pa-none column col">
        <AppDataTable
          row-key="id"
          :rows="alarms"
          :columns="alarmColumns"
          :loading="false"
          :pagination="alarmPagination"
          @request="onAlarmRequest"
        >
          <template #body-cell-level="props">
            <q-td :props="props">
              <q-badge :color="levelColor(props.row.level)">{{ levelLabel(props.row.level) }}</q-badge>
            </q-td>
          </template>
          <template #body-cell-recipients="props">
            <q-td :props="props">
              <q-chip
                v-for="name in props.row.recipients"
                :key="name"
                dense size="sm" color="grey-3" text-color="dark" class="q-mr-xs"
              >
                {{ name }}
              </q-chip>
            </q-td>
          </template>
        </AppDataTable>
      </q-tab-panel>

      <q-tab-panel name="rules" class="q-pa-none column col">
        <AppDataTable
          row-key="id"
          :rows="rules"
          :columns="ruleColumns"
          :loading="false"
          :pagination="rulePagination"
          @request="onRuleRequest"
        >
          <template #top-right>
            <q-btn color="primary" unelevated icon="add" :label="t('alarm_rule_create')" @click="openRuleCreate"/>
          </template>
          <template #body-cell-level="props">
            <q-td :props="props">
              <q-badge :color="levelColor(props.row.level)">{{ levelLabel(props.row.level) }}</q-badge>
            </q-td>
          </template>
          <template #body-cell-notify="props">
            <q-td :props="props">
              {{ notifyLabel(props.row.notify) }}
            </q-td>
          </template>
          <template #body-cell-actions="props">
            <q-td :props="props">
              <q-btn flat dense color="primary" icon="edit" :label="t('alarm_rule_edit')" @click="openRuleEdit(props.row)"/>
              <q-btn flat dense color="negative" icon="delete" :label="t('alarm_rule_delete')" @click="removeRule(props.row)"/>
            </q-td>
          </template>
        </AppDataTable>
      </q-tab-panel>
    </q-tab-panels>

    <q-dialog v-model="ruleOpen" persistent>
      <q-card style="min-width: 30rem; max-width: 40rem">
        <q-card-section class="text-h6">
          {{ editingRuleId ? t('alarm_rule_edit') : t('alarm_rule_create') }}
        </q-card-section>
        <q-card-section class="q-gutter-md">
          <q-input v-model="ruleForm.name" outlined dense :label="t('alarm_rule_name')"/>
          <q-select
            v-model="ruleForm.level"
            outlined dense emit-value map-options
            :options="levelOptions"
            :label="t('alarm_level')"
          />
          <q-input v-model.number="ruleForm.threshold" outlined dense type="number" :label="t('alarm_threshold')"/>
          <q-input v-model="ruleForm.judge" outlined dense :label="t('alarm_judge')"/>
          <q-input v-model="ruleForm.content" outlined dense type="textarea" autogrow :label="t('alarm_content')"/>
          <q-select
            v-model="ruleForm.notify"
            outlined dense emit-value map-options
            :options="notifyOptions"
            :label="t('alarm_notify')"
          />
          <q-select
            v-model="ruleForm.contacts"
            outlined dense multiple emit-value map-options use-chips
            :options="contactOptions"
            :label="t('alarm_contacts')"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat :label="t('cancel')" v-close-popup/>
          <q-btn color="primary" unelevated :label="t('ok')" @click="saveRule"/>
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

defineOptions({ name: 'AlarmsPage' })

const { t } = useI18n()
const $q = useQuasar()
const tab = ref('list')

const levelOptions = computed(() => [
  { label: t('alarm_level_info'), value: 'info' },
  { label: t('alarm_level_warn'), value: 'warn' },
  { label: t('alarm_level_critical'), value: 'critical' }
])

const notifyOptions = computed(() => [
  { label: t('alarm_notify_app'), value: 'app' },
  { label: t('alarm_notify_sms'), value: 'sms' },
  { label: t('alarm_notify_email'), value: 'email' }
])

const contactOptions = [
  { label: '运维组', value: 'ops' },
  { label: '值班员', value: 'duty' },
  { label: '管理员', value: 'admin' }
]

const alarms = ref([
  {
    id: 1,
    event: '电量过低',
    level: 'warn',
    time: '2026-08-09 12:15:33',
    recipients: ['运维组', '值班员']
  },
  {
    id: 2,
    event: '定位丢失',
    level: 'critical',
    time: '2026-08-09 11:02:08',
    recipients: ['管理员']
  },
  {
    id: 3,
    event: '巡检超时',
    level: 'info',
    time: '2026-08-08 18:40:21',
    recipients: ['运维组']
  }
])

const rules = ref([
  {
    id: 1,
    name: '低电量告警',
    level: 'warn',
    threshold: 20,
    judge: 'battery < threshold',
    content: '机器人电量低于 {threshold}%',
    notify: 'app',
    contacts: ['ops', 'duty']
  },
  {
    id: 2,
    name: '定位丢失',
    level: 'critical',
    threshold: 1,
    judge: 'localize_lost == true',
    content: '机器人定位丢失，请立即处理',
    notify: 'sms',
    contacts: ['admin']
  }
])

const alarmPagination = ref({ page: 1, rowsPerPage: 10, rowsNumber: 3 })
const rulePagination = ref({ page: 1, rowsPerPage: 10, rowsNumber: 2 })

const alarmColumns = computed(() => [
  { name: 'event', label: t('alarm_event'), field: 'event', align: 'left' },
  { name: 'level', label: t('alarm_level'), field: 'level', align: 'left' },
  { name: 'time', label: t('alarm_time'), field: 'time', align: 'left' },
  { name: 'recipients', label: t('alarm_recipients'), field: 'recipients', align: 'left' }
])

const ruleColumns = computed(() => [
  { name: 'name', label: t('alarm_rule_name'), field: 'name', align: 'left' },
  { name: 'level', label: t('alarm_level'), field: 'level', align: 'left' },
  { name: 'threshold', label: t('alarm_threshold'), field: 'threshold', align: 'left' },
  { name: 'judge', label: t('alarm_judge'), field: 'judge', align: 'left' },
  { name: 'content', label: t('alarm_content'), field: 'content', align: 'left' },
  { name: 'notify', label: t('alarm_notify'), field: 'notify', align: 'left' },
  {
    name: 'contacts',
    label: t('alarm_contacts'),
    field: (r) => (r.contacts || []).map((c) => contactOptions.find((o) => o.value === c)?.label || c).join(', '),
    align: 'left'
  },
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
function notifyLabel (v) {
  return notifyOptions.value.find((o) => o.value === v)?.label || v
}

function onAlarmRequest (req) {
  alarmPagination.value = { ...alarmPagination.value, ...req.pagination, rowsNumber: alarms.value.length }
}
function onRuleRequest (req) {
  rulePagination.value = { ...rulePagination.value, ...req.pagination, rowsNumber: rules.value.length }
}

const ruleOpen = ref(false)
const editingRuleId = ref(null)
const ruleForm = ref({
  name: '',
  level: 'warn',
  threshold: 0,
  judge: '',
  content: '',
  notify: 'app',
  contacts: []
})

function openRuleCreate () {
  editingRuleId.value = null
  ruleForm.value = {
    name: '',
    level: 'warn',
    threshold: 0,
    judge: '',
    content: '',
    notify: 'app',
    contacts: []
  }
  ruleOpen.value = true
}
function openRuleEdit (row) {
  editingRuleId.value = row.id
  ruleForm.value = {
    name: row.name,
    level: row.level,
    threshold: row.threshold,
    judge: row.judge,
    content: row.content,
    notify: row.notify,
    contacts: [...(row.contacts || [])]
  }
  ruleOpen.value = true
}
function saveRule () {
  if (!ruleForm.value.name?.trim()) {
    Notify.create({ type: 'warning', message: t('alarm_rule_name_required') })
    return
  }
  if (editingRuleId.value) {
    const row = rules.value.find((x) => x.id === editingRuleId.value)
    if (row) Object.assign(row, { ...ruleForm.value, name: ruleForm.value.name.trim() })
  } else {
    rules.value.push({ id: Date.now(), ...ruleForm.value, name: ruleForm.value.name.trim() })
  }
  ruleOpen.value = false
  Notify.create({ type: 'info', message: t('alarm_template_saved') })
}
function removeRule (row) {
  $q.dialog({
    title: t('alarm_rule_delete'),
    message: t('alarm_rule_delete_confirm', { name: row.name }),
    cancel: true,
    persistent: true
  }).onOk(() => {
    rules.value = rules.value.filter((x) => x.id !== row.id)
    Notify.create({ type: 'info', message: t('alarm_template_saved') })
  })
}
</script>
