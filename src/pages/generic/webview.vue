<script lang="ts" setup>
import type { UvToastInstance } from '@/hooks/useApiException'
import { onLoad } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import { getTicket } from '@/api/login'
import PageState from '@/components/PageState.vue'
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
/** 换 ticket 失败的页内错误（只此一个提示面，可重试） */
const loadError = ref('')
const toastRef = ref<UvToastInstance | null>(null)
const { handleApiException } = useApiException(toastRef)
const url = computed(() => {
  if (loading.value || loadError.value)
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
    loadError.value = handleApiException(err, { showToast: false }).message
    return false
  }
}

async function load() {
  loading.value = true
  loadError.value = ''
  await ensureTicketReady()
  loading.value = false
}

onLoad(async (options) => {
  uri.value = decodeURIComponent(options?.uri || '/')
  isPublic.value = options?.public === '1' || options?.public === 'true'
  ticket.value = options?.ticket ? decodeURIComponent(options.ticket) : ''
  await load()
})
</script>

<template>
  <view class="yp-page">
    <uv-toast ref="toastRef" />
    <web-view v-if="url" :src="url" />
    <PageState v-else :loading="loading" :error="loadError" loading-text="页面加载中…" @retry="load" />
  </view>
</template>
