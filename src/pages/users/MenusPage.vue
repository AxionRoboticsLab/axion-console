<template>
  <q-page class="app-page-fill column no-wrap q-pa-md">
    <div class="text-h5 q-mb-md" style="flex-shrink:0">{{ t('menu_mgmt_title') }}</div>

    <q-card flat class="app-filter-card q-mb-md q-pa-md">
      <div class="row q-col-gutter-md items-end">
        <div class="col-12 col-sm-6 col-md-4">
          <q-input
            v-model="filters.name"
            outlined
            dense
            clearable
            :label="t('menu_mgmt_name')"
            @keyup.enter="search"
          />
        </div>
        <div class="col-12 col-sm-6 col-md-4 row q-gutter-sm">
          <q-btn color="primary" unelevated icon="search" :label="t('menu_mgmt_search')" @click="search" />
          <q-btn flat icon="refresh" :label="t('menu_mgmt_reset')" @click="resetFilters" />
        </div>
      </div>
    </q-card>

    <AppDataTable
      row-key="id"
      :rows="rows"
      :columns="columns"
      :loading="loading"
      :pagination="pagination"
      @request="onRequest"
    >
      <template #top-right>
        <q-btn
          v-if="auth.hasButton('menu_create')"
          color="primary"
          unelevated
          icon="add"
          :label="t('menu_mgmt_create')"
          @click="openCreate(null)"
        />
      </template>

      <template #body-cell-actions="props">
        <q-td :props="props">
          <q-btn
            v-if="auth.hasButton('menu_edit')"
            flat
            dense
            color="primary"
            icon="edit"
            :label="t('menu_mgmt_edit')"
            @click="openEdit(props.row)"
          />
          <q-btn
            v-if="auth.hasButton('menu_add_child') && !props.row.parent_id"
            flat
            dense
            color="secondary"
            icon="subdirectory_arrow_right"
            :label="t('menu_mgmt_add_child')"
            @click="openCreate(props.row.id)"
          />
          <q-btn
            v-if="auth.hasButton('menu_delete')"
            flat
            dense
            color="negative"
            icon="delete"
            :label="t('menu_mgmt_delete')"
            @click="confirmDelete(props.row)"
          />
        </q-td>
      </template>
    </AppDataTable>

    <AppSideDrawer
      v-model="drawerOpen"
      :title="drawerTitle"
      width="560px"
    >
      <q-input
        v-if="!isCreate"
        :model-value="String(form.id ?? '')"
        outlined
        dense
        disable
        :label="t('menu_mgmt_id')"
      />
      <q-input
        v-model="form.name"
        outlined
        dense
        lazy-rules
        :disable="!isCreate"
        :label="t('menu_mgmt_name')"
        :hint="t('menu_mgmt_name_hint')"
        :rules="[
          v => !!v || t('menu_mgmt_name_required'),
          v => nameOk(v) || t('menu_mgmt_name_invalid')
        ]"
      />
      <q-input
        v-model="form.nickname"
        outlined
        dense
        lazy-rules
        :label="t('menu_mgmt_nickname')"
        :hint="t('menu_mgmt_nickname_hint')"
        :rules="[v => !!v || t('menu_mgmt_nickname_required')]"
      />
      <q-input
        v-model="form.path"
        outlined
        dense
        :label="t('menu_mgmt_path')"
        hint="例如 /users/list"
      />
      <q-input
        v-model="form.page_entry"
        outlined
        dense
        :label="t('menu_mgmt_page_entry')"
        hint="例如 pages/users/UsersPage.vue"
      />
      <q-select
        v-model="form.parent_id"
        outlined
        dense
        clearable
        emit-value
        map-options
        :options="parentOptions"
        :label="t('menu_mgmt_parent')"
        :disable="!!fixedParentId || editHasChildren"
        :hint="editHasChildren ? t('menu_mgmt_parent_locked') : ''"
      />
      <q-input
        v-model="form.icon"
        outlined
        dense
        :label="t('menu_mgmt_icon')"
      />

      <div class="text-subtitle2 q-mt-sm">{{ t('menu_mgmt_buttons') }}</div>
      <div v-for="(btn, idx) in form.buttons" :key="idx" class="row q-col-gutter-sm q-mb-sm items-start">
        <div class="col-5">
          <q-input v-model="btn.name" outlined dense :label="t('menu_mgmt_btn_name')" />
        </div>
        <div class="col-5">
          <q-input v-model="btn.code" outlined dense :label="t('menu_mgmt_btn_code')" />
        </div>
        <div class="col-2">
          <q-btn flat dense color="negative" icon="delete" @click="form.buttons.splice(idx, 1)" />
        </div>
      </div>
      <q-btn flat dense color="primary" icon="add" :label="t('menu_mgmt_add_button')" @click="addButton" />

      <template #actions>
        <q-btn flat :label="t('cancel')" @click="drawerOpen = false" />
        <q-btn color="primary" unelevated :loading="saving" :label="t('ok')" @click="saveMenu" />
      </template>
    </AppSideDrawer>
  </q-page>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQuasar } from 'quasar'
import { api } from 'boot/axios'
import { useAuthStore } from 'stores/auth'
import AppDataTable from 'components/common/AppDataTable.vue'
import AppSideDrawer from 'components/common/AppSideDrawer.vue'

defineOptions({ name: 'MenusPage' })

const NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,19}$/

const { t } = useI18n()
const $q = useQuasar()
const auth = useAuthStore()

const loading = ref(false)
const saving = ref(false)
const rows = ref([])
const allMenus = ref([])
const drawerOpen = ref(false)
const isCreate = ref(false)
const fixedParentId = ref(null)

const filters = reactive({ name: '' })
const pagination = ref({ page: 1, rowsPerPage: 20, rowsNumber: 0 })
const form = reactive({
  id: null,
  name: '',
  nickname: '',
  path: '',
  page_entry: '',
  parent_id: null,
  icon: '',
  buttons: []
})

const columns = computed(() => [
  { name: 'name', label: t('menu_mgmt_name'), field: 'name', align: 'left' },
  { name: 'nickname', label: t('menu_mgmt_nickname'), field: 'nickname', align: 'left' },
  { name: 'path', label: t('menu_mgmt_path'), field: 'path', align: 'left' },
  { name: 'page_entry', label: t('menu_mgmt_page_entry'), field: 'page_entry', align: 'left' },
  { name: 'parent_name', label: t('menu_mgmt_parent'), field: 'parent_name', align: 'left' },
  { name: 'button_count', label: t('menu_mgmt_button_count'), field: 'button_count', align: 'center' },
  { name: 'actions', label: t('menu_mgmt_actions'), field: 'actions', align: 'right' }
])

const parentOptions = computed(() =>
  allMenus.value
    // 最多两层：父菜单只能选顶层菜单
    .filter((m) => !m.parent_id)
    .filter((m) => !form.id || m.id !== form.id)
    .map((m) => ({
      label: m.nickname ? `${m.nickname} (${m.name})` : m.name,
      value: m.id
    }))
)

const drawerTitle = computed(() => {
  if (isCreate.value) {
    return fixedParentId.value ? t('menu_mgmt_add_child') : t('menu_mgmt_create')
  }
  return t('menu_mgmt_edit')
})

const editHasChildren = computed(() => {
  if (isCreate.value || !form.id) return false
  return allMenus.value.some((m) => m.parent_id === form.id)
})

function nameOk (v) {
  return NAME_RE.test((v || '').trim())
}

function addButton () {
  form.buttons.push({ name: '', code: '' })
}

function resetForm () {
  form.id = null
  form.name = ''
  form.nickname = ''
  form.path = ''
  form.page_entry = ''
  form.parent_id = null
  form.icon = ''
  form.buttons = []
}

async function loadAllMenusForParent () {
  const { data: body } = await api.get('/menus', { params: { page_no: 1, page_size: 500 } })
  if (body.code === 0) allMenus.value = body.data || []
}

async function loadMenus (page = pagination.value.page, rowsPerPage = pagination.value.rowsPerPage) {
  loading.value = true
  try {
    const params = { page_no: page, page_size: rowsPerPage }
    if (filters.name?.trim()) params.name = filters.name.trim()
    const { data: body } = await api.get('/menus', { params })
    if (body.code !== 0) {
      $q.notify({ type: 'negative', message: body.msg || t('menu_mgmt_load_failed') })
      return
    }
    rows.value = body.data || []
    pagination.value.page = body.page_info?.cur_page || page
    pagination.value.rowsPerPage = body.page_info?.page_size || rowsPerPage
    pagination.value.rowsNumber = body.page_info?.items_total || 0
  } catch (e) {
    $q.notify({ type: 'negative', message: e?.response?.data?.msg || e?.message || t('menu_mgmt_load_failed') })
  } finally {
    loading.value = false
  }
}

function search () {
  pagination.value.page = 1
  loadMenus(1, pagination.value.rowsPerPage)
}

function resetFilters () {
  filters.name = ''
  search()
}

function onRequest (props) {
  const { page, rowsPerPage } = props.pagination
  pagination.value.page = page
  pagination.value.rowsPerPage = rowsPerPage
  loadMenus(page, rowsPerPage)
}

async function openCreate (parentId) {
  // 子菜单不能再添加子菜单
  if (parentId) {
    const parent = allMenus.value.find((m) => m.id === parentId) || rows.value.find((m) => m.id === parentId)
    if (parent?.parent_id) {
      $q.notify({ type: 'warning', message: t('menu_mgmt_depth_exceeded') })
      return
    }
  }
  isCreate.value = true
  fixedParentId.value = parentId
  resetForm()
  form.parent_id = parentId
  await loadAllMenusForParent()
  drawerOpen.value = true
}

async function openEdit (row) {
  isCreate.value = false
  fixedParentId.value = null
  await loadAllMenusForParent()
  form.id = row.id
  form.name = row.name
  form.nickname = row.nickname || ''
  form.path = row.path || ''
  form.page_entry = row.page_entry || ''
  form.parent_id = row.parent_id
  form.icon = row.icon || ''
  form.buttons = (row.buttons || []).map((b) => ({ name: b.name, code: b.code }))
  drawerOpen.value = true
}

function childCountOf (menuId) {
  return allMenus.value.filter((m) => m.parent_id === menuId).length
}

function confirmDelete (row) {
  const childCount = childCountOf(row.id)
  if (childCount > 0) {
    $q.notify({ type: 'warning', message: t('menu_mgmt_has_children') })
    return
  }
  if ((row.button_count || 0) > 0 || (row.buttons || []).length > 0) {
    $q.notify({ type: 'warning', message: t('menu_mgmt_has_buttons') })
    return
  }

  $q.dialog({
    title: t('menu_mgmt_delete'),
    message: t('menu_mgmt_delete_confirm', { name: row.nickname || row.name }),
    cancel: true,
    persistent: true
  }).onOk(async () => {
    try {
      const { data: body } = await api.delete(`/menus/${row.id}`)
      if (body.code !== 0) {
        $q.notify({ type: 'negative', message: body.msg || t('menu_mgmt_delete_failed') })
        return
      }
      $q.notify({ type: 'positive', message: t('menu_mgmt_delete_ok') })
      await loadAllMenusForParent()
      await loadMenus()
      await auth.fetchMe().catch(() => {})
    } catch (e) {
      $q.notify({
        type: 'negative',
        message: e?.response?.data?.msg || e?.message || t('menu_mgmt_delete_failed')
      })
    }
  })
}

async function saveMenu () {
  if (isCreate.value && !nameOk(form.name)) {
    $q.notify({ type: 'warning', message: t('menu_mgmt_name_invalid') })
    return
  }
  if (!form.nickname?.trim()) {
    $q.notify({ type: 'warning', message: t('menu_mgmt_nickname_required') })
    return
  }
  if (form.parent_id) {
    const parent = allMenus.value.find((m) => m.id === form.parent_id)
    if (parent?.parent_id) {
      $q.notify({ type: 'warning', message: t('menu_mgmt_depth_exceeded') })
      return
    }
  }

  const buttons = (form.buttons || [])
    .map((b) => ({ name: (b.name || '').trim(), code: (b.code || '').trim() }))
    .filter((b) => b.name && b.code)

  saving.value = true
  try {
    let body
    if (isCreate.value) {
      const res = await api.post('/menus', {
        name: form.name.trim(),
        nickname: form.nickname.trim(),
        path: form.path || '',
        page_entry: form.page_entry || '',
        parent_id: form.parent_id || null,
        icon: form.icon || '',
        buttons
      })
      body = res.data
    } else {
      const res = await api.patch(`/menus/${form.id}`, {
        nickname: form.nickname.trim(),
        path: form.path || '',
        page_entry: form.page_entry || '',
        parent_id: form.parent_id || null,
        clear_parent: !form.parent_id,
        icon: form.icon || '',
        buttons
      })
      body = res.data
    }
    if (body.code !== 0) {
      $q.notify({ type: 'negative', message: body.msg || t('menu_mgmt_save_failed') })
      return
    }
    $q.notify({ type: 'positive', message: t('menu_mgmt_save_ok') })
    drawerOpen.value = false
    await loadMenus()
    await auth.fetchMe().catch(() => {})
  } catch (e) {
    $q.notify({ type: 'negative', message: e?.response?.data?.msg || e?.message || t('menu_mgmt_save_failed') })
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await loadAllMenusForParent()
  await loadMenus()
})
</script>

<style scoped>
.app-filter-card {
  flex-shrink: 0;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}
</style>
