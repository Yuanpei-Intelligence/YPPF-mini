<script setup lang="ts">
import { ref, watch } from 'vue'
import { useConfirmState } from '@/hooks/useConfirm'
import { tokens } from '@/style/tokens'

interface UvModalInstance {
  open: () => void
  close: () => void
}

const { state, settle } = useConfirmState()
const modalRef = ref<UvModalInstance | null>(null)

// Every page in the stack renders its own root view (and thus its own modal);
// all of them follow the shared state so a dialog opened on one page cannot be
// left dangling on another.
watch(() => state.seq, () => {
  if (state.visible)
    modalRef.value?.open()
})
watch(() => state.visible, (visible) => {
  if (!visible)
    modalRef.value?.close()
})

function onConfirm() {
  settle(true)
}
function onCancel() {
  settle(false)
}
</script>

<template>
  <uv-modal
    ref="modalRef"
    :title="state.options.title"
    :content="state.options.content"
    :confirm-text="state.options.confirmText"
    :cancel-text="state.options.cancelText"
    :show-cancel-button="state.options.showCancel"
    :confirm-color="state.options.danger ? tokens.error : tokens.primary"
    :cancel-color="tokens.text2"
    @confirm="onConfirm"
    @cancel="onCancel"
    @close="onCancel"
  />
</template>
