import { describe, it, expect, vi, afterEach } from 'vitest'
import { lazy } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouteBoundary } from './RouteBoundary'

describe('RouteBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('reloads the browser page by default, which fetches the current chunk names', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    const Broken = lazy(() => Promise.reject(new TypeError('error loading dynamically imported module')))
    render(
      <RouteBoundary>
        <Broken />
      </RouteBoundary>,
    )

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'Ứng dụng có thể vừa được cập nhật hoặc kết nối mạng bị gián đoạn. Hãy tải lại trang.',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Tải lại trang' }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('announces the page while its code is still loading', () => {
    const Pending = lazy(() => new Promise<{ default: () => null }>(() => {}))
    render(
      <RouteBoundary>
        <Pending />
      </RouteBoundary>,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Đang tải trang…')
  })

  it('shows the page once its code has loaded', async () => {
    const Loaded = lazy(() => Promise.resolve({ default: () => <p>Trang đã tải</p> }))
    render(
      <RouteBoundary>
        <Loaded />
      </RouteBoundary>,
    )

    expect(await screen.findByText('Trang đã tải')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('explains a page whose code could not be downloaded and offers a reload', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const onReload = vi.fn()
    const Broken = lazy(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module: /assets/ChatPage-x1.js')))
    render(
      <RouteBoundary onReload={onReload}>
        <Broken />
      </RouteBoundary>,
    )

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Không tải được trang này')
    await userEvent.click(screen.getByRole('button', { name: 'Tải lại trang' }))
    expect(onReload).toHaveBeenCalledTimes(1)
  })

  it('explains any other error of the page', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const Crashing = () => {
      throw new Error('boom')
    }
    render(
      <RouteBoundary onReload={vi.fn()}>
        <Crashing />
      </RouteBoundary>,
    )

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Trang này gặp lỗi khi hiển thị')
    expect(alert).toHaveTextContent('Hãy tải lại trang. Nếu lỗi vẫn lặp lại, vui lòng báo quản trị viên.')
  })
})
