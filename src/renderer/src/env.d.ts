import type { PitwallApi } from '../../shared/ipc'

declare global {
  interface Window { readonly pitwall: PitwallApi }
}
