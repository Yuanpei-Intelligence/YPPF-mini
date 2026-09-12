<script lang="ts" setup>
import type { FeedbackClientInfo, FeedbackCreate } from '@/api/types/feedback'
import type { UvToastInstance } from '@/hooks/useApiException'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { createFeedback } from '@/api/feedback'
import ApiFieldError from '@/components/ApiFieldError.vue'
import { useApiException } from '@/hooks/useApiException'
import { toRequestError } from '@/http/errors'
import { useRolloutStore } from '@/store/rollout'

definePage({
  style: {
    navigationBarTitleText: '体验反馈',
  },
})

const TITLE_MAX_LENGTH = 25
const CONTENT_MAX_LENGTH = 500
/** 与后端 Feature.key（SlugField，最长 64 个字符）一致 */
const FEATURE_KEY_PATTERN = /^[\w-]{1,64}$/
/** 表单里有对应控件的字段；其余字段的后端错误汇总显示在表单上方 */
const FORM_FIELDS = new Set(['title', 'content'])
const PREVIEW_CHANNEL_PAGE = '/pages/me/preview'

const rolloutStore = useRolloutStore()
const { experiments, feedback, loadError, status } = storeToRefs(rolloutStore)
const toastRef = ref<UvToastInstance | null>(null)
const {
  clearFieldError,
  clearFieldErrors,
  fieldErrors,
  getFieldMessages,
  handleApiException,
  setFieldError,
  showMessage,
} = useApiException(toastRef)

const featureKey = ref('')
const title = ref('')
const content = ref('')
const publisherPublic = ref(false)
const submitting = ref(false)
const submitted = ref(false)

const experiment = computed(() => experiments.value.find(item => item.key === featureKey.value) ?? null)
const formDisabled = computed(() => !feedback.value || submitting.value || submitted.value)
const otherErrorMessages = computed(() => Object.entries(fieldErrors.value)
  .filter(([field]) => !FORM_FIELDS.has(field))
  .flatMap(([, items]) => items.map(item => item.message)))

watch(title, () => clearFieldError('title'))
watch(content, () => clearFieldError('content'))

onLoad((options) => {
  let key = ''
  try {
    key = decodeURIComponent(typeof options?.feature === 'string' ? options.feature : '')
  }
  catch {
    key = ''
  }
  featureKey.value = FEATURE_KEY_PATTERN.test(key) ? key : ''
})

// 从分享卡片直接进入时也要取回反馈目标；已有新鲜状态时节流跳过
onShow(() => {
  rolloutStore.refreshInBackground()
})

function retry() {
  rolloutStore.refreshInBackground({ force: true })
}

function openPreviewChannel() {
  uni.redirectTo({ url: PREVIEW_CHANNEL_PAGE })
}

function leavePage() {
  if (getCurrentPages().length > 1)
    uni.navigateBack()
  else
    uni.redirectTo({ url: PREVIEW_CHANNEL_PAGE })
}

/** 附在体验反馈上的客户端环境，不含个人信息；开发版、体验版没有版本号 */
function getClientInfo(): FeedbackClientInfo {
  const info: FeedbackClientInfo = { platform: 'mp-weixin' }
  try {
    const { envVersion, version } = uni.getAccountInfoSync().miniProgram
    info.env_version = envVersion
    if (version)
      info.app_version = version
  }
  catch (error) {
    console.warn('读取小程序版本信息失败:', error)
  }
  return info
}

function validate(): boolean {
  let valid = true
  const trimmedTitle = title.value.trim()
  if (!trimmedTitle) {
    setFieldError('title', '请填写标题。', 'blank')
    valid = false
  }
  else if (trimmedTitle.length > TITLE_MAX_LENGTH) {
    setFieldError('title', `标题不能超过 ${TITLE_MAX_LENGTH} 个字。`, 'max_length')
    valid = false
  }
  const trimmedContent = content.value.trim()
  if (!trimmedContent) {
    setFieldError('content', '请填写反馈内容。', 'blank')
    valid = false
  }
  else if (trimmedContent.length > CONTENT_MAX_LENGTH) {
    setFieldError('content', `内容不能超过 ${CONTENT_MAX_LENGTH} 个字。`, 'max_length')
    valid = false
  }
  return valid
}

async function handleSubmit() {
  const routing = feedback.value
  if (!routing || !featureKey.value || submitting.value || submitted.value)
    return
  clearFieldErrors()
  if (!validate())
    return

  submitting.value = true
  try {
    const payload: FeedbackCreate = {
      type: routing.type_name,
      otype: routing.org_type_name,
      org: routing.org_name,
      title: title.value.trim(),
      content: content.value.trim(),
      post_type: 'directly_submit',
      publisher_public: publisherPublic.value,
      feature_key: featureKey.value,
      client_info: getClientInfo(),
    }
    await createFeedback(payload)
    submitted.value = true
    showMessage('反馈已提交，谢谢你！', 'success')
    setTimeout(leavePage, 1500)
  }
  catch (error) {
    const requestError = toRequestError(error)
    // 校验错误显示在表单里；网络、权限、服务器等其他失败提示一次
    handleApiException(requestError, { showToast: Object.keys(requestError.errors).length === 0 })
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <uv-toast ref="toastRef" />
  <view class="min-h-screen bg-gray-50 px-4 pb-10 pt-4">
    <view v-if="!featureKey" class="rounded-2xl bg-white px-6 py-12 text-center shadow-sm">
      <view class="i-carbon-warning-alt mb-3 text-5xl text-gray-300" />
      <text class="block text-base text-gray-800 font-medium">没有找到要反馈的功能</text>
      <text class="mt-2 block text-sm text-gray-500">请从体验通道重新进入。</text>
      <view class="mx-auto mt-6 w-40">
        <uv-button type="primary" shape="circle" plain text="去体验通道" @click="openPreviewChannel" />
      </view>
    </view>

    <view v-else-if="status === 'error'" class="rounded-2xl bg-white px-6 py-12 text-center shadow-sm">
      <view class="i-carbon-warning-alt mb-3 text-5xl text-gray-300" />
      <text class="block text-sm text-gray-600">{{ loadError }}</text>
      <view class="mx-auto mt-5 w-40">
        <uv-button type="primary" shape="circle" plain text="重试" @click="retry" />
      </view>
    </view>

    <view v-else-if="status === 'signed_out'" class="rounded-2xl bg-white px-6 py-12 text-center text-sm text-gray-500 shadow-sm">
      登录后才能提交体验反馈。
    </view>

    <view v-else-if="status === 'loading'" class="py-16 text-center">
      <uv-loading-icon mode="circle" text="加载中" />
    </view>

    <view v-else>
      <!-- 反馈的功能 -->
      <view class="rounded-2xl bg-white p-4 shadow-sm">
        <text class="block text-xs text-gray-500">反馈的功能</text>
        <text class="mt-1 block text-base text-gray-800 font-bold">{{ experiment?.name || featureKey }}</text>
        <text v-if="experiment?.description" class="mt-2 block text-sm text-gray-600 leading-6">{{ experiment.description }}</text>
        <text v-if="feedback" class="mt-3 block text-xs text-gray-400">反馈会发给{{ feedback.org_name }}</text>
      </view>

      <uv-alert
        v-if="!feedback"
        class="mt-4"
        type="warning"
        title="体验反馈暂未开放"
        description="现在还不能提交体验反馈，请稍后再来。"
      />
      <uv-alert
        v-if="otherErrorMessages.length > 0"
        class="mt-4"
        type="error"
        title="提交未通过"
        :description="otherErrorMessages.join('；')"
      />

      <view class="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <text class="mb-2 block text-sm text-gray-700 font-medium">标题</text>
        <input
          v-model="title"
          class="form-control form-control--input"
          :class="{ 'form-control--error': getFieldMessages('title').length > 0 }"
          :maxlength="TITLE_MAX_LENGTH"
          :disabled="formDisabled"
          placeholder="一句话说清楚，不超过 25 字"
        >
        <ApiFieldError :messages="getFieldMessages('title')" />

        <text class="mb-2 mt-4 block text-sm text-gray-700 font-medium">内容</text>
        <textarea
          v-model="content"
          class="form-control form-control--textarea"
          :class="{ 'form-control--error': getFieldMessages('content').length > 0 }"
          :maxlength="CONTENT_MAX_LENGTH"
          :disabled="formDisabled"
          placeholder="遇到了什么问题，或者有什么建议？"
        />
        <ApiFieldError :messages="getFieldMessages('content')" />
        <text class="mt-1 block text-right text-xs text-gray-400">{{ content.length }}/{{ CONTENT_MAX_LENGTH }}</text>

        <view class="mt-4 flex items-center justify-between">
          <view class="flex-1 pr-3">
            <text class="block text-sm text-gray-700">公开这条反馈</text>
            <text class="mt-1 block text-xs text-gray-400">公开后会展示在反馈公示栏，默认不公开</text>
          </view>
          <uv-switch v-model="publisherPublic" :disabled="formDisabled" />
        </view>
      </view>

      <view class="mt-6">
        <uv-button
          type="primary"
          shape="circle"
          text="提交反馈"
          :loading="submitting"
          :disabled="formDisabled"
          @click="handleSubmit"
        />
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.form-control {
  width: 100%;
  font-size: 28rpx;
  color: #1f2937;
  background: #f9fafb;
  border: 2rpx solid #e5e7eb;
  border-radius: 16rpx;
  box-sizing: border-box;
}

.form-control--input {
  height: 88rpx;
  padding: 0 24rpx;
}

.form-control--textarea {
  height: 280rpx;
  padding: 20rpx 24rpx;
}

.form-control--error {
  border-color: #f56c6c;
}
</style>
