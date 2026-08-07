<template>
  <div class="app-data-table column no-wrap">
    <div
      v-if="$slots['top-left'] || $slots['top-right'] || $slots.top"
      class="app-data-table__top row items-center no-wrap q-px-sm q-py-xs"
    >
      <div class="row items-center q-gutter-sm col">
        <slot name="top-left" />
        <slot name="top" />
      </div>
      <div class="row items-center q-gutter-sm">
        <slot name="top-right" />
      </div>
    </div>

    <q-table
      class="app-data-table__table col"
      flat
      :row-key="rowKey"
      :rows="rows"
      :columns="columns"
      :loading="loading"
      :pagination="pagination"
      :rows-per-page-options="rowsPerPageOptions"
      binary-state-sort
      @request="onRequest"
    >
      <template v-for="(_, name) in bodySlots" :key="name" #[name]="scope">
        <slot :name="name" v-bind="scope || {}" />
      </template>

      <template #bottom="scope">
        <div class="app-data-table__bottom row items-center justify-end full-width q-gutter-md no-wrap">
          <span class="text-body2 text-grey-8">
            {{ t('table_total_pages', { n: pagesNumber(scope) }) }}
          </span>
          <span class="text-body2 text-grey-8">
            {{ t('table_current_page', { n: scope.pagination.page }) }}
          </span>
          <div class="row items-center no-wrap q-gutter-xs">
            <span class="text-body2 text-grey-8">{{ t('table_rows_per_page') }}</span>
            <q-select
              dense
              outlined
              emit-value
              map-options
              options-dense
              style="min-width: 88px"
              :model-value="scope.pagination.rowsPerPage"
              :options="pageSizeOptions"
              @update:model-value="(v) => changeRowsPerPage(scope, v)"
            />
          </div>
          <q-pagination
            dense
            boundary-links
            direction-links
            color="primary"
            :model-value="scope.pagination.page"
            :max="pagesNumber(scope)"
            :max-pages="6"
            @update:model-value="(p) => changePage(scope, p)"
          />
        </div>
      </template>
    </q-table>
  </div>
</template>

<script setup>
import { computed, useSlots } from 'vue'
import { useI18n } from 'vue-i18n'

defineOptions({ name: 'AppDataTable' })

const props = defineProps({
  rows: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  rowKey: { type: String, default: 'id' },
  pagination: {
    type: Object,
    required: true
  },
  rowsPerPageOptions: {
    type: Array,
    default: () => [10, 20, 50, 100]
  }
})

const emit = defineEmits(['request'])
const { t } = useI18n()
const slots = useSlots()

const bodySlots = computed(() => {
  const out = {}
  Object.keys(slots).forEach((name) => {
    if (name.startsWith('body-cell-') || name === 'body' || name === 'body-cell') {
      out[name] = true
    }
  })
  return out
})

const pageSizeOptions = computed(() =>
  props.rowsPerPageOptions.map((n) => ({ label: String(n), value: n }))
)

function pagesNumber (scope) {
  if (scope.pagesNumber != null) return Math.max(1, scope.pagesNumber)
  const { rowsPerPage, rowsNumber, page } = scope.pagination
  if (!rowsPerPage) return 1
  const total = Math.ceil((rowsNumber || 0) / rowsPerPage) || 1
  return Math.max(total, page || 1)
}

function onRequest (req) {
  emit('request', req)
}

function changePage (scope, page) {
  emit('request', {
    pagination: {
      ...scope.pagination,
      page
    }
  })
}

function changeRowsPerPage (scope, rowsPerPage) {
  emit('request', {
    pagination: {
      ...scope.pagination,
      page: 1,
      rowsPerPage
    }
  })
}
</script>

<style scoped>
.app-data-table {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  background: #fff;
  border-radius: 8px;
}

.app-data-table__top {
  flex-shrink: 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.app-data-table__table {
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* Fill remaining height; middle scrolls both axes; header sticky; bottom fixed */
.app-data-table__table :deep(.q-table__container) {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.app-data-table__table :deep(.q-table__middle) {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto !important;
}

.app-data-table__table :deep(thead tr th) {
  position: sticky;
  top: 0;
  z-index: 2;
  background: #fff;
}

.app-data-table__table :deep(.q-table__bottom) {
  flex-shrink: 0;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  padding: 8px 12px;
  background: #fff;
}

.app-data-table__bottom {
  min-height: 40px;
}
</style>
