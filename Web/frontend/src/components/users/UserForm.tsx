// US-SS-08: UserForm — create an account through POST /admin/users (admin.controller.ts, CreateUserBodyDto)
// with the unit picked in a SmartSelect; the server generates the password and returns it once
import { useState, useCallback, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { SmartSelect } from '@/components/ui/SmartSelect'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
  CREATE_USER_ERROR_FIELDS,
  CREATE_USER_VALIDATION_FIELDS,
  OFFICE_STAFF_ASSIGNABLE_ROLES,
  PHONE_PATTERN,
  USERNAME_PATTERN,
  buildCreateUserBody,
  createUser,
  type CreateUserField,
} from '@/api/admin'
import { unitsApi } from '@/api/users'
import { useRbac } from '@/hooks/useRbac'
import {
  describeApiError,
  errorCodeText,
  mapValidationErrors,
  parseApiError,
  validationFormMessage,
} from '@/lib/api-error'
import { ROLE_PRIORITY, roleLabel } from '@/lib/roles'
import type { SmartSelectOption, UnitSearchItem, UserRole } from '@/types'

// The user list this form belongs to (pageRoutes.ts /users/*)
const USER_LIST_PATH = '/users'

// CreateUserBodyDto rules; messages are read when the form is built, in the current language
function buildSchema(t: TFunction, assignableRoles: readonly UserRole[]) {
  return z.object({
    username: z.string().trim().regex(USERNAME_PATTERN, t('users.create.validation.username')),
    fullName: z.string().trim().min(1, t('users.create.validation.fullNameRequired')),
    role: z
      .string()
      .refine((value) => (assignableRoles as readonly string[]).includes(value), t('users.form.validation.roleRequired')),
    unitCode: z.string(),
    email: z
      .string()
      .trim()
      .refine((value) => value === '' || z.string().email().safeParse(value).success, t('users.create.validation.emailInvalid')),
    phone: z
      .string()
      .trim()
      .refine((value) => value === '' || PHONE_PATTERN.test(value), t('users.create.validation.phoneInvalid')),
  })
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>

const EMPTY_FORM: FormValues = { username: '', fullName: '', role: '', unitCode: '', email: '', phone: '' }

function toSmartSelectOption(u: UnitSearchItem): SmartSelectOption {
  return {
    id: u.id,
    label: u.name,
    sublabel: [u.code, u.parentCode].filter(Boolean).join(' / '),
    meta: u as unknown as Record<string, unknown>,
  }
}

interface CreatedAccount {
  username: string
  password: string
}

// The one-time password of the account just created: shown until acknowledged, never stored
function TemporaryPasswordPanel({ account, onDismiss }: { account: CreatedAccount; onDismiss: () => void }) {
  const { t } = useTranslation()
  const [copyStatus, setCopyStatus] = useState<string | null>(null)

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(account.password)
      setCopyStatus(t('users.temporaryPassword.copied'))
    } catch {
      setCopyStatus(t('users.temporaryPassword.copyFailed'))
    }
  }

  return (
    <div data-testid="user-create-success" className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-2">
      <p className="text-sm font-medium text-green-700">{t('users.form.created.title', { username: account.username })}</p>
      <h3 className="text-base font-semibold text-slate-800">{t('users.temporaryPassword.title')}</h3>
      <p className="text-sm text-slate-600">{t('users.temporaryPassword.description')}</p>
      <p className="rounded-md border border-slate-200 bg-white p-3 text-center">
        <span data-testid="temp-password" className="font-mono text-xl font-bold text-[#C62828]">{account.password}</span>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" onClick={copyPassword}>
          {t('users.temporaryPassword.copy')}
        </Button>
        <Button type="button" onClick={onDismiss}>
          {t('users.temporaryPassword.acknowledge')}
        </Button>
        <Link to={USER_LIST_PATH} className="text-sm font-medium text-blue-700 hover:underline">
          {t('users.form.actions.backToList')}
        </Link>
      </div>
      {copyStatus && (
        <p role="status" className="text-xs text-slate-600">
          {copyStatus}
        </p>
      )}
    </div>
  )
}

interface UserFormProps {
  onSuccess?: () => void
}

export function UserForm({ onSuccess }: UserFormProps) {
  const { t } = useTranslation()
  const { hasRole } = useRbac()
  const queryClient = useQueryClient()
  const [unitId, setUnitId] = useState('')
  const [unitQuery, setUnitQuery] = useState('')
  const [created, setCreated] = useState<CreatedAccount | null>(null)

  // Roles the signed-in user may assign (AdminService.assertAssignableRole)
  const isSystemAdmin = hasRole('system_admin')
  const isOfficeStaff = hasRole('office_staff')
  const assignableRoles = useMemo<readonly UserRole[]>(
    () => (isSystemAdmin ? ROLE_PRIORITY : isOfficeStaff ? OFFICE_STAFF_ASSIGNABLE_ROLES : []),
    [isSystemAdmin, isOfficeStaff],
  )
  const schema = useMemo(() => buildSchema(t, assignableRoles), [t, assignableRoles])

  const { data: unitOptions = [], isFetching: unitLoading } = useQuery({
    queryKey: ['units-search', unitQuery],
    queryFn: () => unitsApi.search({ q: unitQuery, limit: 20 }),
    select: (data) => data.map(toSmartSelectOption),
  })

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_FORM })

  const resetForm = () => {
    reset(EMPTY_FORM)
    setUnitId('')
  }

  const createMutation = useMutation({
    mutationFn: (values: FormValues) => createUser(buildCreateUserBody({ ...values, role: values.role as UserRole })),
    onSuccess: (result) => {
      toast.success(t('users.form.submit.success'))
      setCreated({ username: result.username, password: result.temporaryPassword })
      resetForm()
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      onSuccess?.()
    },
    onError: (err) => {
      const { code } = parseApiError(err)
      const field = code ? CREATE_USER_ERROR_FIELDS[code] : undefined
      const fieldText = code && field ? errorCodeText('admin', code) : null
      if (field && fieldText) {
        setError(field, { type: 'server', message: fieldText })
        return
      }
      const validation = mapValidationErrors(err, CREATE_USER_VALIDATION_FIELDS)
      if (validation) {
        for (const [name, message] of Object.entries(validation.fieldErrors) as [CreateUserField, string][]) {
          setError(name, { type: 'server', message })
        }
        const formMessage = validationFormMessage(validation.otherErrors)
        if (formMessage) toast.error(formMessage)
        return
      }
      toast.error(describeApiError(err, { scope: 'admin', fallback: 'users.form.submit.error' }))
    },
  })

  const handleUnitChange = useCallback(
    (id: string) => {
      setUnitId(id)
      const opt = unitOptions.find((o) => o.id === id)
      if (opt) {
        setValue('unitCode', (opt.meta as unknown as UnitSearchItem).code, { shouldValidate: true })
      }
    },
    [setValue, unitOptions],
  )

  const handleUnitClear = useCallback(() => {
    setUnitId('')
    setValue('unitCode', '')
  }, [setValue])

  const onSubmit = handleSubmit((data) => {
    createMutation.mutate(data)
  })

  return (
    <form
      data-testid="user-form"
      onSubmit={onSubmit}
      className="space-y-4 max-w-xl"
      noValidate
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">{t('users.form.page.title')}</h2>
          <p className="text-sm text-slate-500">{t('users.form.page.description')}</p>
        </div>
        <Link to={USER_LIST_PATH} className="text-sm font-medium text-blue-700 hover:underline">
          {t('users.form.actions.backToList')}
        </Link>
      </div>

      {created && <TemporaryPasswordPanel account={created} onDismiss={() => setCreated(null)} />}

      <Input
        id="user-username"
        data-testid="user-username-input"
        label={t('users.form.fields.username')}
        placeholder={t('users.form.fields.usernamePlaceholder')}
        maxLength={50}
        autoComplete="off"
        error={!!errors.username}
        errorMessage={errors.username?.message}
        {...register('username')}
      />

      <Input
        id="user-fullname"
        label={t('users.form.fields.fullName')}
        placeholder={t('users.form.fields.fullNamePlaceholder')}
        maxLength={255}
        error={!!errors.fullName}
        errorMessage={errors.fullName?.message}
        {...register('fullName')}
      />

      {/* Role */}
      <div className="flex flex-col gap-1">
        <label htmlFor="user-role" className="text-sm font-medium text-slate-700">{t('users.form.fields.role')}</label>
        <select
          id="user-role"
          data-testid="user-role-select"
          aria-invalid={errors.role ? 'true' : 'false'}
          aria-describedby={errors.role ? 'user-role-error' : undefined}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          {...register('role')}
        >
          <option value="">{t('users.form.fields.rolePlaceholder')}</option>
          {assignableRoles.map((code) => (
            <option key={code} value={code}>{roleLabel(code)}</option>
          ))}
        </select>
        {errors.role && (
          <p id="user-role-error" data-testid="user-role-error" role="alert" className="text-xs text-red-500">
            {errors.role.message}
          </p>
        )}
      </div>

      {/* Unit SmartSelect */}
      <SmartSelect
        name="unit"
        label={t('users.form.fields.unit')}
        placeholder={t('users.form.fields.unitPlaceholder')}
        value={unitId}
        onChange={(id) => handleUnitChange(id)}
        onClear={handleUnitClear}
        options={unitOptions}
        isLoading={unitLoading}
        error={!!errors.unitCode}
        errorMessage={errors.unitCode?.message}
        onSearch={setUnitQuery}
      />

      <Input
        id="user-email"
        type="email"
        data-testid="user-email-input"
        label={t('users.form.fields.email')}
        placeholder={t('users.form.fields.emailPlaceholder')}
        maxLength={255}
        error={!!errors.email}
        errorMessage={errors.email?.message}
        {...register('email')}
      />

      <Input
        id="user-phone"
        type="tel"
        label={t('users.form.fields.phone')}
        placeholder={t('users.form.fields.phonePlaceholder')}
        maxLength={20}
        error={!!errors.phone}
        errorMessage={errors.phone?.message}
        {...register('phone')}
      />

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={resetForm}>
          {t('users.form.actions.reset')}
        </Button>
        <Button
          type="submit"
          data-testid="user-submit-btn"
          loading={createMutation.isPending}
        >
          {t('users.form.actions.submit')}
        </Button>
      </div>
    </form>
  )
}
