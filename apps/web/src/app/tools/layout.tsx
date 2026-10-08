import { ConverterTextsProvider } from '@/components/tools/converter-texts'

export default function ToolsLayout({ children }: LayoutProps<'/tools'>) {
  return <ConverterTextsProvider>{children}</ConverterTextsProvider>
}
