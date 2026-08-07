<template>
  <q-page padding class="users-page">
    <div class="text-h5 q-mb-md">{{ t('user_mgmt_title') }}</div>

    <!-- 筛选项 -->
    <q-card flat bordered class="q-mb-md q-pa-md">
      <div class="row q-col-gutter-md items-end">
        <div class="col-12 col-sm-6 col-md-3">
          <q-input
            v-model="filters.username"
            outlined
            dense
            clearable
            :label="t('user_mgmt_username')"
            @keyup.enter="search"
          />
        </div>
        <div class="col-12 col-sm-6 col-md-3">
          <q-input
            v-model="filters.name"
            outlined
            dense
            clearable
            :label="t('user_mgmt_nickname')"
            @keyup.enter="search"
          />
        </div>
        <div class="col-12 col-sm-6 col-md-3">
          <q-select
            v-model="filters.roleFilter"
            outlined
            dense
            clearable
            emit-value
            map-options
            :options="roleFilterOptions"
            :label="t('user_mgmt_roles')"
          />
        </div>
        <div class="col-12 col-sm-6 col-md-3 row q-gutter-sm">
          <q-btn color="primary" unelevated icon="search" :label="t('user_mgmt_search')" @click="search" />
          <q-btn flat icon="refresh" :label="t('user_mgmt_reset')" @click="resetFilters" />
        </div>
      </div>
    </q-card>

    <q-table
      flat
      bordered
      row-key="id"
      :rows="rows"
      :columns="columns"
      :loading="loading"
      :pagination="pagination"
      @request="onRequest"
    >
      <template #top-right>
        <q-btn color="primary" unelevated icon="add" :label="t('user_mgmt_create')" @click="openCreate" />
      </template>

      <template #body-cell-avatar_url="props">
        <q-td :props="props">
          <q-avatar size="32px" color="grey-3" text-color="primary">
            <img v-if="props.row.avatar_url" :src="props.row.avatar_url" alt="" />
            <q-icon v-else name="person" />
          </q-avatar>
        </q-td>
      </template>

      <template #body-cell-roles="props">
        <q-td :props="props">
          <template v-if="(props.row.roles || []).length">
            <q-chip
              v-for="role in props.row.roles"
              :key="role.id"
              dense
              size="sm"
              color="primary"
              text-color="white"
              class="q-mr-xs"
            >
              {{ role.name }}
            </q-chip>
          </template>
          <q-chip v-else dense size="sm" color="grey-5" text-color="dark">
            {{ t('user_mgmt_role_default') }}
          </q-chip>
        </q-td>
      </template>

      <template #body-cell-enabled="props">
        <q-td :props="props">
          <q-badge :color="props.row.enabled ? 'positive' : 'grey'">
            {{ props.row.enabled ? t('user_mgmt_enabled') : t('user_mgmt_disabled') }}
          </q-badge>
        </q-td>
      </template>

      <template #body-cell-actions="props">
        <q-td :props="props">
          <q-btn flat dense color="primary" icon="edit" :label="t('user_mgmt_edit')" @click="openEdit(props.row)" />
          <q-btn flat dense color="negative" icon="delete" :label="t('user_mgmt_delete')" @click="confirmDelete(props.row)" />
        </q-td>
      </template>
    </q-table>

    <q-dialog v-model="drawerOpen" position="right" full-height seamless>
      <q-card class="user-drawer-card column full-height">
        <q-card-section class="text-h6">
          {{ isCreate ? t('user_mgmt_create') : t('user_mgmt_edit') }}
        </q-card-section>
        <q-separator />

        <q-card-section class="col q-gutter-md" style="overflow: auto; min-width: 380px; max-width: 420px">
          <q-input
            v-if="!isCreate"
            :model-value="String(form.id ?? '')"
            outlined
            dense
            disable
            :label="t('user_mgmt_id')"
          />
          <q-input
            v-model="form.username"
            outlined
            dense
            :disable="!isCreate"
            :label="t('user_mgmt_username')"
            :rules="[v => !!v || t('login_username_required')]"
          />
          <q-input
            v-model="form.name"
            outlined
            dense
            :label="t('user_mgmt_nickname')"
            :rules="[v => !!v || t('user_mgmt_nickname_required')]"
          />
          <q-input
            v-model="form.password"
            outlined
            dense
            :type="showPwd ? 'text' : 'password'"
            :label="isCreate ? t('user_mgmt_password') : t('user_mgmt_password_optional')"
            :hint="isCreate ? '' : t('user_mgmt_password_hint')"
            :rules="isCreate ? [v => !!v || t('login_password_required')] : []"
          >
            <template #append>
              <q-icon
                :name="showPwd ? 'visibility_off' : 'visibility'"
                class="cursor-pointer"
                @click="showPwd = !showPwd"
              />
            </template>
          </q-input>
          <q-input
            v-model="form.avatar_url"
            outlined
            dense
            clearable
            :label="t('user_mgmt_avatar')"
            :hint="t('user_mgmt_avatar_optional')"
          />
          <q-select
            v-model="form.role_ids"
            outlined
            dense
            multiple
            clearable
            emit-value
            map-options
            :options="roleOptions"
            :label="t('user_mgmt_roles')"
            :hint="t('user_mgmt_roles_optional')"
          />
          <q-toggle v-model="form.enabled" :label="t('user_mgmt_enabled')" color="primary" />
        </q-card-section>

        <q-separator />
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat :label="t('cancel')" v-close-popup />
          <q-btn color="primary" unelevated :loading="saving" :label="t('ok')" @click="saveUser" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQuasar } from 'quasar'
import { api } from 'boot/axios'

defineOptions({ name: 'UsersPage' })

const { t } = useI18n()
const $q = useQuasar()

const loading = ref(false)
const saving = ref(false)
const showPwd = ref(false)
const rows = ref([])
const roleOptions = ref([])
const drawerOpen = ref(false)
const isCreate = ref(false)

const filters = reactive({
  username: '',
  name: '',
  roleFilter: null // null | 'unassigned' | number role id
})

const pagination = ref({
  page: 1,
  rowsPerPage: 10,
  rowsNumber: 0
})

const form = reactive({
  id: null,
  username: '',
  name: '',
  avatar_url: '',
  password: '',
  role_ids: [],
  enabled: true
})

const roleFilterOptions = computed(() => [
  { label: t('user_mgmt_role_default'), value: 'unassigned' },
  ...roleOptions.value
])

const columns = computed(() => [
  { name: 'id', label: t('user_mgmt_id'), field: 'id', align: 'left' },
  { name: 'username', label: t('user_mgmt_username'), field: 'username', align: 'left' },
  { name: 'name', label: t('user_mgmt_nickname'), field: 'name', align: 'left' },
  { name: 'avatar_url', label: t('user_mgmt_avatar'), field: 'avatar_url', align: 'center' },
  { name: 'roles', label: t('user_mgmt_roles'), field: 'roles', align: 'left' },
  { name: 'enabled', label: t('user_mgmt_status'), field: 'enabled', align: 'center' },
  { name: 'actions', label: t('user_mgmt_actions'), field: 'actions', align: 'right' }
])

function resetForm () {
  form.id = null
  form.username = ''
  form.name = ''
  form.avatar_url = ''
  form.password = ''
  form.role_ids = []
  form.enabled = true
  showPwd.value = false
}

function buildQueryParams (page, rowsPerPage) {
  const params = {
    page_no: page,
    page_size: rowsPerPage
  }
  if (filters.username?.trim()) params.username = filters.username.trim()
  if (filters.name?.trim()) params.name = filters.name.trim()
  if (filters.roleFilter === 'unassigned') {
    params.unassigned = true
  } else if (typeof filters.roleFilter === 'number') {
    params.role_id = filters.roleFilter
  }
  return params
}

async function loadRoles () {
  const { data: body } = await api.get('/roles')
  if (body.code !== 0) throw new Error(body.msg || 'load roles failed')
  roleOptions.value = (body.data || []).map((r) => ({ label: r.name, value: r.id }))
}

async function loadUsers (page = pagination.value.page, rowsPerPage = pagination.value.rowsPerPage) {
  loading.value = true
  try {
    const { data: body } = await api.get('/users', {
      params: buildQueryParams(page, rowsPerPage)
    })
    if (body.code !== 0) {
      $q.notify({ type: 'negative', message: body.msg || t('user_mgmt_load_failed') })
      return
    }
    rows.value = body.data || []
    pagination.value.page = body.page_info?.cur_page || page
    pagination.value.rowsPerPage = body.page_info?.page_size || rowsPerPage
    pagination.value.rowsNumber = body.page_info?.items_total || 0
  } catch (e) {
    const msg = e?.response?.data?.msg || e?.message || t('user_mgmt_load_failed')
    $q.notify({ type: 'negative', message: msg })
  } finally {
    loading.value = false
  }
}

function search () {
  pagination.value.page = 1
  loadUsers(1, pagination.value.rowsPerPage)
}

function resetFilters () {
  filters.username = ''
  filters.name = ''
  filters.roleFilter = null
  search()
}

function onRequest (props) {
  const { page, rowsPerPage } = props.pagination
  pagination.value.page = page
  pagination.value.rowsPerPage = rowsPerPage
  loadUsers(page, rowsPerPage)
}

function openCreate () {
  isCreate.value = true
  resetForm()
  drawerOpen.value = true
}

function openEdit (row) {
  isCreate.value = false
  form.id = row.id
  form.username = row.username
  form.name = row.name || ''
  form.avatar_url = row.avatar_url || ''
  form.password = ''
  form.role_ids = [...(row.role_ids || [])]
  form.enabled = row.enabled !== false
  showPwd.value = false
  drawerOpen.value = true
}

async function saveUser () {
  if (!form.username?.trim()) {
    $q.notify({ type: 'warning', message: t('login_username_required') })
    return
  }
  if (!form.name?.trim()) {
    $q.notify({ type: 'warning', message: t('user_mgmt_nickname_required') })
    return
  }
  if (isCreate.value && !form.password) {
    $q.notify({ type: 'warning', message: t('login_password_required') })
    return
  }

  saving.value = true
  try {
    let body
    if (isCreate.value) {
      const res = await api.post('/users', {
        username: form.username.trim(),
        password: form.password,
        name: (form.name || '').trim(),
        avatar_url: (form.avatar_url || '').trim(),
        role_ids: form.role_ids || [],
        enabled: form.enabled
      })
      body = res.data
    } else {
      const payload = {
        name: (form.name || '').trim(),
        avatar_url: (form.avatar_url || '').trim(),
        role_ids: form.role_ids || [],
        enabled: form.enabled
      }
      if (form.password) payload.password = form.password
      const res = await api.patch(`/users/${form.id}`, payload)
      body = res.data
    }

    if (body.code !== 0) {
      $q.notify({ type: 'negative', message: body.msg || t('user_mgmt_save_failed') })
      return
    }
    $q.notify({ type: 'positive', message: t('user_mgmt_save_ok') })
    drawerOpen.value = false
    await loadUsers()
  } catch (e) {
    const msg = e?.response?.data?.msg || e?.response?.data?.detail?.msg || e?.message
    $q.notify({ type: 'negative', message: msg || t('user_mgmt_save_failed') })
  } finally {
    saving.value = false
  }
}

function confirmDelete (row) {
  $q.dialog({
    title: t('user_mgmt_delete'),
    message: t('user_mgmt_delete_confirm', { name: row.username }),
    cancel: true,
    persistent: true
  }).onOk(async () => {
    try {
      const { data: body } = await api.delete(`/users/${row.id}`)
      if (body.code !== 0) {
        $q.notify({ type: 'negative', message: body.msg || t('user_mgmt_delete_failed') })
        return
      }
      $q.notify({ type: 'positive', message: t('user_mgmt_delete_ok') })
      await loadUsers()
    } catch (e) {
      const msg = e?.response?.data?.msg || e?.response?.data?.detail?.msg || e?.message
      $q.notify({ type: 'negative', message: msg || t('user_mgmt_delete_failed') })
    }
  })
}

onMounted(async () => {
  try {
    await loadRoles()
  } catch (e) {
    $q.notify({ type: 'negative', message: e?.message || t('user_mgmt_load_failed') })
  }
  await loadUsers()
})
</script>

<style scoped>
.user-drawer-card {
  width: min(420px, 100vw);
  max-width: 420px;
  border-radius: 0;
}
</style>
