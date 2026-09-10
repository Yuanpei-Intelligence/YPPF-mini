<script lang="ts" setup>
defineProps<{
  messages?: string[]
}>()
</script>

<template>
  <view v-if="messages?.length" class="mt-1.5">
    <text
      v-for="message in messages"
      :key="message"
      class="block text-xs text-error leading-5"
    >
      {{ message }}
    </text>
  </view>
</template>
