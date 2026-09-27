<script lang="ts" setup>
import type { Settings, SettingsPatch } from '@/api/types/timetable'
import type { FilterSourceItem, FilterTagItem } from '@/utils/timetable'
import { computed, ref } from 'vue'
import { buildFilterPatch, filterSources, filterTags } from '@/utils/timetable'

/*
 * 日程筛选底部弹层：按来源（学校课表 / 书院课 / 活动 / 预约 / 考试）和标签开关过滤日程。
 * 打开时从 settings 生成草稿，点「保存」把整理好的 PATCH 请求体通过 save 事件交给父页面提交；
 * 父页面保存成功后调 close()。不请求数据、不知道路由。
 */

const props = withDefaults(defineProps<{
  settings: Settings | null
  saving?: boolean
}>(), {
  saving: false,
})

const emit = defineEmits<{
  save: [patch: SettingsPatch]
}>()

interface PopupInstance {
  open: () => void
  close: () => void
}

const popup = ref<PopupInstance | null>(null)
const sources = ref<FilterSourceItem[]>([])
const tags = ref<FilterTagItem[]>([])

const allSourcesOn = computed(() => sources.value.every(item => item.enabled))
const allTagsOn = computed(() => tags.value.every(item => item.enabled))
/** 后端已升级到标签筛选（返回了 tags 列表）时才显示标签区 */
const tagsSupported = computed(() => Array.isArray(props.settings?.tags))

function open() {
  if (!props.settings)
    return
  sources.value = filterSources(props.settings)
  tags.value = filterTags(props.settings)
  popup.value?.open()
}

function close() {
  popup.value?.close()
}

function toggleSource(index: number, enabled: boolean) {
  const item = sources.value[index]
  if (item)
    item.enabled = enabled
}

function toggleTag(index: number, enabled: boolean) {
  const item = tags.value[index]
  if (item)
    item.enabled = enabled
}

function setAllSources(enabled: boolean) {
  for (const item of sources.value)
    item.enabled = enabled
}

function setAllTags(enabled: boolean) {
  for (const item of tags.value)
    item.enabled = enabled
}

function save() {
  if (!props.settings || props.saving)
    return
  emit('save', buildFilterPatch(props.settings, sources.value, tags.value))
}

defineExpose({ open, close })
</script>

<template>
  <uv-popup ref="popup" mode="bottom" :round="16" :safe-area-inset-bottom="true">
    <view class="px-5 pb-5 pt-5">
      <view class="flex items-center justify-between">
        <text class="text-base text-gray-900 font-bold">筛选日程</text>
        <text class="text-xs text-gray-400">对首页日程、课表、日历订阅与提醒一并生效</text>
      </view>

      <scroll-view scroll-y class="filter-body mt-3">
        <view class="flex items-center justify-between">
          <text class="text-sm text-gray-500">来源</text>
          <text class="text-xs text-blue-600 active:opacity-60" @click="setAllSources(!allSourcesOn)">
            {{ allSourcesOn ? '全部关闭' : '全部显示' }}
          </text>
        </view>
        <view
          v-for="(item, index) in sources"
          :key="item.key"
          class="flex items-center justify-between border-b border-gray-50 py-2.5 last:border-none"
        >
          <text class="text-sm text-gray-800">{{ item.label }}</text>
          <uv-switch
            :model-value="item.enabled"
            size="22"
            active-color="#2563eb"
            @change="(value: boolean) => toggleSource(index, value)"
          />
        </view>

        <template v-if="tagsSupported">
          <view class="mt-4 flex items-center justify-between">
            <text class="text-sm text-gray-500">标签</text>
            <text v-if="tags.length" class="text-xs text-blue-600 active:opacity-60" @click="setAllTags(!allTagsOn)">
              {{ allTagsOn ? '全部关闭' : '全部显示' }}
            </text>
          </view>
          <view
            v-for="(item, index) in tags"
            :key="item.tag"
            class="flex items-center justify-between border-b border-gray-50 py-2.5 last:border-none"
          >
            <text class="min-w-0 flex-1 truncate pr-3 text-sm text-gray-800">{{ item.tag }}</text>
            <uv-switch
              :model-value="item.enabled"
              size="22"
              active-color="#2563eb"
              @change="(value: boolean) => toggleTag(index, value)"
            />
          </view>
          <text v-if="!tags.length" class="block py-2 text-xs text-gray-400 leading-5">
            还没有标签。编辑日程时填写标签（如“选修”“旁听”），就可以在这里按标签筛选。
          </text>
        </template>
      </scroll-view>

      <view class="mt-4 flex gap-3">
        <button
          class="flex-1 border border-gray-200 rounded-lg bg-white py-2.5 text-sm text-gray-700 font-medium"
          :disabled="saving"
          @click="close"
        >
          取消
        </button>
        <button
          class="flex-1 rounded-lg bg-blue-500 py-2.5 text-sm text-white font-medium"
          :disabled="saving"
          @click="save"
        >
          {{ saving ? '保存中…' : '保存' }}
        </button>
      </view>
    </view>
  </uv-popup>
</template>

<style lang="scss" scoped>
.filter-body {
  max-height: 55vh;
}

button::after {
  border: none;
}
</style>
