// Wraps a lazily loaded page: an announced loading state while its chunk downloads, and an error
// state (with a reload) when the chunk cannot be fetched — typically after a new deploy removed
// the old file, or on a dropped connection — or when the page throws while rendering
import { Component, Suspense } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export function PageLoader() {
  const { t } = useTranslation()
  return (
    <div role="status" aria-live="polite" className="flex flex-1 items-center justify-center gap-3 p-12 text-sm text-[#64748B]">
      <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-[#C62828] border-t-transparent" />
      {t('layout.routeBoundary.loading.page')}
    </div>
  )
}

// Messages browsers use when a dynamic import fails (Chromium, Firefox, Safari) and Vite's preload error
const CHUNK_LOAD_ERROR =
  /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk|ChunkLoadError|Unable to preload CSS/i

function isChunkLoadError(error: unknown): boolean {
  return error instanceof Error && CHUNK_LOAD_ERROR.test(`${error.name}: ${error.message}`)
}

interface RouteBoundaryProps {
  children: ReactNode
  /** Defaults to reloading the page, which fetches the current chunk names */
  onReload?: () => void
}

interface BoundaryState {
  failed: boolean
  chunk: boolean
}

function RouteErrorFallback({ chunk, onReload }: { chunk: boolean; onReload: () => void }) {
  const { t } = useTranslation()
  return (
    <div role="alert" className="m-6 space-y-3 rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-[#7F1D1D]">
      <p className="text-base font-semibold text-[#C62828]">
        {chunk ? t('layout.routeBoundary.chunkError.title') : t('layout.routeBoundary.renderError.title')}
      </p>
      <p>
        {chunk ? t('layout.routeBoundary.chunkError.description') : t('layout.routeBoundary.renderError.description')}
      </p>
      <button
        type="button"
        onClick={onReload}
        className="inline-flex min-h-11 items-center rounded-lg bg-[#C62828] px-4 font-medium text-white hover:bg-[#A91D1D] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C62828] focus-visible:ring-offset-2"
      >
        {t('common.actions.reload')}
      </button>
    </div>
  )
}

class RouteErrorBoundary extends Component<RouteBoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false, chunk: false }

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { failed: true, chunk: isChunkLoadError(error) }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Page failed to load or render', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    const reload = this.props.onReload ?? (() => window.location.reload())
    return <RouteErrorFallback chunk={this.state.chunk} onReload={reload} />
  }
}

export function RouteBoundary({ children, onReload }: RouteBoundaryProps) {
  return (
    <RouteErrorBoundary onReload={onReload}>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </RouteErrorBoundary>
  )
}
