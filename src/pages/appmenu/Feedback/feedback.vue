<script lang="ts" setup>
import type { Feedback, FeedbackType, SolveStatus } from '@/api/types/feedback'
import { onShow } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import {
  deleteFeedback,
  getFeedbackTypes,
  listDoneFeedback,
  listFeedback,
  listInProgressFeedback,
  listPublicFeedback,
} from '@/api/feedback'
import { useUserStore } from '@/store/user'
import { openWebview } from '@/utils/webview'

definePage({
  style: {
    navigationBarTitleText: '问答反馈中心',
    navigationBarBackgroundColor: '#1b55e2',
    navigationBarTextStyle: 'white',
  },
})

const feedbackTypes = ref<FeedbackType[]>([])
const list = ref<Feedback[]>([])
const listLoading = ref(false)

// 我的反馈：草稿箱 / 进行中 / 已结束
const myFeedbackTab = ref<'draft' | 'inProgress' | 'done'>('inProgress')
const myDraftList = ref<Feedback[]>([])
const myInProgressList = ref<Feedback[]>([])
const myDoneList = ref<Feedback[]>([])
const myListLoading = ref(false)

// 从query获得的aid信息，如果有，说明是准备申诉
const aid = ref<number>(0)
// 已处理过的 aid，用于防止从表单返回未提交时重复跳转（死锁）
const handledAidRef = ref<number | null>(null)

// 小组账户不显示草稿箱
const { userInfo } = storeToRefs(useUserStore())
const showDraftTab = computed(() => !userInfo.value.is_org)

/**
 * 状态说明：
 * - issue_status=0: 草稿
 * - issue_status=1: 已发布
 * - solve_status=0: 处理中（issue_status=1时自动变为0）
 * - solve_status=1: 已解决
 * - solve_status=2: 无法解决
 * - solve_status=3: 未标记（后端可能返回，视为处理中）
 *
 * 分类规则：
 * - 草稿箱：issue_status === 0
 * - 进行中：issue_status === 1 && (solve_status === 0 || solve_status === 3)
 * - 已结束：issue_status === 1 && (solve_status === 1 || solve_status === 2)
 * - 公示栏：issue_status === 1 && (solve_status === 1 || solve_status === 2) && publisher_public === true
 */

// 公示栏：只展示已结束且公开的反馈（所有用户的）
async function loadList() {
  try {
    listLoading.value = true
    // 使用新的公开反馈接口，获取所有用户的公开反馈
    // 后端已经过滤了：已发布 + 公开 + 已解决/无法解决
    const publicFeedbacks = await listPublicFeedback({
      ordering: '-feedback_time',
    })

    // 后端已经完成了所有过滤，前端直接使用即可
    list.value = publicFeedbacks

    // 调试：打印公示栏结果
    console.log('公示栏列表:', list.value.map(item => ({
      id: item.id,
      title: item.title,
      solve_status: item.solve_status,
      solve_status_display: item.solve_status_display,
      publisher_public: item.publisher_public,
    })))
    console.log('公示栏总数:', list.value.length)
  }
  catch (e) {
    console.error('加载公示栏失败', e)
    uni.showToast({ title: '加载失败', icon: 'none' })
  }
  finally {
    listLoading.value = false
  }
}

// 我的反馈：草稿箱、进行中、已结束（全部由后端负责分类计算）
async function loadMyFeedback() {
  try {
    myListLoading.value = true
    // 并行加载草稿、进行中、已结束的反馈（后端负责计算分类）
    const [draftRes, inProgressRes, doneRes] = await Promise.all([
      // 草稿：issue_status=草稿，由现有列表接口按状态过滤
      listFeedback({ issue_status: 0, ordering: '-modify_time' }),
      // 进行中：后端 /api/v2/feedback/in-progress/ 已经按规则过滤好
      listInProgressFeedback({ ordering: '-feedback_time' }),
      // 已结束：后端 /api/v2/feedback/done/ 已经按规则过滤好
      listDoneFeedback({ ordering: '-feedback_time' }),
    ])

    // 直接使用后端返回的数据，不再进行前端计算
    myDraftList.value = draftRes
    myInProgressList.value = inProgressRes
    myDoneList.value = doneRes
  }
  catch (e) {
    console.error('加载我的反馈失败', e)
    uni.showToast({ title: '加载失败', icon: 'none' })
  }
  finally {
    myListLoading.value = false
  }
}

/** 申诉逻辑：根据 aid 查找或跳转表单，避免死锁 */
function handleAidIfNeeded() {
  const aidVal = aid.value
  if (!aidVal)
    return

  const expectedTitle = `地下室预约申诉（${aidVal}）`
  const allLists = [...myDraftList.value, ...myInProgressList.value, ...myDoneList.value]
  const found = allLists.find(item => (item.title || cardTitle(item)) === expectedTitle)

  if (found) {
    handledAidRef.value = aidVal
    if (found.issue_status === 0) {
      // 草稿，跳转
      uni.navigateTo({ url: `/pages/appmenu/feedback/feedbackForm?id=${found.id}` })
    }
    else {
      // 已经发布了提示，这个填完表之后，按返回键还会跳转回来，为了防止死锁不能再跳转
      uni.showToast({ title: '您的申诉已经发布，请等待处理', icon: 'none' })
    }
    return
  }

  // 未找到：跳转表单新建。若已处理过（用户从表单返回未提交），则不再跳转，防止死锁
  if (handledAidRef.value === aidVal)
    return
  handledAidRef.value = aidVal
  uni.navigateTo({ url: `/pages/appmenu/feedback/feedbackForm?aid=${aidVal}&lockedTitle=1` })
}

async function loadAndRefresh() {
  await loadList()
  await loadMyFeedback()
  handleAidIfNeeded()
}

function setMyFeedbackTab(tab: 'draft' | 'inProgress' | 'done') {
  myFeedbackTab.value = tab
}

async function loadTypes() {
  try {
    const apiTypes = await getFeedbackTypes()
    if (apiTypes.length > 0) {
      feedbackTypes.value = apiTypes
    }
  }
  catch (e) {
    console.error('加载反馈类型失败', e)
  }
}

// 网页版日期格式：2024年5月17日 16:50 公开/不公开
function formatDatePublic(time: string | undefined, publisherPublic?: boolean) {
  // 如果 publisher_public 是 undefined 或 null，默认当作 true（公开）处理
  // 注意：false 值应该明确显示为"不公开"
  const isPublic = publisherPublic === false ? false : (publisherPublic ?? true)
  const publicText = isPublic ? '公开' : '不公开'
  if (!time)
    return `— ${publicText}`
  const d = new Date(time)
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}年${m}月${day}日 ${h}:${min} ${publicText}`
}

// 草稿保存时间格式：2026年2月4日 18:03 保存
function formatDateDraft(time: string | undefined) {
  if (!time)
    return '— 保存'
  const d = new Date(time)
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}年${m}月${day}日 ${h}:${min} 保存`
}

/**
 * 解决状态文案与样式
 * solve_status=0: 处理中
 * solve_status=1: 已解决（绿色）
 * solve_status=2: 无法解决（蓝色）
 * solve_status=3: 未标记（视为处理中）
 */
function solveStatusInfo(status: SolveStatus): { text: string, class: string } {
  switch (status) {
    case 0:
      return { text: '处理中', class: 'badge-warning' }
    case 1:
      return { text: '已解决', class: 'badge-success' }
    case 2:
      return { text: '无法解决', class: 'badge-primary' }
    case 3:
      return { text: '处理中', class: 'badge-warning' } // 未标记视为处理中
    default:
      return { text: '未知状态', class: 'badge-secondary' }
  }
}

// 列表项标题：取内容前 20 字或首行
function cardTitle(item: Feedback): string {
  const c = item.content?.trim() || ''
  if (!c)
    return '（无标题）'
  const firstLine = c.split('\n')[0].trim()
  return firstLine.length > 20 ? `${firstLine.slice(0, 20)}…` : firstLine
}

// 新建反馈
function goCreate() {
  uni.navigateTo({ url: '/pages/appmenu/feedback/feedbackForm' })
}

// 编辑草稿
function goEditDraft(draft: Feedback) {
  uni.navigateTo({ url: `/pages/appmenu/feedback/feedbackForm?id=${draft.id}` })
}

// 删除草稿
async function handleDeleteDraft(draft: Feedback, e?: Event) {
  if (e) {
    e.stopPropagation() // 阻止事件冒泡，避免触发卡片点击
  }

  uni.showModal({
    title: '确认删除',
    content: '确认要删除反馈草稿吗？',
    success: async (res) => {
      if (res.confirm) {
        try {
          await deleteFeedback(draft.id)
          uni.showToast({ title: '删除成功', icon: 'success' })
          await loadMyFeedback() // 刷新列表
        }
        catch (e: any) {
          console.error('删除草稿失败', e)
        }
      }
    },
  })
}

// 点击反馈卡片：草稿跳转编辑，已发布的跳转详情
function onCardClick(item: Feedback) {
  if (item.issue_status === 0) {
    // 草稿：跳转编辑
    goEditDraft(item)
  }
  else {
    // 已发布：跳转详情页
    void openWebview({ uri: `/viewFeedback/${item.id}` })
  }
}

onLoad((options: Record<string, string> = {}) => {
  if (options.aid) {
    aid.value = Number(options.aid)
  }
})

onMounted(() => {
  loadAndRefresh()
})

// 页面显示时刷新列表（从表单页面返回时）
onShow(() => {
  loadAndRefresh()
})
</script>

<template>
  <view class="feedback-page min-h-screen bg-[#f8f9fa] pb-10">
    <!-- 主界面：与网页版一致的布局 -->
    <view class="layout-top-spacing">
      <!-- 左侧欢迎区 -->
      <view class="bio layout-spacing px-4 pt-4">
        <view class="widget-content relative rounded-lg bg-white p-4 shadow-sm">
          <!-- 装饰边框：右侧竖线、底部横线 -->
          <view
            class="border-right absolute right-0 border-l border-[#d3d3d3]"
            style="top: 16%; bottom: 20%;"
          />
          <view
            class="border-bottom absolute bottom-0 left-[20%] right-[20%] border-b border-[#d3d3d3]"
          />
          <view class="pricing-header relative px-1 py-2">
            <view class="mb-4 flex items-center justify-center">
              <text class="text-lg text-[var(--text-main)] font-semibold">问答反馈中心</text>
              <view
                class="ml-2 h-8 w-8 flex items-center justify-center text-[#1b55e2]"
                hover-class="none"
                @click="goCreate"
              >
                <text class="i-carbon-add-alt text-2xl" />
              </view>
            </view>
            <text class="text-indent-2em block text-sm text-[#424344] leading-relaxed">
              欢迎你来到这里。这是学生权益诉求的集中地，也是信息交流的便捷平台，在这里我们用共同关心搭建共同生活的家园。
            </text>
            <text class="text-indent-2em mt-3 block text-sm text-[#424344] leading-relaxed">
              如果你在学习与生活中产生自己无法解答的困惑；对改善公共空间环境、改进学生组织工作有好的建议；或是有其他想要和组织迫切交流的观点；都可以点击上方的「+」向组织反馈！
            </text>
            <text class="text-indent-2em mt-3 block text-sm text-[#424344] leading-relaxed">
              您的反馈至始至终对组织匿名；欢迎公开您的反馈，为后来者提供帮助！
            </text>
          </view>
        </view>
      </view>

      <!-- 右侧：留言公开（公示栏） -->
      <view class="layout-spacing mt-4 px-4">
        <view class="bio-skill-box overflow-x-hidden overflow-y-auto rounded-lg bg-white shadow-sm">
          <view v-if="listLoading" class="py-12 text-center text-[#424344]">
            加载中...
          </view>
          <view v-else-if="list.length === 0" class="py-12 text-center text-[#424344]">
            暂无公开反馈
          </view>
          <view v-else class="public-feedback row px-2 pb-4">
            <view
              v-for="item in list"
              :key="item.id"
              class="b-skills mb-4 border border-gray-100 rounded-lg bg-gray-50/50 p-4"
              hover-class="none"
              @click="onCardClick(item)"
            >
              <view class="d-flex justify-content mb-2">
                <view class="min-width-0 flex-1">
                  <view class="flex flex-wrap items-center gap-2">
                    <text class="line-clamp-1 text-base text-[var(--text-main)] font-semibold">
                      {{ item.title || cardTitle(item) }}
                    </text>
                    <view
                      class="badge badge-pill rounded-full px-2 py-0.5 text-xs font-medium"
                      :class="solveStatusInfo(item.solve_status).class"
                    >
                      {{ item.solve_status_display ?? solveStatusInfo(item.solve_status).text }}
                    </view>
                  </view>
                </view>
              </view>
              <view class="flex items-start text-sm text-[#424344]">
                <text class="i-carbon-share mr-1 mt-0.5 shrink-0 text-base" />
                <text class="ml-1">反馈至 {{ item.org_name || '—' }}</text>
              </view>
              <view class="mt-1 flex items-start text-sm text-[#424344]">
                <text class="i-carbon-notification mr-1 mt-0.5 shrink-0 text-base" />
                <text class="ml-1">{{ formatDatePublic(item.feedback_time ?? item.modify_time ?? item.time, item.publisher_public) }}</text>
              </view>
              <view class="feedback-content mt-1 flex items-start text-sm text-[#424344]">
                <text class="i-carbon-email mr-1 mt-0.5 shrink-0 text-base" />
                <text class="line-clamp-2 ml-1 flex-1">{{ item.content || '—' }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- 我的反馈：草稿箱 / 进行中 / 已结束（放在最下面） -->
      <view class="bio layout-spacing mb-4 mt-4 px-4">
        <view class="widget-content widget-content-area rounded-lg bg-white p-4 shadow-sm">
          <view class="mb-4">
            <text class="text-lg text-[var(--text-main)] font-semibold">我的反馈</text>
          </view>
          <view class="nav-tabs nav-tabs-solid flex border border-gray-200 rounded-lg bg-gray-50">
            <view
              v-if="showDraftTab"
              class="nav-item flex-1 text-center"
              :class="{ 'nav-link-active': myFeedbackTab === 'draft' }"
              hover-class="none"
              @click="setMyFeedbackTab('draft')"
            >
              <text class="block py-3 text-sm font-medium" :class="myFeedbackTab === 'draft' ? 'text-[#1b55e2]' : 'text-[#424344]'">
                <text class="i-carbon-email mr-1" />草稿箱
              </text>
            </view>
            <view
              class="nav-item flex-1 text-center"
              :class="{ 'nav-link-active': myFeedbackTab === 'inProgress' }"
              hover-class="none"
              @click="setMyFeedbackTab('inProgress')"
            >
              <text class="block py-3 text-sm font-medium" :class="myFeedbackTab === 'inProgress' ? 'text-[#1b55e2]' : 'text-[#424344]'">
                <text class="i-carbon-email mr-1" />进行中
              </text>
            </view>
            <view
              class="nav-item flex-1 text-center"
              :class="{ 'nav-link-active': myFeedbackTab === 'done' }"
              hover-class="none"
              @click="setMyFeedbackTab('done')"
            >
              <text class="block py-3 text-sm font-medium" :class="myFeedbackTab === 'done' ? 'text-[#1b55e2]' : 'text-[#424344]'">
                <text class="i-carbon-email mr-1" />已结束
              </text>
            </view>
          </view>
          <view class="tab-content mt-4">
            <!-- 草稿箱（小组账户不显示） -->
            <view v-show="showDraftTab && myFeedbackTab === 'draft'" class="tab-pane">
              <view v-if="myListLoading" class="py-10 text-center text-sm text-[#424344]">
                加载中...
              </view>
              <view v-else-if="myDraftList.length === 0" class="py-10 text-center text-sm text-[#424344]">
                您没有反馈草稿。
              </view>
              <view v-else class="bio-skill-box">
                <view class="row px-2 pb-4">
                  <view
                    v-for="item in myDraftList"
                    :key="item.id"
                    class="col-12 mb-4"
                  >
                    <view class="b-skills border border-gray-100 rounded-lg bg-gray-50/50 p-4" hover-class="none" @click="goEditDraft(item)">
                      <!-- 标题和操作按钮 -->
                      <view class="mb-2 flex items-start justify-between">
                        <view class="min-width-0 flex-1 pr-2">
                          <view class="flex flex-wrap items-center gap-2">
                            <text class="line-clamp-1 text-base text-[var(--text-main)] font-semibold">
                              {{ item.title || cardTitle(item) }}
                            </text>
                            <view class="badge badge-pill badge-success rounded-full px-2 py-0.5 text-xs font-medium">
                              草稿
                            </view>
                          </view>
                        </view>
                        <view class="flex shrink-0 items-center gap-2" role="group">
                          <!-- 编辑按钮 -->
                          <view
                            class="cursor-pointer text-[#1b55e2]"
                            hover-class="none"
                            @click.stop="goEditDraft(item)"
                          >
                            <text class="i-carbon-edit text-lg" />
                          </view>
                          <!-- 删除按钮 -->
                          <view
                            class="cursor-pointer text-[#dc3545]"
                            hover-class="none"
                            @click.stop="handleDeleteDraft(item, $event)"
                          >
                            <text class="i-carbon-trash-can text-lg" />
                          </view>
                        </view>
                      </view>

                      <!-- 反馈类型 -->
                      <view class="mt-2 flex items-start text-sm text-[#424344]">
                        <text class="i-carbon-bookmark mr-1 mt-0.5 shrink-0 text-base" />
                        <text class="ml-1">{{ item.feedback_type_display || item.type_name || '—' }}</text>
                      </view>

                      <!-- 反馈至 -->
                      <view class="mt-1 flex items-start text-sm text-[#424344]">
                        <text class="i-carbon-share mr-1 mt-0.5 shrink-0 text-base" />
                        <text class="ml-1">反馈至 {{ item.org_name || '—' }}</text>
                      </view>

                      <!-- 保存时间 -->
                      <view class="mt-1 flex items-start text-sm text-[#424344]">
                        <text class="i-carbon-notification mr-1 mt-0.5 shrink-0 text-base" />
                        <text class="ml-1">{{ formatDateDraft(item.modify_time ?? item.time) }}</text>
                      </view>

                      <!-- 内容预览 -->
                      <view class="feedback-content mt-1 flex items-start text-sm text-[#424344]">
                        <text class="i-carbon-email mr-1 mt-0.5 shrink-0 text-base" />
                        <text class="line-clamp-2 ml-1 flex-1">{{ item.content || '—' }}</text>
                      </view>
                    </view>
                  </view>
                </view>
              </view>
            </view>
            <!-- 进行中（小组账户无草稿时也显示） -->
            <view v-show="myFeedbackTab === 'inProgress' || (myFeedbackTab === 'draft' && !showDraftTab)" class="tab-pane">
              <view v-if="myListLoading" class="py-10 text-center text-sm text-[#424344]">
                加载中...
              </view>
              <view v-else-if="myInProgressList.length === 0" class="py-10 text-center text-sm text-[#424344]">
                您没有在进行中的反馈。
              </view>
              <view v-else class="bio-skill-box">
                <view class="row px-2 pb-4">
                  <view
                    v-for="item in myInProgressList"
                    :key="item.id"
                    class="col-12 mb-4"
                  >
                    <view class="b-skills border border-gray-100 rounded-lg bg-gray-50/50 p-4" hover-class="none" @click="onCardClick(item)">
                      <view class="d-flex justify-content mb-2">
                        <view class="min-width-0 flex-1">
                          <view class="flex flex-wrap items-center gap-2">
                            <text class="line-clamp-1 text-base text-[var(--text-main)] font-semibold">
                              {{ item.title || cardTitle(item) }}
                            </text>
                            <view
                              class="badge badge-pill rounded-full px-2 py-0.5 text-xs font-medium"
                              :class="solveStatusInfo(item.solve_status).class"
                            >
                              {{ item.solve_status_display ?? solveStatusInfo(item.solve_status).text }}
                            </view>
                          </view>
                        </view>
                      </view>
                      <view class="flex items-start text-sm text-[#424344]">
                        <text class="i-carbon-share mr-1 mt-0.5 shrink-0 text-base" />
                        <text class="ml-1">反馈至 {{ item.org_name || '—' }}</text>
                      </view>
                      <view class="mt-1 flex items-start text-sm text-[#424344]">
                        <text class="i-carbon-notification mr-1 mt-0.5 shrink-0 text-base" />
                        <text class="ml-1">{{ formatDatePublic(item.feedback_time ?? item.modify_time ?? item.time, item.publisher_public) }}</text>
                      </view>
                      <view class="feedback-content mt-1 flex items-start text-sm text-[#424344]">
                        <text class="i-carbon-email mr-1 mt-0.5 shrink-0 text-base" />
                        <text class="line-clamp-2 ml-1 flex-1">{{ item.content || '—' }}</text>
                      </view>
                    </view>
                  </view>
                </view>
              </view>
            </view>
            <!-- 已结束 -->
            <view v-show="myFeedbackTab === 'done'" class="tab-pane">
              <view v-if="myListLoading" class="py-10 text-center text-sm text-[#424344]">
                加载中...
              </view>
              <view v-else-if="myDoneList.length === 0" class="py-10 text-center text-sm text-[#424344]">
                您没有已完成的反馈。
              </view>
              <view v-else class="bio-skill-box">
                <view class="row px-2 pb-4">
                  <view
                    v-for="item in myDoneList"
                    :key="item.id"
                    class="col-12 mb-4"
                  >
                    <view class="b-skills border border-gray-100 rounded-lg bg-gray-50/50 p-4" hover-class="none" @click="onCardClick(item)">
                      <view class="d-flex justify-content mb-2">
                        <view class="min-width-0 flex-1">
                          <view class="flex flex-wrap items-center gap-2">
                            <text class="line-clamp-1 text-base text-[var(--text-main)] font-semibold">
                              {{ item.title || cardTitle(item) }}
                            </text>
                            <view
                              class="badge badge-pill rounded-full px-2 py-0.5 text-xs font-medium"
                              :class="solveStatusInfo(item.solve_status).class"
                            >
                              {{ item.solve_status_display ?? solveStatusInfo(item.solve_status).text }}
                            </view>
                          </view>
                        </view>
                      </view>
                      <view class="flex items-start text-sm text-[#424344]">
                        <text class="i-carbon-share mr-1 mt-0.5 shrink-0 text-base" />
                        <text class="ml-1">反馈至 {{ item.org_name || '—' }}</text>
                      </view>
                      <view class="mt-1 flex items-start text-sm text-[#424344]">
                        <text class="i-carbon-notification mr-1 mt-0.5 shrink-0 text-base" />
                        <text class="ml-1">{{ formatDatePublic(item.feedback_time ?? item.modify_time ?? item.time, item.publisher_public) }}</text>
                      </view>
                      <view class="feedback-content mt-1 flex items-start text-sm text-[#424344]">
                        <text class="i-carbon-email mr-1 mt-0.5 shrink-0 text-base" />
                        <text class="line-clamp-2 ml-1 flex-1">{{ item.content || '—' }}</text>
                      </view>
                    </view>
                  </view>
                </view>
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.layout-top-spacing {
  padding-top: 16px;
}
.layout-spacing {
  padding-bottom: 8px;
}
.text-indent-2em {
  text-indent: 2em;
}
/* 与网页 b-skills 一致的卡片 */
.b-skills {
  transition: opacity 0.15s;
}
/* 解决状态徽章（与网页 Bootstrap 一致） */
.badge-success {
  background-color: #28a745;
  color: #fff;
}
.badge-primary {
  background-color: #1b55e2;
  color: #fff;
}
.badge-warning {
  background-color: #ffc107;
  color: #212529;
}
.badge-secondary {
  background-color: #6c757d;
  color: #fff;
}
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.line-clamp-1 {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.nav-link-active {
  border-bottom: 2rpx solid #1b55e2;
  background: #fff;
}

/* ========== 写反馈表单：适配手机屏宽、防点击闪屏 ========== */
.feedback-form-screen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  background: #fff;
  box-sizing: border-box;
}
.feedback-form-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 24rpx 24rpx 24rpx;
  border-bottom: 1rpx solid #e5e7eb;
  box-sizing: border-box;
}
.feedback-form-header-side {
  width: 80rpx;
  min-width: 80rpx;
  box-sizing: border-box;
}
.feedback-form-header-right {
  text-align: right;
}
.feedback-form-title {
  flex: 1;
  text-align: center;
  font-size: 36rpx;
  font-weight: 500;
  color: var(--text-main, #333);
}
.feedback-form-scroll {
  height: calc(100vh - 104rpx);
  box-sizing: border-box;
}
.feedback-form-body {
  padding: 24rpx;
  padding-bottom: 48rpx;
  box-sizing: border-box;
  max-width: 100%;
}
.form-picker {
  display: block;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}
.form-picker-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-width: 0;
  padding: 24rpx;
  border-radius: 16rpx;
  border: 1rpx solid #e5e7eb;
  background: #fff;
  color: #424344;
  box-sizing: border-box;
}
.form-picker-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 28rpx;
}
.form-picker-arrow {
  flex-shrink: 0;
  margin-left: 16rpx;
  font-size: 28rpx;
  color: #9ca3af;
}
.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.form-textarea {
  width: 100%;
  min-height: 88rpx;
  padding: 24rpx;
  border-radius: 16rpx;
  border: 1rpx solid #e5e7eb;
  background: #fff;
  color: #424344;
  font-size: 28rpx;
  box-sizing: border-box;
}
.form-textarea-disabled {
  background: #f3f4f6;
  color: #6b7280;
}
.form-input {
  width: 100%;
  height: 80rpx;
  padding: 0 24rpx;
  border-radius: 16rpx;
  border: 1rpx solid #e5e7eb;
  background: #fff;
  color: #424344;
  font-size: 28rpx;
  box-sizing: border-box;
}
.form-input-disabled {
  background: #f3f4f6;
  color: #6b7280;
}
.form-textarea-large {
  min-height: 240rpx;
}
.form-buttons {
  display: flex;
  gap: 24rpx;
  margin-top: 32rpx;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}
.form-btn {
  flex: 1;
  min-width: 0;
  padding: 24rpx 16rpx;
  border-radius: 16rpx;
  text-align: center;
  font-size: 28rpx;
  font-weight: 500;
  box-sizing: border-box;
}
.form-btn-secondary {
  background: #f3f4f6;
  color: #424344;
}
.form-btn-primary {
  background: #1b55e2;
  color: #fff;
}
.form-btn-disabled {
  opacity: 0.7;
}
</style>
