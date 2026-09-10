<script lang="ts" setup>
import type { Feedback, SolveStatus } from '@/api/types/feedback'
import type { StatusTagType } from '@/components/StatusTag.vue'
import type { UvToastInstance } from '@/hooks/useApiException'
import { storeToRefs } from 'pinia'
import {
  deleteFeedback,
  listDoneFeedback,
  listFeedback,
  listInProgressFeedback,
  listPublicFeedback,
} from '@/api/feedback'
import PageState from '@/components/PageState.vue'
import StatusTag from '@/components/StatusTag.vue'
import { useApiException } from '@/hooks/useApiException'
import { useConfirm } from '@/hooks/useConfirm'
import { useUserStore } from '@/store/user'
import { tokens } from '@/style/tokens'
import { formatRelativeTime } from '@/utils/format'
import { openWebview } from '@/utils/webview'

definePage({
  style: {
    navigationBarTitleText: '反馈中心',
    enablePullDownRefresh: true,
  },
})

type MyTab = 'draft' | 'inProgress' | 'done'

const toastRef = ref<UvToastInstance | null>(null)
const { handleApiException, showMessage } = useApiException(toastRef)
const { confirm } = useConfirm()

// 公示栏：已结束且公开的反馈（所有用户）
const publicList = ref<Feedback[]>([])
const publicLoading = ref(true)
const publicLoaded = ref(false)
const publicError = ref('')

// 我的反馈：草稿箱 / 进行中 / 已结束
const myTab = ref<MyTab>('inProgress')
const myDraftList = ref<Feedback[]>([])
const myInProgressList = ref<Feedback[]>([])
const myDoneList = ref<Feedback[]>([])
const myLoading = ref(true)
const myLoaded = ref(false)
const myError = ref('')

// 从 query 获得的 aid：来自信用分记录的申诉
const aid = ref(0)
// 已处理过的 aid，用于防止从表单返回未提交时重复跳转
const handledAid = ref<number | null>(null)

// 小组账户不显示草稿箱
const { userInfo } = storeToRefs(useUserStore())
const showDraftTab = computed(() => !userInfo.value.is_org)

const myTabs = computed<{ name: string, key: MyTab }[]>(() => {
  const tabs: { name: string, key: MyTab }[] = [
    { name: '进行中', key: 'inProgress' },
    { name: '已结束', key: 'done' },
  ]
  return showDraftTab.value ? [{ name: '草稿箱', key: 'draft' }, ...tabs] : tabs
})
const myTabIndex = computed(() => Math.max(0, myTabs.value.findIndex(tab => tab.key === myTab.value)))

const myCurrentList = computed(() => {
  if (myTab.value === 'draft' && showDraftTab.value)
    return myDraftList.value
  if (myTab.value === 'done')
    return myDoneList.value
  return myInProgressList.value
})

const myEmptyText = computed(() => {
  if (myTab.value === 'draft' && showDraftTab.value)
    return '还没有反馈草稿'
  if (myTab.value === 'done')
    return '还没有已结束的反馈'
  return '还没有进行中的反馈'
})

/**
 * 状态说明：
 * - issue_status=0 草稿，=1 已发布
 * - solve_status=0 处理中，=1 已解决，=2 无法解决，=3 未标记（视为处理中）
 */
const SOLVE_STATUS: Record<SolveStatus, { text: string, type: StatusTagType }> = {
  0: { text: '处理中', type: 'processing' },
  1: { text: '已解决', type: 'success' },
  2: { text: '无法解决', type: 'default' },
  3: { text: '处理中', type: 'processing' },
}

function solveStatus(item: Feedback): { text: string, type: StatusTagType } {
  const meta = SOLVE_STATUS[item.solve_status] ?? { text: '未知状态', type: 'default' as const }
  return { type: meta.type, text: item.solve_status_display ?? meta.text }
}

// 列表项标题：无标题时取内容首行（≤ 20 字）
function cardTitle(item: Feedback): string {
  if (item.title)
    return item.title
  const content = item.content?.trim() || ''
  if (!content)
    return '（无标题）'
  const firstLine = content.split('\n')[0].trim()
  return firstLine.length > 20 ? `${firstLine.slice(0, 20)}…` : firstLine
}

function publicLabel(item: Feedback) {
  // publisher_public 缺省视为公开；只有明确为 false 才是不公开
  return item.publisher_public === false ? '不公开' : '公开'
}

function publishedMeta(item: Feedback) {
  const time = formatRelativeTime(item.feedback_time ?? item.modify_time ?? item.time)
  return [time, `反馈至 ${item.org_name || '—'}`, publicLabel(item)].filter(Boolean).join(' · ')
}

function draftMeta(item: Feedback) {
  const time = formatRelativeTime(item.modify_time ?? item.time)
  const type = item.feedback_type_display || item.type_name || ''
  return [type, `反馈至 ${item.org_name || '—'}`, time ? `${time} 保存` : ''].filter(Boolean).join(' · ')
}

/** 返回失败原因（供上层合并成一次提示），首屏失败则写入页内错误并返回 null。 */
async function loadPublic(): Promise<unknown> {
  const initial = !publicLoaded.value
  if (initial) {
    publicLoading.value = true
    publicError.value = ''
  }
  try {
    publicList.value = await listPublicFeedback({ ordering: '-feedback_time' })
    publicLoaded.value = true
    return null
  }
  catch (e) {
    console.error('加载公示栏失败', e)
    if (initial) {
      publicError.value = handleApiException(e, { showToast: false }).message
      return null
    }
    return e
  }
  finally {
    publicLoading.value = false
  }
}

async function loadMyFeedback(): Promise<unknown> {
  const initial = !myLoaded.value
  if (initial) {
    myLoading.value = true
    myError.value = ''
  }
  try {
    const [draftRes, inProgressRes, doneRes] = await Promise.all([
      listFeedback({ issue_status: 0, ordering: '-modify_time' }),
      listInProgressFeedback({ ordering: '-feedback_time' }),
      listDoneFeedback({ ordering: '-feedback_time' }),
    ])
    myDraftList.value = draftRes
    myInProgressList.value = inProgressRes
    myDoneList.value = doneRes
    myLoaded.value = true
    return null
  }
  catch (e) {
    console.error('加载我的反馈失败', e)
    if (initial) {
      myError.value = handleApiException(e, { showToast: false }).message
      return null
    }
    return e
  }
  finally {
    myLoading.value = false
  }
}

/** 申诉逻辑：根据 aid 查找已有反馈或跳转表单，避免来回跳转 */
function handleAidIfNeeded() {
  const aidVal = aid.value
  if (!aidVal)
    return

  const expectedTitle = `地下室预约申诉（${aidVal}）`
  const allLists = [...myDraftList.value, ...myInProgressList.value, ...myDoneList.value]
  const found = allLists.find(item => cardTitle(item) === expectedTitle)

  if (found) {
    handledAid.value = aidVal
    if (found.issue_status === 0)
      uni.navigateTo({ url: `/pages/appmenu/feedback/feedbackForm?id=${found.id}` })
    else
      showMessage('你的申诉已经发布，请等待处理', 'warning')
    return
  }

  if (handledAid.value === aidVal)
    return
  handledAid.value = aidVal
  uni.navigateTo({ url: `/pages/appmenu/feedback/feedbackForm?aid=${aidVal}&lockedTitle=1` })
}

async function loadAndRefresh() {
  const [publicFailure, myFailure] = await Promise.all([loadPublic(), loadMyFeedback()])
  // 已有数据时的刷新失败：保留数据，只提示一次
  const failure = publicFailure ?? myFailure
  if (failure)
    handleApiException(failure)
  handleAidIfNeeded()
}

function onMyTabChange(item: { index: number }) {
  myTab.value = myTabs.value[item.index]?.key ?? 'inProgress'
}

function goCreate() {
  uni.navigateTo({ url: '/pages/appmenu/feedback/feedbackForm' })
}

function goEditDraft(draft: Feedback) {
  uni.navigateTo({ url: `/pages/appmenu/feedback/feedbackForm?id=${draft.id}` })
}

async function handleDeleteDraft(draft: Feedback) {
  const ok = await confirm({
    title: '删除草稿',
    content: `删除「${cardTitle(draft)}」后不可恢复。`,
    confirmText: '删除',
    cancelText: '保留',
    danger: true,
  })
  if (!ok)
    return
  try {
    await deleteFeedback(draft.id)
    showMessage('已删除', 'success')
    const failure = await loadMyFeedback()
    if (failure)
      handleApiException(failure)
  }
  catch (e) {
    console.error('删除草稿失败', e)
    handleApiException(e)
  }
}

// 草稿跳转编辑，已发布的打开网页详情
function onCardClick(item: Feedback) {
  if (item.issue_status === 0)
    goEditDraft(item)
  else
    void openWebview({ uri: `/viewFeedback/${item.id}` })
}

onLoad((options) => {
  const value = Number(options?.aid)
  if (Number.isInteger(value) && value > 0)
    aid.value = value
})

// 首次显示及从表单页返回时刷新
onShow(() => {
  void loadAndRefresh()
})

onPullDownRefresh(async () => {
  try {
    await loadAndRefresh()
  }
  finally {
    uni.stopPullDownRefresh()
  }
})
</script>

<template>
  <view class="yp-page px-4 py-3">
    <uv-toast ref="toastRef" />

    <!-- 说明 + 写反馈 -->
    <view class="flex items-center justify-between gap-3 yp-card-flat">
      <view class="min-w-0 flex-1">
        <text class="block text-sm text-fg-1">有困惑、建议或想对组织说的话，都可以在这里反馈。</text>
        <text class="mt-1 block text-xs text-fg-3">反馈对组织匿名；选择公开后可帮助后来者。</text>
      </view>
      <view class="btn-primary btn-sm shrink-0" @click="goCreate">
        写反馈
      </view>
    </view>

    <!-- 公示栏 -->
    <view class="mt-6">
      <text class="block px-1 yp-section-title">公示栏</text>
      <view class="mt-3">
        <PageState
          :loading="publicLoading"
          :error="publicError"
          :empty="publicList.length === 0"
          empty-text="还没有公开的反馈"
          empty-icon="i-carbon-chat"
          compact
          @retry="loadPublic"
        >
          <view
            v-for="(item, idx) in publicList"
            :key="item.id"
            class="yp-card-flat active:bg-fill"
            :class="{ 'mt-3': idx > 0 }"
            @click="onCardClick(item)"
          >
            <view class="flex items-start justify-between gap-2">
              <text class="line-clamp-1 flex-1 text-base text-fg-1 font-medium">{{ cardTitle(item) }}</text>
              <StatusTag :type="solveStatus(item).type" :text="solveStatus(item).text" />
            </view>
            <text class="mt-1 block text-xs text-fg-3">{{ publishedMeta(item) }}</text>
            <text class="line-clamp-2 mt-2 block text-sm text-fg-2">{{ item.content || '—' }}</text>
          </view>
        </PageState>
      </view>
    </view>

    <!-- 我的反馈 -->
    <view class="mt-6">
      <text class="block px-1 yp-section-title">我的反馈</text>
      <view class="mt-3 overflow-hidden rounded-lg bg-card">
        <uv-tabs
          :list="myTabs"
          :current="myTabIndex"
          :scrollable="false"
          :line-color="tokens.primary"
          :active-style="{ color: tokens.text1, fontWeight: 600 }"
          :inactive-style="{ color: tokens.text2 }"
          @change="onMyTabChange"
        />
      </view>
      <view class="mt-3">
        <PageState
          :loading="myLoading"
          :error="myError"
          :empty="myCurrentList.length === 0"
          :empty-text="myEmptyText"
          empty-icon="i-carbon-document-blank"
          compact
          @retry="loadMyFeedback"
        >
          <view
            v-for="(item, idx) in myCurrentList"
            :key="item.id"
            class="yp-card-flat active:bg-fill"
            :class="{ 'mt-3': idx > 0 }"
            @click="onCardClick(item)"
          >
            <view class="flex items-start justify-between gap-2">
              <text class="line-clamp-1 flex-1 text-base text-fg-1 font-medium">{{ cardTitle(item) }}</text>
              <StatusTag v-if="item.issue_status === 0" type="default" text="草稿" />
              <StatusTag v-else :type="solveStatus(item).type" :text="solveStatus(item).text" />
            </view>
            <text class="mt-1 block text-xs text-fg-3">{{ item.issue_status === 0 ? draftMeta(item) : publishedMeta(item) }}</text>
            <text class="line-clamp-2 mt-2 block text-sm text-fg-2">{{ item.content || '—' }}</text>
            <view v-if="item.issue_status === 0" class="mt-2 flex justify-end gap-2 border-t border-line-light pt-2">
              <view class="min-h-64rpx inline-flex items-center px-3 text-sm text-primary active:opacity-70" @click.stop="goEditDraft(item)">
                编辑
              </view>
              <view class="min-h-64rpx inline-flex items-center px-3 text-sm text-error active:opacity-70" @click.stop="handleDeleteDraft(item)">
                删除
              </view>
            </view>
          </view>
        </PageState>
      </view>
    </view>
  </view>
</template>
