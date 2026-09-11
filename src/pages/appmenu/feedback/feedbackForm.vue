<script lang="ts" setup>
import type { Feedback, FeedbackCreate, FeedbackType, OrganizationInfoResponse, PatchedFeedbackUpdate } from '@/api/types/feedback'
import type { UvToastInstance } from '@/hooks/useApiException'
import { nextTick, watch } from 'vue'
import {
  createFeedback,
  getFeedback,
  getFeedbackTypes,
  getOrganizationInfo,
  partialUpdateFeedback,
} from '@/api/feedback'
import FormField from '@/components/FormField.vue'
import PageState from '@/components/PageState.vue'
import { useApiException } from '@/hooks/useApiException'
import { tokens } from '@/style/tokens'

definePage({
  style: {
    navigationBarTitleText: '写反馈',
  },
})

interface PickerChangeEvent {
  detail: { value: string | number }
}

const TITLE_MAX = 30
const CONTENT_MAX = 500

// 路由参数：草稿 id（编辑模式）；aid + lockedTitle（申诉模式，标题锁定）
const draftId = ref('')
const appealAid = ref(0)
const isAppealMode = computed(() => appealAid.value > 0)

// 初始化（反馈类型 + 组织信息 + 草稿）
const initializing = ref(true)
const initError = ref('')
const ready = computed(() => !initializing.value && !initError.value)

// 表单状态
const formTypeId = ref<string | number>('')
const formTitle = ref('')
const formContent = ref('')
const formPublisherPublic = ref(true)
const formOrgType = ref('')
const formOrg = ref('')
const submitting = ref<'draft' | 'submit' | null>(null)

const toastRef = ref<UvToastInstance | null>(null)
const {
  clearFieldError,
  clearFieldErrors,
  getFieldMessages,
  handleApiException,
  setFieldError,
  showMessage,
} = useApiException(toastRef)

const nonFieldErrors = computed(() => getFieldMessages('non_field_errors'))

const feedbackTypes = ref<FeedbackType[]>([])
const organizationInfo = ref<OrganizationInfoResponse | null>(null)

const orgTypeOptions = computed(() => {
  if (!organizationInfo.value)
    return []
  return organizationInfo.value.org_types.map(ot => ({ value: ot.otype_name, label: ot.otype_name }))
})

const orgByType = computed(() => {
  const result: Record<string, { value: string, label: string }[]> = {}
  const mapping = organizationInfo.value?.org_type_to_orgs ?? {}
  Object.keys(mapping).forEach((orgTypeName) => {
    result[orgTypeName] = mapping[orgTypeName].map(name => ({ value: name, label: name }))
  })
  return result
})

const feedbackTypeToOrg = computed(() => organizationInfo.value?.feedback_type_mappings ?? {})
const orgOptions = computed(() => orgByType.value[formOrgType.value] ?? [])

function hasTypeId(value: string | number) {
  // 允许 id 为 0，只排除 null / undefined / 空字符串
  return value !== null && value !== undefined && value !== ''
}

const selectedType = computed(() => feedbackTypes.value.find(t => t.id === formTypeId.value) ?? null)

const feedbackTypeIndex = computed(() => {
  const idx = feedbackTypes.value.findIndex(t => t.id === formTypeId.value)
  return idx >= 0 ? idx : 0
})
const orgTypeIndex = computed(() => {
  const idx = orgTypeOptions.value.findIndex(o => o.value === formOrgType.value)
  return idx >= 0 ? idx : 0
})
const orgIndex = computed(() => {
  const idx = orgOptions.value.findIndex(o => o.value === formOrg.value)
  return idx >= 0 ? idx : 0
})

watch(orgOptions, (options) => {
  const has = options.some(o => o.value === formOrg.value)
  if (options.length && !has)
    formOrg.value = options[0]?.value ?? ''
}, { immediate: true })

// 反馈类型变化时联动接收小组类型与接收小组
watch(formTypeId, (typeId) => {
  clearFieldError('type')
  if (!hasTypeId(typeId))
    return
  const feedbackType = feedbackTypes.value.find(t => t.id === typeId)
  if (!feedbackType)
    return
  const mapping = feedbackTypeToOrg.value[feedbackType.name]
  if (!mapping?.org_type_name)
    return
  formOrgType.value = mapping.org_type_name
  nextTick(() => {
    if (mapping.org_name && orgOptions.value.some(o => o.value === mapping.org_name))
      formOrg.value = mapping.org_name
    else if (!mapping.org_name)
      formOrg.value = ''
  })
})

watch(formTitle, () => clearFieldError('title'))
watch(formContent, () => clearFieldError('content'))
watch(formOrgType, () => clearFieldError('otype'))
watch(formOrg, () => clearFieldError('org'))

async function loadTypes() {
  const res = await getFeedbackTypes()
  feedbackTypes.value = res ?? []
  if (feedbackTypes.value.length && !hasTypeId(formTypeId.value))
    formTypeId.value = feedbackTypes.value[0].id
}

async function loadOrganizationInfo() {
  const res = await getOrganizationInfo()
  if (!res || typeof res !== 'object')
    throw new Error('组织信息格式错误')
  organizationInfo.value = {
    org_types: Array.isArray(res.org_types) ? res.org_types : [],
    organizations: Array.isArray(res.organizations) ? res.organizations : [],
    org_type_to_orgs: res.org_type_to_orgs && typeof res.org_type_to_orgs === 'object' ? res.org_type_to_orgs : {},
    feedback_type_mappings: res.feedback_type_mappings && typeof res.feedback_type_mappings === 'object' ? res.feedback_type_mappings : {},
  }
}

async function applyDefaultOrg() {
  const orgTypes = organizationInfo.value?.org_types ?? []
  if (!orgTypes.length)
    return
  formOrgType.value = orgTypes[0].otype_name
  await nextTick()
  formOrg.value = orgOptions.value[0]?.value ?? ''
}

async function initFormData() {
  if (draftId.value) {
    const draft = await getFeedback(draftId.value)
    formTitle.value = draft.title || ''
    formContent.value = draft.content || ''
    formPublisherPublic.value = draft.publisher_public ?? true

    const typeName = draft.type_name || draft.feedback_type_display
    const type = typeName ? feedbackTypes.value.find(t => t.name === typeName) : undefined
    if (type)
      formTypeId.value = type.id
    else if (feedbackTypes.value.length)
      formTypeId.value = feedbackTypes.value[0].id

    if (draft.org_type_name) {
      formOrgType.value = draft.org_type_name
      await nextTick()
      if (draft.org_name && orgOptions.value.some(o => o.value === draft.org_name))
        formOrg.value = draft.org_name
    }
    else {
      await applyDefaultOrg()
    }
    return
  }

  formTitle.value = ''
  formContent.value = ''
  formPublisherPublic.value = true
  if (isAppealMode.value) {
    formTitle.value = `地下室预约申诉（${appealAid.value}）`
    formContent.value = `[预约编号：${appealAid.value}]请不要修改，方便管理老师查询。`
  }
  await applyDefaultOrg()
  if (!hasTypeId(formTypeId.value) && feedbackTypes.value.length)
    formTypeId.value = feedbackTypes.value[0].id
}

async function initialize() {
  initializing.value = true
  initError.value = ''
  try {
    await Promise.all([loadTypes(), loadOrganizationInfo()])
    await initFormData()
  }
  catch (e) {
    console.error('初始化反馈表单失败', e)
    initError.value = handleApiException(e, { showToast: false }).message
  }
  finally {
    initializing.value = false
  }
}

function handleFeedbackTypeChange(e: PickerChangeEvent) {
  const picked = feedbackTypes.value[Number(e.detail.value)]
  if (picked && picked.id !== undefined)
    formTypeId.value = picked.id
}

function handleOrgTypeChange(e: PickerChangeEvent) {
  formOrgType.value = orgTypeOptions.value[Number(e.detail.value)]?.value ?? ''
}

function handleOrgChange(e: PickerChangeEvent) {
  formOrg.value = orgOptions.value[Number(e.detail.value)]?.value ?? ''
}

function goBackAfterSuccess() {
  setTimeout(() => {
    uni.navigateBack({
      fail: () => uni.reLaunch({ url: '/pages/appmenu/appmenu' }),
    })
  }, 600)
}

async function submitFeedback(asDraft: boolean) {
  if (!ready.value || submitting.value)
    return
  clearFieldErrors()

  const title = formTitle.value.trim()
  const body = formContent.value.trim()
  // 本地校验只走字段内联错误，不叠加 toast
  let valid = true
  if (!hasTypeId(formTypeId.value) || !selectedType.value) {
    setFieldError('type', '请选择反馈类型', 'required')
    valid = false
  }
  if (!asDraft && !body) {
    setFieldError('content', '反馈内容不能为空', 'blank')
    valid = false
  }
  if (title.length > TITLE_MAX) {
    setFieldError('title', `标题不能超过 ${TITLE_MAX} 字`, 'max_length')
    valid = false
  }
  if (!valid || !selectedType.value)
    return

  const finalTitle = title || (asDraft ? '(草稿)' : '')
  const finalContent = body || (asDraft ? '(草稿)' : '')
  const otype = formOrgType.value.trim() || undefined
  const org = formOrg.value.trim() || undefined
  // 后端按类型名称匹配反馈类型
  const typeValue = selectedType.value.name

  submitting.value = asDraft ? 'draft' : 'submit'
  try {
    let result: Feedback
    if (draftId.value) {
      const payload: PatchedFeedbackUpdate = {
        type: typeValue,
        title: finalTitle,
        content: finalContent,
        otype,
        org,
        publisher_public: formPublisherPublic.value,
        post_type: asDraft ? 'modify' : 'submit_draft',
      }
      result = await partialUpdateFeedback(draftId.value, payload)
    }
    else {
      const payload: FeedbackCreate = {
        type: typeValue,
        title: finalTitle,
        content: finalContent,
        post_type: asDraft ? 'save' : 'directly_submit',
        publisher_public: formPublisherPublic.value,
      }
      // 接收小组类型与接收小组：保存草稿时可为空，直接提交时由后端校验
      if (otype)
        payload.otype = otype
      if (org)
        payload.org = org
      result = await createFeedback(payload)
    }

    if (asDraft && result.issue_status !== 0) {
      console.error('保存草稿后 issue_status 异常:', result.issue_status)
      showMessage(`草稿保存失败（状态异常：${result.issue_status_display || result.issue_status}）`, 'error')
      return
    }
    if (!asDraft && result.issue_status !== 1)
      console.error('提交反馈后 issue_status 异常:', result.issue_status)

    showMessage(asDraft ? '草稿已保存' : '已提交', 'success')
    goBackAfterSuccess()
  }
  catch (e) {
    console.error('提交反馈失败', e)
    handleApiException(e)
  }
  finally {
    submitting.value = null
  }
}

onLoad((options) => {
  draftId.value = options?.id ?? ''
  const aidValue = Number(options?.aid)
  if (options?.lockedTitle === '1' && Number.isInteger(aidValue) && aidValue > 0)
    appealAid.value = aidValue
  void initialize()
})
</script>

<template>
  <view class="yp-page px-4 py-3">
    <uv-toast ref="toastRef" />
    <PageState :loading="initializing" :error="initError" @retry="initialize">
      <uv-alert
        v-if="nonFieldErrors.length"
        type="error"
        title="提交未通过"
        :description="nonFieldErrors.join('；')"
      />

      <view class="yp-card-flat" :class="{ 'mt-3': nonFieldErrors.length }">
        <FormField label="反馈类型" required :messages="getFieldMessages('type')">
          <picker
            :value="feedbackTypeIndex"
            :range="feedbackTypes"
            range-key="name"
            @change="handleFeedbackTypeChange"
          >
            <view class="yp-input flex items-center justify-between gap-2">
              <text class="truncate" :class="selectedType ? 'text-fg-1' : 'text-fg-3'">{{ selectedType?.name || '请选择反馈类型' }}</text>
              <view class="i-carbon-chevron-down shrink-0 text-fg-3" />
            </view>
          </picker>
        </FormField>
        <view class="yp-divider" />

        <FormField label="反馈标题" :hint="isAppealMode ? '申诉标题由系统生成' : `不超过 ${TITLE_MAX} 字`" :messages="getFieldMessages('title')">
          <input
            v-model="formTitle"
            class="yp-input h-88rpx"
            :class="{ 'text-fg-3': isAppealMode }"
            placeholder="一句话概括你的反馈"
            placeholder-class="text-fg-3"
            :maxlength="TITLE_MAX"
            :disabled="isAppealMode"
          >
        </FormField>
        <view class="yp-divider" />

        <FormField label="接收小组类型" :messages="getFieldMessages('otype')">
          <picker
            :value="orgTypeIndex"
            :range="orgTypeOptions"
            range-key="label"
            @change="handleOrgTypeChange"
          >
            <view class="yp-input flex items-center justify-between gap-2">
              <text class="truncate" :class="formOrgType ? 'text-fg-1' : 'text-fg-3'">{{ formOrgType || '请选择' }}</text>
              <view class="i-carbon-chevron-down shrink-0 text-fg-3" />
            </view>
          </picker>
        </FormField>
        <view class="yp-divider" />

        <FormField label="接收小组" :messages="getFieldMessages('org')">
          <picker
            :value="orgIndex"
            :range="orgOptions"
            range-key="label"
            @change="handleOrgChange"
          >
            <view class="yp-input flex items-center justify-between gap-2">
              <text class="truncate" :class="formOrg ? 'text-fg-1' : 'text-fg-3'">{{ formOrg || '请选择' }}</text>
              <view class="i-carbon-chevron-down shrink-0 text-fg-3" />
            </view>
          </picker>
        </FormField>
        <view class="yp-divider" />

        <FormField label="反馈内容" required hint="请文明理性发言" :messages="getFieldMessages('content')">
          <textarea
            v-model="formContent"
            class="yp-input h-240rpx py-3"
            placeholder="描述你的问题或建议"
            placeholder-class="text-fg-3"
            :maxlength="CONTENT_MAX"
          />
          <text class="mt-1 block text-right text-xs text-fg-3">{{ formContent.length }} / {{ CONTENT_MAX }}</text>
        </FormField>
        <view class="yp-divider" />

        <view class="flex items-center justify-between gap-3 py-3">
          <view class="min-w-0 flex-1">
            <text class="block text-sm text-fg-2">公开反馈</text>
            <text class="mt-1 block text-xs text-fg-3">展示在公示栏，为后来者提供帮助</text>
          </view>
          <uv-switch v-model="formPublisherPublic" size="22" :active-color="tokens.primary" />
        </view>
      </view>

      <!-- 固定底栏占位 -->
      <view class="h-160rpx pb-safe" />
    </PageState>

    <view v-if="ready" class="fixed bottom-0 left-0 right-0 z-10 bg-card shadow-float pb-safe">
      <view class="flex gap-3 px-4 py-3">
        <view
          class="btn-outline flex-1"
          :class="{ 'opacity-50': submitting }"
          @click="submitFeedback(true)"
        >
          {{ submitting === 'draft' ? '保存中…' : '保存草稿' }}
        </view>
        <view
          class="btn-primary flex-1"
          :class="{ 'opacity-50': submitting }"
          @click="submitFeedback(false)"
        >
          {{ submitting === 'submit' ? '提交中…' : '提交反馈' }}
        </view>
      </view>
    </view>
  </view>
</template>
