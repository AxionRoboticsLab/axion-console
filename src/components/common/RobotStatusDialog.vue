<template>
  <q-dialog :model-value="modelValue" persistent @update:model-value="emit('update:modelValue', $event)">
    <q-card class="robot-status-dialog">
      <q-btn
        class="robot-status-dialog__close"
        flat round dense
        icon="close"
        color="grey-8"
        :aria-label="t('close')"
        @click="emit('update:modelValue', false)"
      />

      <div class="robot-status-dialog__body row no-wrap">
        <q-tabs
          v-model="tab"
          vertical
          dense
          class="robot-status-dialog__tabs"
          active-color="primary"
          indicator-color="primary"
        >
          <q-tab name="overview" icon="info" :label="t('robot_tab_overview')"/>
          <q-tab name="battery" icon="battery_charging_full" :label="t('robot_tab_battery')"/>
          <q-tab name="control" icon="power_settings_new" :label="t('robot_tab_control')"/>
          <q-tab name="network" icon="wifi" :label="t('robot_tab_network')"/>
        </q-tabs>

        <q-separator vertical/>

        <q-tab-panels v-model="tab" animated class="robot-status-dialog__panels col">
          <q-tab-panel name="overview" class="q-gutter-md">
            <div class="text-h6">{{ t('robot_status_title') }}</div>
            <q-list dense bordered class="rounded-borders">
              <q-item>
                <q-item-section>{{ t('robot_model') }}</q-item-section>
                <q-item-section side>{{ runtime.model }}</q-item-section>
              </q-item>
              <q-item>
                <q-item-section>{{ t('robot_version') }}</q-item-section>
                <q-item-section side>{{ runtime.version }}</q-item-section>
              </q-item>
              <q-item>
                <q-item-section>{{ t('robot_sn') }}</q-item-section>
                <q-item-section side>{{ runtime.sn }}</q-item-section>
              </q-item>
              <q-item>
                <q-item-section>{{ t('robot_online') }}</q-item-section>
                <q-item-section side>
                  <q-badge :color="runtime.online ? 'positive' : 'negative'">
                    {{ runtime.online ? t('robot_online_yes') : t('robot_online_no') }}
                  </q-badge>
                </q-item-section>
              </q-item>
              <q-item>
                <q-item-section>{{ t('robot_work_state') }}</q-item-section>
                <q-item-section side>{{ workStateLabel }}</q-item-section>
              </q-item>
              <q-item>
                <q-item-section>{{ t('robot_estop') }}</q-item-section>
                <q-item-section side>
                  <q-badge :color="runtime.estop ? 'negative' : 'positive'">
                    {{ runtime.estop ? t('robot_estop') : t('robot_estop_clear') }}
                  </q-badge>
                </q-item-section>
              </q-item>
              <q-item>
                <q-item-section>{{ t('robot_battery') }}</q-item-section>
                <q-item-section side>{{ runtime.batteryLabel }}</q-item-section>
              </q-item>
            </q-list>
          </q-tab-panel>

          <q-tab-panel name="battery" class="q-gutter-md">
            <div class="text-h6">{{ t('robot_tab_battery') }}</div>
            <div class="row items-center q-gutter-md">
              <q-circular-progress
                show-value
                font-size="16px"
                :value="runtime.battery"
                size="96px"
                :thickness="0.22"
                :color="runtime.battery <= 15 ? 'negative' : (runtime.charging ? 'positive' : 'primary')"
                track-color="grey-3"
              >
                {{ runtime.battery }}%
              </q-circular-progress>
              <div>
                <div class="text-subtitle1">
                  {{ runtime.charging ? t('robot_charging') : t('robot_discharging') }}
                </div>
                <div class="text-caption text-grey-7">
                  {{ runtime.charging ? t('robot_charge_hint_on') : t('robot_charge_hint_off') }}
                </div>
              </div>
            </div>
          </q-tab-panel>

          <q-tab-panel name="control" class="q-gutter-md">
            <div class="text-h6">{{ t('robot_tab_control') }}</div>
            <div class="text-body2 text-grey-8">{{ t('robot_control_hint') }}</div>
            <div class="row q-gutter-sm">
              <q-btn
                color="negative"
                outline
                icon="power_settings_new"
                :label="t('robot_shutdown')"
                :disable="!runtime.online"
                @click="onShutdown"
              />
              <q-btn
                color="primary"
                unelevated
                icon="restart_alt"
                :label="t('robot_reboot')"
                @click="onReboot"
              />
            </div>
          </q-tab-panel>

          <q-tab-panel name="network" class="q-gutter-md">
            <div class="text-h6">{{ t('robot_tab_network') }}</div>
            <q-list dense bordered class="rounded-borders">
              <q-item>
                <q-item-section>{{ t('robot_ros_link') }}</q-item-section>
                <q-item-section side>
                  <q-badge :color="runtime.online ? 'positive' : 'grey'">
                    {{ runtime.online ? t('robot_link_ok') : t('robot_link_down') }}
                  </q-badge>
                </q-item-section>
              </q-item>
              <q-item>
                <q-item-section>{{ t('robot_ip') }}</q-item-section>
                <q-item-section side>192.168.1.100</q-item-section>
              </q-item>
            </q-list>
          </q-tab-panel>
        </q-tab-panels>
      </div>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Notify, useQuasar } from 'quasar'
import { useRobotRuntime } from 'stores/robot-runtime'

defineOptions({ name: 'RobotStatusDialog' })

defineProps({
  modelValue: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()
const $q = useQuasar()
const runtime = useRobotRuntime()
const tab = ref('overview')

const workStateLabel = computed(() => {
  const map = {
    idle: t('robot_state_idle'),
    navigating: t('robot_state_navigating'),
    patrol: t('robot_state_patrol'),
    paused: t('robot_state_paused'),
    offline: t('robot_state_offline')
  }
  return map[runtime.workState] || runtime.workState
})

function onShutdown () {
  $q.dialog({
    title: t('robot_shutdown'),
    message: t('robot_shutdown_confirm'),
    cancel: true,
    persistent: true
  }).onOk(() => {
    runtime.shutdown()
    Notify.create({ type: 'warning', message: t('robot_shutdown_done') })
    emit('update:modelValue', false)
  })
}

function onReboot () {
  $q.dialog({
    title: t('robot_reboot'),
    message: t('robot_reboot_confirm'),
    cancel: true,
    persistent: true
  }).onOk(() => {
    runtime.reboot()
    Notify.create({ type: 'positive', message: t('robot_reboot_done') })
  })
}
</script>

<style scoped>
.robot-status-dialog {
  width: min(720px, 92vw);
  max-width: 92vw;
  min-height: 360px;
  position: relative;
  overflow: hidden;
}
.robot-status-dialog__close {
  position: absolute;
  top: 0.4rem;
  right: 0.4rem;
  z-index: 2;
}
.robot-status-dialog__body {
  min-height: 360px;
}
.robot-status-dialog__tabs {
  min-width: 8.5rem;
  padding: 2.2rem 0 0.75rem;
}
.robot-status-dialog__panels {
  padding-top: 0.5rem;
}
</style>
