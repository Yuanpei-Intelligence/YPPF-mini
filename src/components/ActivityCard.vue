<script lang="ts" setup>
import type { ActivityStatus, IActivitySummary } from '@/api/types/activity'
import type { StatusTagType } from '@/components/StatusTag.vue'
import { computed } from 'vue'
import StatusTag from '@/components/StatusTag.vue'
import { formatDateTimeRange } from '@/utils/format'

/*
 * 活动摘要卡（首页「最新发布」等处使用）。
 * 只负责展示：不知道路由，点击通过 click 事件交给父页面处理。
 */

const props = withDefaults(defineProps<{
  activity: IActivitySummary
  /** 是否显示人数/限额，例如：12/50 人 */
  showQuota?: boolean
  /** 是否显示时间信息 */
  showTime?: boolean
}>(), {
  showQuota: false,
  showTime: false,
})

const emit = defineEmits<{
  click: [id: number]
}>()

/** 活动状态 -> 胶囊语义色；文字本身仍然显示状态名，不只靠颜色 */
const STATUS_TYPES: Record<ActivityStatus, StatusTagType> = {
  报名中: 'success',
  进行中: 'success',
  等待中: 'processing',
  待发布: 'processing',
  审核中: 'warning',
  已结束: 'default',
  已取消: 'error',
  已撤销: 'error',
  未过审: 'error',
}

const statusText = computed(() => props.activity.status || '')
const statusType = computed<StatusTagType>(() => STATUS_TYPES[props.activity.status] ?? 'default')
const timeText = computed(() => formatDateTimeRange(props.activity.start, props.activity.end))

function handleClick() {
  emit('click', props.activity.id)
}
</script>

<template>
  <view class="mb-3 yp-card-flat active:bg-fill" @click="handleClick">
    <!-- 标题和状态 -->
    <view class="flex items-start justify-between gap-3">
      <text class="line-clamp-2 min-w-0 flex-1 text-lg text-fg-1 font-semibold">
        {{ props.activity.title }}
      </text>
      <StatusTag v-if="statusText" :type="statusType" :text="statusText" class="mt-1 shrink-0" />
    </view>

    <!-- 组织 · 地点 -->
    <view class="mt-2 flex items-center gap-3 text-sm text-fg-2">
      <view class="min-w-0 flex items-center gap-1">
        <view class="i-carbon-user shrink-0 text-base text-fg-3" />
        <text class="truncate">{{ props.activity.organization_name }}</text>
      </view>
      <view v-if="props.activity.location" class="min-w-0 flex items-center gap-1">
        <view class="i-carbon-location shrink-0 text-base text-fg-3" />
        <text class="truncate">{{ props.activity.location }}</text>
      </view>
    </view>

    <!-- 时间（可选） -->
    <view v-if="props.showTime && timeText" class="mt-1 flex items-center gap-1 text-sm text-fg-2">
      <view class="i-carbon-time shrink-0 text-base text-fg-3" />
      <text>{{ timeText }}</text>
    </view>

    <!-- 简介 -->
    <text v-if="props.activity.introduction" class="line-clamp-2 mt-2 block text-sm text-fg-2">
      {{ props.activity.introduction }}
    </text>

    <!-- 标签 + 人数 -->
    <view class="mt-3 flex flex-wrap items-center justify-between gap-2">
      <view class="flex flex-wrap items-center gap-1.5">
        <StatusTag v-if="props.activity.category_display" type="default" :text="props.activity.category_display" />
        <StatusTag v-if="props.activity.need_apply" type="warning" text="需报名" />
        <StatusTag v-if="props.activity.inner" type="processing" text="内部" />
        <StatusTag v-if="props.activity.bidding" type="processing" text="投点" />
        <StatusTag v-if="props.activity.has_tag" type="success" text="推荐" />
      </view>
      <view v-if="props.showQuota && props.activity.capacity" class="flex items-center gap-1 text-xs text-fg-3">
        <view class="i-carbon-user text-base" />
        <text class="tabular-nums">{{ props.activity.current_participants }}/{{ props.activity.capacity }} 人</text>
      </view>
    </view>
  </view>
</template>
