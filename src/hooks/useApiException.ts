import type { Ref } from 'vue'
import type { ApiFieldErrors, RequestErrorKind } from '@/http/errors'
import { computed, ref } from 'vue'
import { toRequestError } from '@/http/errors'

export interface UvToastOptions {
  message: string
  type?: 'default' | 'error' | 'success' | 'warning'
  duration?: number
  position?: 'top' | 'center' | 'bottom'
}

export interface UvToastInstance {
  show: (options: UvToastOptions) => void
}

interface HandleApiExceptionOptions {
  fallbackMessage?: string
  showToast?: boolean
}

const TOAST_TYPE_BY_KIND: Record<RequestErrorKind, UvToastOptions['type']> = {
  network: 'warning',
  authentication: 'warning',
  permission: 'warning',
  business: 'error',
  server: 'error',
  unknown: 'error',
}

export function useApiException(toastRef: Ref<UvToastInstance | null>) {
  const fieldErrors = ref<ApiFieldErrors>({})
  const hasFieldErrors = computed(() => Object.keys(fieldErrors.value).length > 0)

  function showMessage(message: string, type: UvToastOptions['type'] = 'default'): void {
    toastRef.value?.show({
      message,
      type,
      duration: 2600,
      position: 'top',
    })
  }

  function clearFieldErrors(): void {
    fieldErrors.value = {}
  }

  function clearFieldError(field: string): void {
    if (!(field in fieldErrors.value))
      return
    const nextErrors = { ...fieldErrors.value }
    delete nextErrors[field]
    fieldErrors.value = nextErrors
  }

  function setFieldError(field: string, message: string, code = 'invalid'): void {
    fieldErrors.value = {
      ...fieldErrors.value,
      [field]: [{ code, message }],
    }
  }

  function getFieldMessages(field: string): string[] {
    return fieldErrors.value[field]?.map(item => item.message) ?? []
  }

  function handleApiException(error: unknown, options: HandleApiExceptionOptions = {}) {
    const requestError = toRequestError(error)
    fieldErrors.value = requestError.errors

    if (options.showToast !== false) {
      showMessage(
        options.fallbackMessage ?? requestError.message,
        TOAST_TYPE_BY_KIND[requestError.kind],
      )
    }
    return requestError
  }

  return {
    fieldErrors,
    hasFieldErrors,
    showMessage,
    clearFieldErrors,
    clearFieldError,
    setFieldError,
    getFieldMessages,
    handleApiException,
  }
}
