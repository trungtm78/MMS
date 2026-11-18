import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, Lock, Unlock, Key, ChevronLeft, ChevronRight, ShieldOff } from 'lucide-react'
import { toast } from 'sonner'
import { Navigate } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  CREATE_USER_ERROR_FIELDS,
  CREATE_USER_VALIDATION_FIELDS,
  OFFICE_STAFF_ASSIGNABLE_ROLES,
  PHONE_PATTERN,
  USERNAME_PATTERN,
  buildCreateUserBody,
  createUser,
  listUsers,
  resetPassword,
  resetUserMfa,
  updateUserStatus,
  type AdminUser,
  type CreateUserField,
  type CreateUserInput,
  type UserStatus,
} from '@/api/admin'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dialog } from '@/components/ui/Dialog'
import { useAuth } from '@/contexts/AuthContext'
import { useRbac } from '@/hooks/useRbac'
import type { TranslationKey } from '@/i18n/types'
import {
  describeApiError,
  errorCodeText,
  mapValidationErrors,
  parseApiError,
  validationFormMessage,
} from '@/lib/api-error'
import { ROLE_PRIORITY, roleLabel } from '@/lib/roles'
import type { UserRole } from '@/types'

// Role badge colors: admin=red, police/CA=blue, leader=purple, staff=gray, militia=green
const ROLE_BADGE_COLORS: Record<UserRole, string> = {
  system_admin: 'bg-red-100 text-[#C62828]',
  police_ward: 'bg-blue-100 text-blue-700',
  ca_ward: 'bg-blue-100 text-blue-700',
  ubnd_leader: 'bg-purple-100 text-purple-700',
  police_area: 'bg-blue-100 text-blue-700',
  ca_area: 'bg-blue-100 text-blue-700',
  ca_officer: 'bg-blue-100 text-blue-700',
  office_staff: 'bg-gray-100 text-[#64748B]',
  dqtv: 'bg-green-100 text-[#2E7D32]',
  dqtv_member: 'bg-green-100 text-[#2E7D32]',
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-[#2E7D32]',
  inactive: 'bg-gray-100 text-[#64748B]',
  suspended: 'bg-red-100 text-[#C62828]',
}

const USER_STATUS_LABEL = {
  active: 'users.management.status.active',
  inactive: 'users.management.status.inactive',
  suspended: 'users.management.status.suspended',
} as const satisfies Record<UserStatus, TranslationKey>

// A status the page does not know reads as inactive
function statusLabelKey(status: string): TranslationKey {
  return status === 'active' || status === 'suspended' ? USER_STATUS_LABEL[status] : USER_STATUS_LABEL.inactive
}

type CreateField = CreateUserField
type FieldErrors = Partial<Record<CreateField, string>>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const INPUT_CLASS =
  'w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C62828] focus:border-[#C62828] text-sm text-[#0F172A]'

function emptyForm(role: UserRole): CreateUserInput {
  return { username: '', fullName: '', email: '', phone: '', role, unitCode: '' }
}

function validate(form: CreateUserInput, t: TFunction): FieldErrors {
  const errors: FieldErrors = {}
  if (!USERNAME_PATTERN.test(form.username.trim())) {
    errors.username = t('users.create.validation.username')
  }
  if (!form.fullName.trim()) errors.fullName = t('users.create.validation.fullNameRequired')
  if (form.email.trim() && !EMAIL_PATTERN.test(form.email.trim())) errors.email = t('users.create.validation.emailInvalid')
  if (form.phone.trim() && !PHONE_PATTERN.test(form.phone.trim())) errors.phone = t('users.create.validation.phoneInvalid')
  return errors
}

// Every role the user holds; rows from an older API carry only the primary role
function rolesOf(user: AdminUser): string[] {
  if (Array.isArray(user.roles) && user.roles.length > 0) return user.roles
  return user.role ? [user.role] : []
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} data-testid={id} className="mt-1 text-xs text-[#C62828]">
      {message}
    </p>
  )
}

export function UserManagementPage() {
  const { can } = useRbac()
  // admin.controller.ts:40 @Roles('system_admin', 'office_staff')
  if (!can.manageUsers) return <Navigate to="/forbidden" replace />
  return <UserManagementContent />
}

function UserManagementContent() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { hasRole } = useRbac()
  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [resetPasswordResult, setResetPasswordResult] = useState<{ userId: string; password: string } | null>(null)

  // Roles the signed-in user may assign (AdminService.assertAssignableRole)
  const assignableRoles: readonly UserRole[] = hasRole('system_admin')
    ? ROLE_PRIORITY
    : hasRole('office_staff')
      ? OFFICE_STAFF_ASSIGNABLE_ROLES
      : []
  const defaultRole: UserRole = assignableRoles.includes('dqtv') ? 'dqtv' : (assignableRoles[0] ?? 'dqtv')

  const [showAddUser, setShowAddUser] = useState(false)
  const [newUser, setNewUser] = useState<CreateUserInput>(() => emptyForm(defaultRole))
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', page],
    queryFn: () => listUsers({ page, limit: 20 }),
  })

  const actionError = (fallback: TranslationKey) => (err: unknown) =>
    toast.error(describeApiError(err, { scope: 'admin', fallback }))

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'inactive' }) => updateUserStatus(id, status),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-users'] }); toast.success(t('users.status.update.success')) },
    onError: actionError('users.status.update.error'),
  })

  const resetMutation = useMutation({
    mutationFn: (id: string) => resetPassword(id),
    onSuccess: (result, id) => setResetPasswordResult({ userId: id, password: result.temporaryPassword }),
    onError: actionError('users.resetPassword.request.error'),
  })

  // Second-factor reset: system_admin only, never on one's own account (MfaAdminController)
  const { user: currentUser } = useAuth()
  const canResetMfa = hasRole('system_admin')
  const [mfaResetTarget, setMfaResetTarget] = useState<AdminUser | null>(null)
  const resetMfaMutation = useMutation({
    mutationFn: (target: AdminUser) => resetUserMfa(target.id),
    onSuccess: (_, target) => toast.success(t('users.resetMfa.request.success', { username: target.username })),
    onError: actionError('users.resetMfa.request.error'),
    onSettled: () => setMfaResetTarget(null),
  })

  const createMutation = useMutation({
    mutationFn: () => createUser(buildCreateUserBody(newUser)),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      setResetPasswordResult({ userId: result.id, password: result.temporaryPassword })
      toast.success(t('users.create.submit.success'))
      setShowAddUser(false)
      setNewUser(emptyForm(defaultRole))
    },
    onError: (err) => {
      const { code } = parseApiError(err)
      const field = code ? CREATE_USER_ERROR_FIELDS[code] : undefined
      const fieldText = code && field ? errorCodeText('admin', code) : null
      if (field && fieldText) {
        setFieldErrors({ [field]: fieldText })
        return
      }
      const validation = mapValidationErrors(err, CREATE_USER_VALIDATION_FIELDS)
      if (validation) {
        setFieldErrors(validation.fieldErrors)
        setFormError(validationFormMessage(validation.otherErrors))
        return
      }
      setFormError(
        describeApiError(err, {
          scope: 'admin',
          statuses: { 400: 'users.create.submit.invalid' },
          fallback: 'users.create.submit.error',
        }),
      )
    },
  })

  const openAddUser = () => {
    setNewUser(emptyForm(defaultRole))
    setFieldErrors({})
    setFormError(null)
    setShowAddUser(true)
  }

  const updateField = (field: CreateField, value: string) => {
    setNewUser((u) => ({ ...u, [field]: value }))
    setFieldErrors((errors) => ({ ...errors, [field]: undefined }))
  }

  const submitNewUser = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    const errors = validate(newUser, t)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    createMutation.mutate()
  }

  const fieldProps = (field: CreateField) => ({
    'aria-invalid': !!fieldErrors[field],
    'aria-describedby': fieldErrors[field] ? `new-${field === 'unitCode' ? 'unit' : field.toLowerCase()}-error` : undefined,
    className: `${INPUT_CLASS} ${fieldErrors[field] ? 'border-[#C62828]' : 'border-[#E2E8F0]'}`,
  })

  const users = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / 20)

  const filtered = users.filter(u =>
    !searchTerm ||
    u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.username.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-full" data-testid="user-management-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#0F172A]">{t('users.management.header.title')}</h1>
          <p className="text-sm text-[#64748B] mt-1">{t('users.management.header.subtitle')}</p>
        </div>
        <button
          onClick={openAddUser}
          className="bg-[#2E7D32] text-white hover:bg-[#1B5E20] rounded-lg px-4 py-2 flex items-center gap-2 text-sm font-medium transition-colors"
          data-testid="add-user-btn"
        >
          <Plus size={16} />
          {t('users.management.header.addUser')}
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
        <div className="max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" size={18} />
            <input
              type="text"
              placeholder={t('users.management.search.placeholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-[#E2E8F0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-[#1F3A5F] text-sm text-[#0F172A]"
              data-testid="user-search-input"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-[#64748B] text-sm">{t('common.states.loading')}</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="user-table">
                <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">{t('users.management.table.index')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">{t('users.management.table.username')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">{t('users.management.table.fullName')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">{t('users.management.table.roles')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">{t('users.management.table.unit')}</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#64748B] uppercase tracking-wide">{t('users.management.table.status')}</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-[#64748B] uppercase tracking-wide">{t('users.management.table.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {filtered.map((user, idx) => {
                    const roles = rolesOf(user)
                    const isActive = user.status === 'active'
                    return (
                      <tr key={user.id} className="hover:bg-[#F8FAFC] transition-colors" data-testid={`user-row-${user.id}`}>
                        <td className="px-6 py-4 text-sm text-[#64748B]">{(page - 1) * 20 + idx + 1}</td>
                        <td className="px-6 py-4 text-sm font-medium text-[#1F3A5F]">{user.username}</td>
                        <td className="px-6 py-4 text-sm font-medium text-[#0F172A]">{user.fullName}</td>
                        <td className="px-6 py-4">
                          {roles.length === 0 ? (
                            <span className="text-sm text-[#64748B]">{t('common.states.none')}</span>
                          ) : (
                            <ul className="flex flex-wrap gap-1" aria-label={t('users.management.table.rolesOf', { fullName: user.fullName })}>
                              {roles.map((code) => (
                                <li
                                  key={code}
                                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE_COLORS[code as UserRole] ?? 'bg-gray-100 text-[#64748B]'}`}
                                >
                                  {roleLabel(code)}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-[#64748B]">{user.unitScope ?? t('common.states.none')}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[user.status] ?? 'bg-gray-100 text-[#64748B]'}`}>
                            {t(statusLabelKey(user.status))}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => statusMutation.mutate({ id: user.id, status: isActive ? 'inactive' : 'active' })}
                              className="p-2 hover:bg-yellow-50 text-yellow-600 rounded-lg transition-colors"
                              title={isActive ? t('users.status.lock.title') : t('users.status.unlock.title')}
                              aria-label={
                                isActive
                                  ? t('users.status.lock.label', { username: user.username })
                                  : t('users.status.unlock.label', { username: user.username })
                              }
                              data-testid={`toggle-status-${user.id}`}
                            >
                              {isActive ? <Lock size={16} /> : <Unlock size={16} />}
                            </button>
                            <button
                              onClick={() => resetMutation.mutate(user.id)}
                              className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
                              title={t('users.resetPassword.action.title')}
                              aria-label={t('users.resetPassword.action.label', { username: user.username })}
                              data-testid={`reset-password-${user.id}`}
                            >
                              <Key size={16} />
                            </button>
                            {canResetMfa && user.id !== currentUser?.id && (
                              <button
                                onClick={() => setMfaResetTarget(user)}
                                className="p-2 hover:bg-red-50 text-[#C62828] rounded-lg transition-colors"
                                title={t('users.resetMfa.action.title')}
                                aria-label={t('users.resetMfa.action.label', { username: user.username })}
                                data-testid={`reset-mfa-${user.id}`}
                              >
                                <ShieldOff size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-[#E2E8F0] bg-[#F8FAFC]">
              <p className="text-sm text-[#64748B]" data-testid="user-count">
                <Trans
                  t={t}
                  i18nKey="users.management.pagination.summary"
                  values={{ shown: filtered.length, total }}
                  components={{ strong: <span className="font-medium text-[#0F172A]" /> }}
                />
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  aria-label={t('common.pagination.previous')}
                  className="p-2 rounded-lg border border-[#E2E8F0] disabled:opacity-40 hover:border-[#C62828] hover:text-[#C62828] transition-colors"
                  data-testid="prev-page"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-medium text-[#0F172A]">{page} / {totalPages || 1}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  aria-label={t('common.pagination.next')}
                  className="p-2 rounded-lg border border-[#E2E8F0] disabled:opacity-40 hover:border-[#C62828] hover:text-[#C62828] transition-colors"
                  data-testid="next-page"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={mfaResetTarget !== null}
        onOpenChange={(open) => {
          if (!open) setMfaResetTarget(null)
        }}
        title={t('users.resetMfa.confirm.title')}
        description={
          mfaResetTarget
            ? t('users.resetMfa.confirm.description', {
                username: mfaResetTarget.username,
                fullName: mfaResetTarget.fullName,
              })
            : ''
        }
        confirmLabel={t('users.resetMfa.confirm.confirmLabel')}
        cancelLabel={t('common.actions.cancel')}
        tone="danger"
        busy={resetMfaMutation.isPending}
        onConfirm={() => {
          if (mfaResetTarget) resetMfaMutation.mutate(mfaResetTarget)
        }}
      />

      {/* Reset Password Modal */}
      {resetPasswordResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" data-testid="reset-password-modal">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl border border-[#E2E8F0]">
            <h3 className="text-lg font-semibold text-[#0F172A] mb-2">{t('users.temporaryPassword.title')}</h3>
            <p className="text-sm text-[#64748B] mb-4">{t('users.temporaryPassword.description')}</p>
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-4 text-center">
              <span className="text-2xl font-mono font-bold text-[#C62828]" data-testid="temp-password">{resetPasswordResult.password}</span>
            </div>
            <button
              onClick={() => setResetPasswordResult(null)}
              className="w-full mt-4 bg-[#C62828] text-white hover:bg-[#A91D1D] rounded-lg px-4 py-2 font-medium transition-colors"
              data-testid="close-reset-modal"
            >
              {t('users.temporaryPassword.acknowledge')}
            </button>
          </div>
        </div>
      )}

      {/* Add User Modal — POST /admin/users; the password is generated by the server */}
      <Dialog
        open={showAddUser}
        onOpenChange={setShowAddUser}
        title={t('users.create.dialog.title')}
        description={t('users.create.dialog.description')}
        busy={createMutation.isPending}
        data-testid="add-user-modal"
        className="max-w-md"
      >
        <form onSubmit={submitNewUser} noValidate className="space-y-4">
          {formError && (
            <p role="alert" className="px-3 py-2 text-sm text-[#C62828] bg-red-50 border border-red-200 rounded-lg">
              {formError}
            </p>
          )}
          <div>
            <label htmlFor="new-username" className="block text-sm font-medium text-[#C62828] mb-1">
              {t('users.create.fields.username')} <span aria-hidden="true">*</span>
            </label>
            <input
              id="new-username"
              type="text"
              required
              autoComplete="off"
              value={newUser.username}
              onChange={e => updateField('username', e.target.value)}
              data-testid="new-username-input"
              {...fieldProps('username')}
            />
            <FieldError id="new-username-error" message={fieldErrors.username} />
          </div>
          <div>
            <label htmlFor="new-fullname" className="block text-sm font-medium text-[#C62828] mb-1">
              {t('users.create.fields.fullName')} <span aria-hidden="true">*</span>
            </label>
            <input
              id="new-fullname"
              type="text"
              required
              value={newUser.fullName}
              onChange={e => updateField('fullName', e.target.value)}
              data-testid="new-fullname-input"
              {...fieldProps('fullName')}
            />
            <FieldError id="new-fullname-error" message={fieldErrors.fullName} />
          </div>
          <div>
            <label htmlFor="new-role" className="block text-sm font-medium text-[#C62828] mb-1">
              {t('users.create.fields.role')} <span aria-hidden="true">*</span>
            </label>
            <select
              id="new-role"
              required
              value={newUser.role}
              onChange={e => updateField('role', e.target.value)}
              data-testid="new-role-select"
              {...fieldProps('role')}
            >
              {assignableRoles.map((code) => (
                <option key={code} value={code}>{roleLabel(code)}</option>
              ))}
            </select>
            <FieldError id="new-role-error" message={fieldErrors.role} />
          </div>
          <div>
            <label htmlFor="new-unit" className="block text-sm font-medium text-[#C62828] mb-1">{t('users.create.fields.unitCode')}</label>
            <input
              id="new-unit"
              type="text"
              value={newUser.unitCode}
              onChange={e => updateField('unitCode', e.target.value)}
              placeholder={t('users.create.fields.unitCodePlaceholder')}
              data-testid="new-unit-input"
              {...fieldProps('unitCode')}
            />
            <FieldError id="new-unit-error" message={fieldErrors.unitCode} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="new-email" className="block text-sm font-medium text-[#C62828] mb-1">{t('users.create.fields.email')}</label>
              <input
                id="new-email"
                type="email"
                value={newUser.email}
                onChange={e => updateField('email', e.target.value)}
                data-testid="new-email-input"
                {...fieldProps('email')}
              />
              <FieldError id="new-email-error" message={fieldErrors.email} />
            </div>
            <div>
              <label htmlFor="new-phone" className="block text-sm font-medium text-[#C62828] mb-1">{t('users.create.fields.phone')}</label>
              <input
                id="new-phone"
                type="tel"
                value={newUser.phone}
                onChange={e => updateField('phone', e.target.value)}
                data-testid="new-phone-input"
                {...fieldProps('phone')}
              />
              <FieldError id="new-phone-error" message={fieldErrors.phone} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowAddUser(false)}
              disabled={createMutation.isPending}
              className="border border-[#E2E8F0] text-[#64748B] hover:border-[#C62828] rounded-lg px-6 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {t('common.actions.cancel')}
            </button>
            <button
              type="submit"
              disabled={!newUser.username || !newUser.fullName || createMutation.isPending}
              className="bg-[#2E7D32] text-white hover:bg-[#1B5E20] rounded-lg px-6 py-2.5 text-sm font-medium disabled:opacity-60 transition-colors"
              data-testid="submit-add-user"
            >
              {createMutation.isPending ? t('users.create.submit.pending') : t('users.create.submit.idle')}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
