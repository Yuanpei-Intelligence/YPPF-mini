<script lang="ts" setup>
import type { UvToastInstance } from '@/hooks/useApiException'
import { getTicket } from '@/api/login'
import { useApiException } from '@/hooks/useApiException'
import { toBackendURL } from '@/utils'

definePage({
  style: {
  },
})

/* 对于不需要登录的页面isPublic=true，不需要换ticket，直接访问即可 */
const uri = ref('/')
const ticket = ref('')
const isPublic = ref(false)
const loading = ref(true)
const loadFailed = ref(false)
const toastRef = ref<UvToastInstance | null>(null)
const { handleApiException } = useApiException(toastRef)
const url = computed(() => {
  if (loading.value || loadFailed.value)
    return ''
  if (isPublic.value)
    return toBackendURL(uri.value)
  return `${toBackendURL('/redirect')}?ticket=${ticket.value}&to=${encodeURIComponent(toBackendURL(uri.value))}`
})

async function ensureTicketReady() {
  if (isPublic.value || ticket.value)
    return true

  try {
    const res = await getTicket()
    ticket.value = res.ticket
    return true
  }
  catch (err) {
    console.error(err)
    handleApiException(err)
    loadFailed.value = true
    return false
  }
}

onLoad(async (options) => {
  uri.value = decodeURIComponent(options.uri || '/')
  isPublic.value = options.public === '1' || options.public === 'true'
  ticket.value = options.ticket ? decodeURIComponent(options.ticket) : ''
  loading.value = true
  loadFailed.value = false

  await ensureTicketReady()
  loading.value = false
})
</script>

<template>
  <view class="h-full w-full">
    <uv-toast ref="toastRef" />
    <web-view v-if="url" :src="url" />
    <view v-else class="h-full w-full flex items-center justify-center text-sm text-gray-500">
      <text>{{ loadFailed ? '页面加载失败' : '页面加载中...' }}</text>
    </view>
  </view>
</template>
