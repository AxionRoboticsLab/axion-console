<template>
  <q-dialog
    :model-value="modelValue"
    class="app-side-drawer-dialog"
    position="right"
    seamless
    @update:model-value="onUpdate"
  >
    <q-card class="app-side-drawer column no-wrap">
      <q-card-section class="app-side-drawer__header row items-center no-wrap q-py-sm">
        <div class="text-h6 ellipsis col">{{ title }}</div>
        <q-btn
          flat
          round
          dense
          icon="close"
          :aria-label="t('cancel')"
          @click="close"
        />
      </q-card-section>
      <q-separator />

      <q-card-section class="app-side-drawer__body col q-gutter-md">
        <slot />
      </q-card-section>

      <template v-if="$slots.actions">
        <q-separator />
        <q-card-actions align="right" class="q-pa-md app-side-drawer__actions">
          <slot name="actions" />
        </q-card-actions>
      </template>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { useI18n } from 'vue-i18n'

defineOptions({ name: 'AppSideDrawer' })

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  width: { type: String, default: '420px' }
})

const emit = defineEmits(['update:modelValue'])
const { t } = useI18n()

function onUpdate (v) {
  emit('update:modelValue', v)
}

function close () {
  emit('update:modelValue', false)
}
</script>

<style scoped>
.app-side-drawer {
  width: v-bind('props.width');
  max-width: 100vw;
  height: calc(100vh - var(--app-header-height));
  max-height: calc(100vh - var(--app-header-height));
  margin-top: var(--app-header-height);
  border-radius: 0;
  box-shadow: -2px 0 12px rgba(0, 0, 0, 0.12);
}

.app-side-drawer__header {
  min-height: 52px;
  flex-shrink: 0;
}

.app-side-drawer__body {
  overflow: auto;
  min-height: 0;
}

.app-side-drawer__actions {
  flex-shrink: 0;
}
</style>

<style>
/* Dialog shell: sit below fixed header, stretch to remaining viewport */
.app-side-drawer-dialog .q-dialog__inner--minimized {
  padding: 0 !important;
  align-items: flex-start;
  justify-content: flex-end;
}

.app-side-drawer-dialog .q-dialog__backdrop {
  top: var(--app-header-height);
}
</style>
