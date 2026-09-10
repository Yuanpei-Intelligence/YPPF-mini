<script lang="ts" setup>
import type { UvToastInstance } from '@/hooks/useApiException'
import { getAgreement, signAgreement } from '@/api/appoint'
import PageState from '@/components/PageState.vue'
import { useApiException } from '@/hooks/useApiException'
import { formatChineseDate } from '@/utils/format'

definePage({
  style: {
    navigationBarTitleText: '签署协议',
  },
})

const agreementTime = ref<string | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
const signing = ref(false)
const toastRef = ref<UvToastInstance | null>(null)
const { handleApiException, showMessage } = useApiException(toastRef)

const isSigned = computed(() => agreementTime.value !== null)
// 「已签署 · 9月10日 周三」；时间无法解析时只显示「已签署」
const signedText = computed(() => {
  const date = formatChineseDate(agreementTime.value)
  return date ? `已签署 · ${date}` : '已签署'
})

async function load() {
  loading.value = true
  try {
    const res = await getAgreement()
    agreementTime.value = res.agree_time
    loadError.value = null
  }
  catch (error) {
    // 首屏失败只显示页内错误 + 重试
    loadError.value = handleApiException(error, { showToast: false }).message
  }
  finally {
    loading.value = false
  }
}

onLoad(() => {
  load()
})

async function handleSign() {
  if (signing.value)
    return
  signing.value = true
  try {
    await signAgreement()
    // 以服务端记录的签署时间为准；取不到时退回本地时间
    try {
      const res = await getAgreement()
      agreementTime.value = res.agree_time ?? new Date().toISOString()
    }
    catch {
      agreementTime.value = new Date().toISOString()
    }
    showMessage('签署成功', 'success')
  }
  catch (error) {
    console.error(error)
    handleApiException(error)
  }
  finally {
    signing.value = false
  }
}

function goBack() {
  if (getCurrentPages().length > 1)
    uni.navigateBack()
  else
    uni.switchTab({ url: '/pages/appoint/appoint' })
}
</script>

<template>
  <uv-toast ref="toastRef" />
  <view class="yp-page px-4 py-3 pb-48">
    <!-- 35楼地下室使用规范 -->
    <view class="yp-card-flat">
      <view class="text-center text-xl text-fg-1 font-semibold">
        35楼地下室使用规范
      </view>

      <view class="mt-4 text-lg text-fg-1 font-semibold">
        第一部分 公共空间
      </view>
      <view class="mt-2 flex flex-col gap-2 text-base text-fg-1 leading-relaxed">
        <view>1.地下室公共空间（包括公共自习区域、各个房间的柜子）禁止长时间存放个人物品，每天1：30-6：30物业会将地下室遗留物品转移到<text class="text-primary">物业办公室</text>（B108每天7:30-8:00转移占座物品），物业管理人员及学院等管理团队对转移的物品没有保管的责任和义务，如物品遗失由使用者个人负责。</view>
        <view>2.地下室遗留物品在物业办公室存放两天，随后转移到<text class="text-primary">内联部柜子</text>，此后最近的一个<text class="text-primary">周日</text>，内联部对柜子内当周新增物品通过<text class="text-primary">企业微信、年级群等渠道公示一周</text>，希望同学们尽快联系物业或内联部领取，公示期结束后，遗留物品会被清理。</view>
        <view>3.学生组织、书院课助教、运动队等团体可以在向物业申请在指定地下室柜子中长时间存放组织用物品。</view>
        <view>4.同学可以在地下室公共空间小憩，但是不能脱鞋上沙发，物业人员有权制止相关行为。</view>
        <view>5.公共自习室禁止进餐，希望大家前往咖啡厅和水吧进餐，请在用餐后及时清理垃圾，共同维护整洁的地下室环境。</view>
        <view>6.地下室卫生间蹲坑冲水能力有限，请大家不要向蹲坑内丢弃卫生纸和其他杂物（如骨头、食物残渣等），这样会造成管道堵塞，严重情况下会导致蹲坑长达一学期无法使用。</view>
      </view>

      <view class="mt-5 text-lg text-fg-1 font-semibold">
        第二部分 自习室
      </view>
      <view class="mt-2 flex flex-col gap-2 text-base text-fg-1 leading-relaxed">
        <view>1.<text class="text-primary">无占座自习室（B106、B114）禁止占座超过一个小时</text>，所有自习室（包括B108）<text class="text-primary">禁止隔夜占座</text>。</view>
        <view>2.使用无占座自习室需签署<text class="text-primary">无占座协议</text>。在无占座自习室，离开座位前同学们可以取用占座贴，并且写上姓名（或学号）和离开座位的时间。若一个小时后仍未返回，或没有取占座贴即离开，<text class="text-primary">其他同学可以把该同学的东西转移</text>，希望大家优先将占座物品放在座位下，空间不足可转移至每个自习室墙角黑架子。</view>
        <view>3.请不要在无键盘自习室（B119）使用键盘，理解需要更加安静的自习环境的同学的需求。</view>
      </view>

      <view class="mt-5 text-lg text-fg-1 font-semibold">
        第三部分 研讨室、活动室
      </view>
      <view class="mt-2 flex flex-col gap-2 text-base text-fg-1 leading-relaxed">
        <view>
          <view>1.违约扣分的情况：</view>
          <view class="pl-4">
            <view>- 预约开始时间前后15分钟内始终无人刷卡使用。</view>
            <view>- 预约时间段内超过 40% 时间，房间内实际人数未达到房间预约人数一半以上。（注:不是一半及以上。例如有2个人预约，则需要两个人同时到场时间超过预约时间的40%）</view>
          </view>
        </view>
        <view>2.研讨室和功能房预约本着先到先得的原则，在不损坏房间设施的前提下对使用房间的方式不作限制。</view>
        <view>3.为灵活利用闲置房间，预约当天的教室没有最低人数限制，距离下一场预约30分钟以上时可以在房间刷卡临时预约。</view>
        <view>4.音乐室和朗读仓隔音效果有限，希望大家注意音量。</view>
        <view>5.地下室房间的预约和使用必须严格遵循该房间的预定用途。若违反规定，学院有权取消相关预约或取消该用户的预约资格。</view>
        <view>6.地下室空间资源有限，希望大家可以理解彼此对于房间的需求，如果遇到问题希望大家积极相互沟通。</view>
      </view>
    </view>

    <!-- 承诺书 -->
    <view class="mt-3 yp-card-flat">
      <view class="text-center text-xl text-fg-1 font-semibold">
        申请使用35楼地下空间无占座自习室承诺书
      </view>
      <view class="mt-4 flex flex-col gap-2 text-base text-fg-1 leading-relaxed">
        <view>我自愿申请使用35楼地下“无占座自习室”使用权，并承诺遵守以下规定：</view>
        <view>1. 严格遵守35楼地下空间使用规则；</view>
        <view>2. 自习座位使用后，及时将全部个人物品带离；</view>
        <view>3. 自习过程中短暂离开座位时，正确填写占座贴并使用计时器记录离开时间，离开时间不超过一小时；</view>
        <view>4. 认可未使用或未正确使用占座贴及计时器，或者占座超过一小时后，此座位为占座座位；</view>
        <view>5. 对于无占座自习室内占座座位，同意具有“无占座自习室”使用权限的同学及物业管理人员有权将座位物品清理到临时存放处，并将座位提供给其他同学使用；</view>
        <view>6. 认同临时存放处为公共空间，学院及物业管理部门会每晚24点对其进行清理；</view>
        <view>7. 物业管理人员及学院等管理团队对清理的物品没有保管责任和义务，如物品遗失由使用者个人负责；</view>
        <view>8. 违反“无占座自习室”使用规定，学院将取消“无占座自习室”使用权限并扣除信用积分；</view>
        <view>9. 对使用“无占座自习室”过程中出现的任何问题，请通过内联权益部、年级主任或住宿辅导员联系学院解决。</view>
        <view class="mt-2">
          以上内容解释权归学院所有。
        </view>
      </view>
    </view>
    <!-- 底部固定栏的安全区占位 -->
    <view class="pb-safe" />
  </view>

  <!-- 底部固定栏：签署状态 / 签署按钮 -->
  <view class="fixed bottom-0 left-0 right-0 z-50 bg-card px-4 pt-3 shadow-float pb-safe-3">
    <PageState :loading="loading" :error="loadError" compact @retry="load">
      <template v-if="isSigned">
        <view class="mb-2 flex items-center justify-center gap-1 text-sm text-success">
          <view class="i-carbon-checkmark-filled" />
          <text>{{ signedText }}</text>
        </view>
        <button class="btn-primary btn-block" @click="goBack">
          返回
        </button>
      </template>
      <button
        v-else
        class="btn-primary btn-block"
        :loading="signing"
        :disabled="signing"
        @click="handleSign"
      >
        签署协议
      </button>
    </PageState>
  </view>
</template>
