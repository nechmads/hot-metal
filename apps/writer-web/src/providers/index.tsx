import { Toaster } from 'sonner'
import { ModalProvider } from '@/providers/ModalProvider'
import { TooltipProvider } from '@/providers/TooltipProvider'
import { AuthProvider } from '@/providers/AuthProvider'

export const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <AuthProvider>
      <TooltipProvider>
        <ModalProvider>
          {children}
          <Toaster position="bottom-right" richColors />
        </ModalProvider>
      </TooltipProvider>
    </AuthProvider>
  )
}
