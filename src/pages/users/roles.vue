<template>
  <q-page class="app-page-fill column no-wrap q-pa-md">
    <div class="text-h5 q-mb-md" style="flex-shrink:0">{{ t('role_mgmt_title') }}</div>

    <q-card flat class="app-filter-card q-mb-md q-pa-md">
      <div class="row q-col-gutter-md items-end">
        <div class="col-12 col-sm-6 col-md-4">
          <q-input
            v-model="filters.name"
            outlined
            dense
            clearable
            :label="t('role_mgmt_name')"
            @keyup.enter="search"
          />
        </div>
        <div class="col-12 col-sm-6 col-md-4 row q-gutter-sm">
          <q-btn color="primary" unelevated icon="search" :label="t('role_mgmt_search')" @click="search" />
          <q-btn flat icon="refresh" :label="t('role_mgmt_reset')" @click="resetFilters" />
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
        <AuthButton
          code="role_create"
          color="primary"
          unelevated
          icon="add"
          :label="t('role_mgmt_create')"
          @click="openCreate"
        />
      </template>

      <template #body-cell-actions="props">
        <q-td :props="props">
          <AuthButton
            code="role_permission"
            flat
            dense
            color="secondary"
            icon="admin_panel_settings"
            :label="t('role_mgmt_permission')"
            @click="openPermission(props.row)"
          />
          <AuthButton
            code="role_edit"
            flat
            dense
            color="primary"
            icon="edit"
            :label="t('role_mgmt_edit')"
            @click="openEdit(props.row)"
          />
          <AuthButton
            v-if="props.row.name !== 'admin'"
            code="role_delete"
            flat
            dense
            color="negative"
            icon="delete"
            :label="t('role_mgmt_delete')"
            @click="confirmDelete(props.row)"
          />
        </q-td>
      </template>
    </AppDataTable>

    <AppSideDrawer
      v-model="drawerOpen"
      :title="isCreate ? t('role_mgmt_create') : t('role_mgmt_edit')"
    >
      <q-input
        v-if="!isCreate"
        :model-value="String(form.id ?? '')"
        outlined
        dense
        disable
        :label="t('role_mgmt_id')"
      />
      <q-input
        v-model="form.name"
        outlined
        dense
        lazy-rules
        :disable="!isCreate"
        :label="t('role_mgmt_name')"
        :hint="t('role_mgmt_name_hint')"
        :rules="[
          v => !!v || t('role_mgmt_name_required'),
          v => nameOk(v) || t('role_mgmt_name_invalid')
        ]"
      />
      <q-input
        v-model="form.description"
        outlined
        dense
        type="textarea"
        autogrow
        :label="t('role_mgmt_description')"
      />

      <template #actions>
        <q-btn flat :label="t('cancel')" @click="drawerOpen = false" />
        <q-btn color="primary" unelevated :loading="saving" :label="t('ok')" @click="saveRole" />
      </template>
    </AppSideDrawer>

    <AppSideDrawer
      v-model="permOpen"
      :title="permTitle"
    >
      <div v-if="permLoading" class="row flex-center q-pa-lg">
        <q-spinner color="primary" size="40px" />
      </div>
      <div v-else class="perm-tree">
        <div class="text-caption text-grey-7 q-mb-md">{{ t('role_mgmt_perm_hint') }}</div>
        <div v-for="node in permTree" :key="node.id" class="perm-node q-mb-md">
          <!-- 一级菜单 -->
          <q-checkbox
            class="text-weight-medium"
            :model-value="selectedMenuIds.includes(node.id)"
            :label="menuLabel(node)"
            @update:model-value="(v) => toggleMenu(node, v)"
          />
          <!-- 一级菜单自身的按钮（少见，多为页面级菜单） -->
          <div v-if="(node.buttons || []).length" class="perm-buttons q-ml-lg q-mt-xs">
            <q-checkbox
              v-for="btn in node.buttons"
              :key="btn.id"
              dense
              class="full-width"
              :model-value="selectedButtonIds.includes(btn.id)"
              :label="buttonLabel(btn)"
              @update:model-value="(v) => toggleButton(btn, node, v)"
            />
          </div>
          <!-- 子菜单 → 按钮 -->
          <div
            v-for="child in (node.children || [])"
            :key="child.id"
            class="perm-child q-ml-lg q-mt-sm"
          >
            <q-checkbox
              :model-value="selectedMenuIds.includes(child.id)"
              :label="menuLabel(child)"
              @update:model-value="(v) => toggleMenu(child, v)"
            />
            <div v-if="(child.buttons || []).length" class="perm-buttons q-ml-lg q-mt-xs">
              <q-checkbox
                v-for="btn in child.buttons"
                :key="btn.id"
                dense
                class="full-width"
                :model-value="selectedButtonIds.includes(btn.id)"
                :label="buttonLabel(btn)"
                @update:model-value="(v) => toggleButton(btn, child, v)"
              />
            </div>
            <div v-else class="text-caption text-grey-5 q-ml-lg q-mt-xs">
              {{ t('role_mgmt_no_buttons') }}
            </div>
          </div>
        </div>
        <div v-if="!permTree.length" class="text-grey-6">{{ t('role_mgmt_no_menus') }}</div>
      </div>

      <template #actions>
        <q-btn flat :label="t('cancel')" @click="permOpen = false" />
        <q-btn color="primary" unelevated :loading="permSaving" :label="t('ok')" @click="savePermission" />
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
import AuthButton from 'components/common/AuthButton.vue'

defineOptions({ name: 'RolesPage' })

const NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,19}$/

const { t } = useI18n()
const $q = useQuasar()
const auth = useAuthStore()

const loading = ref(false)
const saving = ref(false)
const rows = ref([])
const drawerOpen = ref(false)
const isCreate = ref(false)

const permOpen = ref(false)
const permLoading = ref(false)
const permSaving = ref(false)
const permRole = ref(null)
/** 完整菜单树：菜单 → [按钮] / 菜单 → 子菜单 → [按钮] */
const permTree = ref([])
const selectedMenuIds = ref([])
const selectedButtonIds = ref([])

const filters = reactive({ name: '' })
const pagination = ref({ page: 1, rowsPerPage: 10, rowsNumber: 0 })
const form = reactive({ id: null, name: '', description: '' })

const columns = computed(() => [
  { name: 'id', label: t('role_mgmt_id'), field: 'id', align: 'left' },
  { name: 'name', label: t('role_mgmt_name'), field: 'name', align: 'left' },
  { name: 'user_count', label: t('role_mgmt_user_count'), field: 'user_count', align: 'center' },
  { name: 'actions', label: t('role_mgmt_actions'), field: 'actions', align: 'right' }
])

const permTitle = computed(() => {
  const base = t('role_mgmt_permission')
  return permRole.value ? `${base} - ${permRole.value.name}` : base
})

function nameOk (v) {
  return NAME_RE.test((v || '').trim())
}

function menuLabel (m) {
  return m.nickname ? `${m.nickname} (${m.name})` : m.name
}

function buttonLabel (btn) {
  return `${btn.name} [${btn.code}]`
}

function collectSubtreeMenuIds (node) {
  const ids = [node.id]
  ;(node.children || []).forEach((c) => {
    ids.push(...collectSubtreeMenuIds(c))
  })
  return ids
}

function collectSubtreeButtonIds (node) {
  const ids = (node.buttons || []).map((b) => b.id)
  ;(node.children || []).forEach((c) => {
    ids.push(...collectSubtreeButtonIds(c))
  })
  return ids
}

async function loadRoles (page = pagination.value.page, rowsPerPage = pagination.value.rowsPerPage) {
  loading.value = true
  try {
    const params = { page_no: page, page_size: rowsPerPage }
    if (filters.name?.trim()) params.name = filters.name.trim()
    const { data: body } = await api.get('/roles', { params })
    if (body.code !== 0) {
      $q.notify({ type: 'negative', message: body.msg || t('role_mgmt_load_failed') })
      return
    }
    rows.value = body.data || []
    pagination.value.page = body.page_info?.cur_page || page
    pagination.value.rowsPerPage = body.page_info?.page_size || rowsPerPage
    pagination.value.rowsNumber = body.page_info?.items_total || 0
  } catch (e) {
    $q.notify({ type: 'negative', message: e?.response?.data?.msg || e?.message || t('role_mgmt_load_failed') })
  } finally {
    loading.value = false
  }
}

function search () {
  pagination.value.page = 1
  loadRoles(1, pagination.value.rowsPerPage)
}

function resetFilters () {
  filters.name = ''
  search()
}

function onRequest (props) {
  const { page, rowsPerPage } = props.pagination
  pagination.value.page = page
  pagination.value.rowsPerPage = rowsPerPage
  loadRoles(page, rowsPerPage)
}

function openCreate () {
  isCreate.value = true
  form.id = null
  form.name = ''
  form.description = ''
  drawerOpen.value = true
}

function openEdit (row) {
  isCreate.value = false
  form.id = row.id
  form.name = row.name
  form.description = row.description || ''
  drawerOpen.value = true
}

async function saveRole () {
  if (isCreate.value && !nameOk(form.name)) {
    $q.notify({ type: 'warning', message: t('role_mgmt_name_invalid') })
    return
  }
  saving.value = true
  try {
    let body
    if (isCreate.value) {
      const res = await api.post('/roles', {
        name: form.name.trim(),
        description: form.description || ''
      })
      body = res.data
    } else {
      const res = await api.patch(`/roles/${form.id}`, {
        description: form.description || ''
      })
      body = res.data
    }
    if (body.code !== 0) {
      $q.notify({ type: 'negative', message: body.msg || t('role_mgmt_save_failed') })
      return
    }
    $q.notify({ type: 'positive', message: t('role_mgmt_save_ok') })
    drawerOpen.value = false
    await loadRoles()
  } catch (e) {
    $q.notify({ type: 'negative', message: e?.response?.data?.msg || e?.message || t('role_mgmt_save_failed') })
  } finally {
    saving.value = false
  }
}

function confirmDelete (row) {
  $q.dialog({
    title: t('role_mgmt_delete'),
    message: t('role_mgmt_delete_confirm', { name: row.name }),
    cancel: true,
    persistent: true
  }).onOk(async () => {
    try {
      const { data: body } = await api.delete(`/roles/${row.id}`)
      if (body.code !== 0) {
        $q.notify({ type: 'negative', message: body.msg || t('role_mgmt_delete_failed') })
        return
      }
      $q.notify({ type: 'positive', message: t('role_mgmt_delete_ok') })
      await loadRoles()
    } catch (e) {
      $q.notify({ type: 'negative', message: e?.response?.data?.msg || e?.message || t('role_mgmt_delete_failed') })
    }
  })
}

async function openPermission (row) {
  permRole.value = row
  permOpen.value = true
  permLoading.value = true
  selectedMenuIds.value = []
  selectedButtonIds.value = []
  permTree.value = []
  try {
    const { data: body } = await api.get(`/roles/${row.id}/permissions`)
    if (body.code !== 0) {
      $q.notify({ type: 'negative', message: body.msg || t('role_mgmt_load_failed') })
      return
    }
    const data = body.data || {}
    // 优先用 tree；兼容旧字段 menus（扁平）时前端自行组树
    if (Array.isArray(data.tree) && data.tree.length) {
      permTree.value = data.tree
    } else if (Array.isArray(data.menus)) {
      permTree.value = flatMenusToTree(data.menus)
    } else {
      permTree.value = []
    }
    selectedMenuIds.value = [...(data.menu_ids || [])]
    selectedButtonIds.value = [...(data.button_ids || [])]
  } catch (e) {
    $q.notify({ type: 'negative', message: e?.response?.data?.msg || e?.message })
  } finally {
    permLoading.value = false
  }
}

function flatMenusToTree (menus) {
  const byId = {}
  menus.forEach((m) => {
    byId[m.id] = { ...m, buttons: m.buttons || [], children: [] }
  })
  const roots = []
  menus.forEach((m) => {
    const node = byId[m.id]
    if (m.parent_id && byId[m.parent_id]) {
      byId[m.parent_id].children.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

function toggleMenu (node, checked) {
  const ids = new Set(selectedMenuIds.value)
  const btnIds = new Set(selectedButtonIds.value)

  if (checked) {
    collectSubtreeMenuIds(node).forEach((id) => ids.add(id))
    if (node.parent_id) ids.add(node.parent_id)
  } else {
    collectSubtreeMenuIds(node).forEach((id) => ids.delete(id))
    collectSubtreeButtonIds(node).forEach((id) => btnIds.delete(id))
  }
  selectedMenuIds.value = [...ids]
  selectedButtonIds.value = [...btnIds]
}

function toggleButton (btn, menu, checked) {
  const ids = new Set(selectedMenuIds.value)
  const btnIds = new Set(selectedButtonIds.value)
  if (checked) {
    btnIds.add(btn.id)
    ids.add(menu.id)
    if (menu.parent_id) ids.add(menu.parent_id)
  } else {
    btnIds.delete(btn.id)
  }
  selectedMenuIds.value = [...ids]
  selectedButtonIds.value = [...btnIds]
}

async function savePermission () {
  if (!permRole.value) return
  permSaving.value = true
  try {
    const { data: body } = await api.put(`/roles/${permRole.value.id}/permissions`, {
      menu_ids: selectedMenuIds.value,
      button_ids: selectedButtonIds.value
    })
    if (body.code !== 0) {
      $q.notify({ type: 'negative', message: body.msg || t('role_mgmt_save_failed') })
      return
    }
    $q.notify({ type: 'positive', message: t('role_mgmt_save_ok') })
    permOpen.value = false
    await auth.fetchMe().catch(() => {})
  } catch (e) {
    $q.notify({ type: 'negative', message: e?.response?.data?.msg || e?.message || t('role_mgmt_save_failed') })
  } finally {
    permSaving.value = false
  }
}

onMounted(() => loadRoles())
</script>

<style scoped>
.app-filter-card {
  flex-shrink: 0;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.perm-buttons {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.perm-child {
  border-left: 2px solid rgba(0, 0, 0, 0.08);
  padding-left: 8px;
}
</style>
