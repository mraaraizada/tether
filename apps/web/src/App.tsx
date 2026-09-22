import ErrorBoundary from './components/ErrorBoundary'
import Workspace from './pages/Workspace'

export default function App() {
  return (
    <ErrorBoundary>
      <Workspace />
    </ErrorBoundary>
  )
}
