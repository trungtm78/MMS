import client from './client'

export interface ProfileData {
  id: string
  username: string
  fullName: string
  email: string | null
  phone: string | null
  status: string
  role: string
  unitScope: string | null
  createdAt: string
  updatedAt: string
}

export interface UpdateProfileDto {
  fullName?: string
  email?: string
  phone?: string
}

export interface ChangePasswordDto {
  currentPassword: string
  newPassword: string
}

export async function getProfile(): Promise<ProfileData> {
  const res = await client.get('/users/me')
  return res.data
}

export async function updateProfile(dto: UpdateProfileDto): Promise<ProfileData> {
  const res = await client.patch('/users/me', dto)
  return res.data
}

export async function changePassword(dto: ChangePasswordDto): Promise<void> {
  await client.post('/users/me/change-password', dto)
}
