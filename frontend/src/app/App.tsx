import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from '../components/organisms/RequireAuth'
import { AppLayout } from '../components/templates/AppLayout'
import { ComingSoonPage } from '../pages/ComingSoonPage'
import { CustomerProfilePage } from '../pages/CustomerProfilePage'
import { CustomersPage } from '../pages/CustomersPage'
import { DebtEntryPage } from '../pages/DebtEntryPage'
import { HomePage } from '../pages/HomePage'
import { HistoryPage } from '../pages/HistoryPage'
import { LoginPage } from '../pages/LoginPage'
import { PaymentEntryPage } from '../pages/PaymentEntryPage'
import { ReportsPage } from '../pages/ReportsPage'
import type { TranslationKey } from './LanguageProvider'

export function App() {
  const pages: { path: string; title: TranslationKey }[] = [
    { path: 'customers', title: 'pageTitleCustomers' },
    { path: 'history', title: 'pageTitleHistory' },
    { path: 'settings', title: 'pageTitleSettings' },
    { path: 'debts/new', title: 'pageTitleAddDebt' },
    { path: 'payments/new', title: 'pageTitleReceivePayment' },
  ]

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<LoginPage />} path="/login" />
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<HomePage />} />
          <Route element={<CustomersPage />} path="customers" />
          <Route element={<CustomerProfilePage />} path="customers/:customerId" />
          <Route element={<HistoryPage />} path="history" />
          <Route element={<ReportsPage />} path="reports" />
          <Route element={<DebtEntryPage />} path="debts/new" />
          <Route element={<PaymentEntryPage />} path="payments/new" />
          {pages
            .filter(({ path }) => !['customers', 'history', 'reports', 'debts/new', 'payments/new'].includes(path))
            .map(({ path, title }) => (
              <Route
                element={<ComingSoonPage title={title} />}
                key={path}
                path={path}
              />
            ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
