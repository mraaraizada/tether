import { LayoutGrid, ListChecks, MessagesSquare, GitCompare, FileText, type LucideIcon } from 'lucide-react'

export type ViewId = 'overview' | 'guide' | 'analysis' | 'ask' | 'transcripts'

export interface NavItem {
  id: ViewId
  label: string
  icon: LucideIcon
  hint: string
}

export const navItems: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid, hint: 'Corpus, coverage and method' },
  { id: 'guide', label: 'Interview Guide', icon: ListChecks, hint: 'Guide answers per expert' },
  { id: 'analysis', label: 'Cross-Call', icon: GitCompare, hint: 'Themes and disagreements' },
  { id: 'ask', label: 'Ask', icon: MessagesSquare, hint: 'Question the whole corpus' },
  { id: 'transcripts', label: 'Transcripts', icon: FileText, hint: 'Source text with timestamps' },
]
