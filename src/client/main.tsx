import React from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'
import { AppDialogProvider } from './components/AppDialogProvider'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { getGeneralSettings } from './utils/generalSettings'

const PRIVATE_TITLE_PREFIX = 'Sarva'
const PRIVATE_TITLE_MATCHERS: Array<{ match: RegExp; title: string }> = [
  { match: /^\/$/, title: 'Dashboard' },
  { match: /^\/sales-dashboard$/, title: 'Sales Dashboard' },
  { match: /^\/inventory\/procurement$/, title: 'Procurement' },
  { match: /^\/inventory$/, title: 'Inventory' },
  { match: /^\/sales\/quotes$/, title: 'Quotations' },
  { match: /^\/sales$/, title: 'Sales' },
  { match: /^\/customers\/directory$/, title: 'Customer Directory' },
  { match: /^\/customers\/profiles$/, title: 'Customer Profiles' },
  { match: /^\/customers\/enquiries$/, title: 'Customer Enquiries' },
  { match: /^\/customers\/campaigns$/, title: 'Customer Campaigns' },
  { match: /^\/customers\/reports$/, title: 'Customer Reports' },
  { match: /^\/orders$/, title: 'Orders' },
  { match: /^\/products\/catalog$/, title: 'Product Catalog' },
  { match: /^\/products\/alerts$/, title: 'Product Alerts' },
  { match: /^\/products\/entry$/, title: 'Product Entry' },
  { match: /^\/products\/edit\/.+$/, title: 'Edit Product' },
  { match: /^\/products$/, title: 'Product Center' },
  { match: /^\/returns$/, title: 'Returns' },
  { match: /^\/categories$/, title: 'Categories' },
  { match: /^\/settings$/, title: 'Settings' },
  { match: /^\/admin\/company-create$/, title: 'Company Creation' },
  { match: /^\/accounting\/settlements$/, title: 'Settlement Center' },
  { match: /^\/accounting\/validation$/, title: 'Accounting Validation' },
  { match: /^\/accounting$/, title: 'Accounting' },
  { match: /^\/reports$/, title: 'Reports' },
  { match: /^\/user-manual$/, title: 'User Manual' },
  { match: /^\/employees$/, title: 'Employees' },
  { match: /^\/attendance\/reports$/, title: 'Attendance Reports' },
  { match: /^\/attendance\/self$/, title: 'Employee Attendance' },
  { match: /^\/attendance$/, title: 'Attendance' },
  { match: /^\/shifts$/, title: 'Shifts' },
  { match: /^\/payroll$/, title: 'Payroll' },
  { match: /^\/events\/quotations$/, title: 'Event Quotations' },
  { match: /^\/events$/, title: 'Event Management' },
  { match: /^\/services$/, title: 'Service Desk' },
  { match: /^\/facilities\/setup$/, title: 'Facility Setup' },
  { match: /^\/facilities$/, title: 'Facilities' },
  { match: /^\/membership-plans\/create$/, title: 'Membership Plan Setup' },
  { match: /^\/membership-subscriptions\/create$/, title: 'Create Subscription' },
  { match: /^\/membership-reports$/, title: 'Membership Reports' },
  { match: /^\/memberships$/, title: 'Memberships' },
  { match: /^\/user-management$/, title: 'User Management' },
  { match: /^\/admin\/reports$/, title: 'Admin Reports' },
  { match: /^\/forbidden$/, title: 'Access Denied' },
]

const resolvePrivateDocumentTitle = (pathname: string): string => {
  const matched = PRIVATE_TITLE_MATCHERS.find((entry) => entry.match.test(pathname))
  return matched?.title || 'Workspace'
}

const resolveWorkspaceLabel = (): string => {
  const settings = getGeneralSettings()
  return String(settings.business.tradeName || settings.business.legalName || '').trim()
}

const syncPrivateDocumentTitle = (): void => {
  const activeToken = localStorage.getItem('token')
  if (!activeToken) return

  const pageTitle = resolvePrivateDocumentTitle(window.location.pathname)
  const workspaceLabel = resolveWorkspaceLabel()
  document.title = `${PRIVATE_TITLE_PREFIX} ${pageTitle}${workspaceLabel ? ` | ${workspaceLabel}` : ''}`
}

const installPrivateDocumentTitleSync = (): void => {
  syncPrivateDocumentTitle()

  const { pushState, replaceState } = window.history
  window.history.pushState = function (...args) {
    const result = pushState.apply(this, args)
    syncPrivateDocumentTitle()
    return result
  }

  window.history.replaceState = function (...args) {
    const result = replaceState.apply(this, args)
    syncPrivateDocumentTitle()
    return result
  }

  window.addEventListener('popstate', syncPrivateDocumentTitle)
  window.addEventListener('storage', syncPrivateDocumentTitle)
  window.addEventListener('sarva-settings-updated', syncPrivateDocumentTitle as EventListener)
}

const rootElement = document.getElementById('root')!
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})
const app = (
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
        <AppDialogProvider>
          <App />
        </AppDialogProvider>
      </AppErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>
)

if (rootElement.hasChildNodes()) {
  hydrateRoot(rootElement, app)
} else {
  createRoot(rootElement).render(app)
}

installPrivateDocumentTitleSync()
