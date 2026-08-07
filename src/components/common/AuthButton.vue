<template>
  <q-btn
    v-if="allowed"
    v-bind="attrs"
    :loading="loading"
    @click="$emit('click', $event)"
  >
    <slot />
  </q-btn>
</template>

<script setup>
/**
 * 权限按钮：菜单管理中配置了对应 name(code)，
 * 且当前用户角色拥有该按钮权限时才渲染；否则不展示。
 *
 * 用法：
 *   <AuthButton code="user_create" color="primary" label="添加" @click="..." />
 */
import { computed, useAttrs } from 'vue'
import { useAuthStore } from 'stores/auth'

defineOptions({
  name: 'AuthButton',
  inheritAttrs: false
})

const props = defineProps({
  /** 与菜单管理「按钮 name」一致 */
  code: { type: String, required: true },
  loading: { type: Boolean, default: false }
})

defineEmits(['click'])

const attrs = useAttrs()
const auth = useAuthStore()
const allowed = computed(() => auth.hasButton(props.code))
</script>
