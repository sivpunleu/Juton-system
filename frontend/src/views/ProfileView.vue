<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { authApi } from '../api/invoices'
import {
  currentAdmin,
  updateCurrentAdmin,
} from '../auth/session'
import ContentSkeleton from '../components/ContentSkeleton.vue'
import PaginationControls from '../components/PaginationControls.vue'
import TableSkeleton from '../components/TableSkeleton.vue'
import {
  requestConfirmation,
  showToast,
  validateForm,
} from '../ui/feedback'

const loading = ref(true)
const saving = ref(false)
const changingPassword = ref(false)
const loadingActivity = ref(false)
const error = ref('')
const activity = ref([])
const profile = reactive({
  id: '',
  username: '',
  displayName: '',
  avatar: '',
  role: '',
  active: true,
  lastLoginAt: null,
  createdAt: null,
})
const passwordForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})
const pagination = reactive({
  page: 1,
  limit: 10,
  total: 0,
  pages: 1,
})

const initials = computed(() => {
  const source = profile.displayName || profile.username || 'A'
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
})

const formatTimestamp = (value) => {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

const showSuccess = (message) => {
  error.value = ''
  showToast(message)
}

const loadProfile = async () => {
  const { data } = await authApi.profile()
  Object.assign(profile, data.admin)
  updateCurrentAdmin(data.admin)
}

const loadActivity = async (page = pagination.page) => {
  loadingActivity.value = true
  try {
    const { data } = await authApi.profileActivity({
      page,
      limit: pagination.limit,
    })
    activity.value = data.items || []
    Object.assign(pagination, data.pagination)
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'Unable to load activity'
  } finally {
    loadingActivity.value = false
  }
}

const initialize = async () => {
  loading.value = true
  error.value = ''
  try {
    await Promise.all([loadProfile(), loadActivity(1)])
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'Unable to load profile'
  } finally {
    loading.value = false
  }
}

const resizeAvatar = (file) =>
  new Promise((resolve, reject) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      reject(new Error('Please choose a PNG, JPEG, or WebP image'))
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      reject(new Error('Profile image must be smaller than 5 MB'))
      return
    }

    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Unable to read profile image'))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error('Invalid profile image'))
      image.onload = () => {
        const size = Math.min(image.width, image.height)
        const sourceX = (image.width - size) / 2
        const sourceY = (image.height - size) / 2
        const canvas = document.createElement('canvas')
        canvas.width = 240
        canvas.height = 240
        const context = canvas.getContext('2d')
        context.drawImage(
          image,
          sourceX,
          sourceY,
          size,
          size,
          0,
          0,
          240,
          240,
        )
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      image.src = reader.result
    }
    reader.readAsDataURL(file)
  })

const chooseAvatar = async (event) => {
  const [file] = event.target.files || []
  if (!file) return
  error.value = ''
  try {
    profile.avatar = await resizeAvatar(file)
  } catch (imageError) {
    error.value = imageError.message
  } finally {
    event.target.value = ''
  }
}

const removeAvatar = async () => {
  const confirmed = await requestConfirmation({
    title: 'លុបរូប Profile?',
    message: 'រូប Profile នឹងត្រូវដកចេញនៅពេលអ្នករក្សាទុក។',
    confirmLabel: 'លុបរូប',
    cancelLabel: 'បោះបង់',
    tone: 'danger',
  })
  if (confirmed) profile.avatar = ''
}

const saveProfile = async (event) => {
  if (!(await validateForm(event?.currentTarget))) return

  saving.value = true
  error.value = ''
  try {
    const { data } = await authApi.updateProfile({
      displayName: profile.displayName,
      avatar: profile.avatar,
    })
    Object.assign(profile, data.admin)
    updateCurrentAdmin(data.admin)
    showSuccess('Profile updated successfully')
    await loadActivity(1)
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'Unable to update profile'
    showToast(error.value, 'error')
  } finally {
    saving.value = false
  }
}

const changePassword = async (event) => {
  error.value = ''
  const customMessage =
    passwordForm.newPassword !== passwordForm.confirmPassword
      ? 'Password ថ្មី និង Confirm Password មិនដូចគ្នាទេ។'
      : passwordForm.currentPassword === passwordForm.newPassword
        ? 'Password ថ្មីត្រូវតែខុសពី Password បច្ចុប្បន្ន។'
        : ''
  if (
    !(await validateForm(event?.currentTarget, {
      customMessage,
    }))
  ) return

  changingPassword.value = true
  try {
    await authApi.changePassword({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    })
    Object.assign(passwordForm, {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    })
    showSuccess('Password changed successfully')
    await loadActivity(1)
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'Unable to change password'
    showToast(error.value, 'error')
  } finally {
    changingPassword.value = false
  }
}

onMounted(initialize)
</script>

<template>
  <section class="container page-section profile-page">
    <div class="page-heading">
      <div>
        <span class="eyebrow">MY ACCOUNT</span>
        <h1>Profile</h1>
        <p>គ្រប់គ្រងព័ត៌មានផ្ទាល់ខ្លួន សុវត្ថិភាព និងសកម្មភាពរបស់អ្នក។</p>
      </div>
      <span class="role-badge">{{ profile.role || currentAdmin?.role }}</span>
    </div>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>
    <ContentSkeleton v-if="loading" :cards="2" />

    <template v-else>
      <div class="row g-4">
        <div class="col-lg-4">
          <div class="content-card profile-summary-card">
            <div class="profile-avatar">
              <img
                v-if="profile.avatar"
                :src="profile.avatar"
                alt="Profile"
              />
              <span v-else>{{ initials }}</span>
            </div>
            <h2>{{ profile.displayName || profile.username }}</h2>
            <p>@{{ profile.username }}</p>
            <span class="role-badge">{{ profile.role }}</span>

            <dl class="profile-meta">
              <div>
                <dt>Status</dt>
                <dd>{{ profile.active ? 'Active' : 'Disabled' }}</dd>
              </div>
              <div>
                <dt>Last Login</dt>
                <dd>{{ formatTimestamp(profile.lastLoginAt) }}</dd>
              </div>
              <div>
                <dt>Member Since</dt>
                <dd>{{ formatTimestamp(profile.createdAt) }}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div class="col-lg-8">
          <div class="content-card form-card mb-4">
            <div class="section-title">
              <span class="section-number"><i class="bi bi-person"></i></span>
              <div>
                <h2>ព័ត៌មាន Profile</h2>
                <p>Username និង Role អាចកែបានតែដោយ Owner ប៉ុណ្ណោះ។</p>
              </div>
            </div>

            <form novalidate @submit.prevent="saveProfile">
              <div class="row g-3">
                <div class="col-md-6">
                  <label class="form-label">Username</label>
                  <input
                    :value="profile.username"
                    class="form-control"
                    disabled
                  />
                </div>
                <div class="col-md-6">
                  <label class="form-label">Role</label>
                  <input
                    :value="profile.role"
                    class="form-control text-capitalize"
                    disabled
                  />
                </div>
                <div class="col-12">
                  <label class="form-label">Display Name *</label>
                  <input
                    v-model.trim="profile.displayName"
                    class="form-control"
                    minlength="2"
                    maxlength="80"
                    required
                  />
                </div>
                <div class="col-12">
                  <label class="form-label">Profile Image</label>
                  <div class="profile-image-actions">
                    <label class="btn btn-outline-primary mb-0">
                      <i class="bi bi-image me-1"></i> ជ្រើសរូប
                      <input
                        class="visually-hidden"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        @change="chooseAvatar"
                      />
                    </label>
                    <button
                      v-if="profile.avatar"
                      class="btn btn-outline-danger"
                      type="button"
                      @click="removeAvatar"
                    >
                      <i class="bi bi-trash3 me-1"></i> លុបរូប
                    </button>
                    <small>PNG, JPEG ឬ WebP · អតិបរមា 5 MB</small>
                  </div>
                </div>
              </div>
              <button
                class="btn btn-danger mt-4"
                type="submit"
                :disabled="saving"
              >
                {{ saving ? 'កំពុងរក្សាទុក...' : 'រក្សាទុក Profile' }}
              </button>
            </form>
          </div>

          <div class="content-card form-card">
            <div class="section-title">
              <span class="section-number"><i class="bi bi-key"></i></span>
              <div>
                <h2>Change Password</h2>
                <p>ប្រើ password យ៉ាងតិច 10 តួអក្សរ។</p>
              </div>
            </div>
            <form class="row g-3" novalidate @submit.prevent="changePassword">
              <div class="col-md-4">
                <label class="form-label">Current Password *</label>
                <input
                  v-model="passwordForm.currentPassword"
                  class="form-control"
                  type="password"
                  autocomplete="current-password"
                  required
                />
              </div>
              <div class="col-md-4">
                <label class="form-label">New Password *</label>
                <input
                  v-model="passwordForm.newPassword"
                  class="form-control"
                  type="password"
                  minlength="10"
                  autocomplete="new-password"
                  required
                />
              </div>
              <div class="col-md-4">
                <label class="form-label">Confirm Password *</label>
                <input
                  v-model="passwordForm.confirmPassword"
                  class="form-control"
                  type="password"
                  minlength="10"
                  autocomplete="new-password"
                  required
                />
              </div>
              <div class="col-12">
                <button
                  class="btn btn-outline-danger"
                  type="submit"
                  :disabled="changingPassword"
                >
                  {{ changingPassword ? 'កំពុងប្ដូរ...' : 'ប្ដូរ Password' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div class="content-card mt-4">
        <div class="card-toolbar">
          <div>
            <h2 class="panel-title mb-1">សកម្មភាពរបស់ខ្ញុំ</h2>
            <small class="text-secondary">Login, profile, password និងសកម្មភាពគ្រប់គ្រងថ្មីៗ។</small>
          </div>
          <button
            class="btn btn-outline-secondary"
            type="button"
            @click="loadActivity(pagination.page)"
          >
            <i class="bi bi-arrow-clockwise"></i>
          </button>
        </div>
        <TableSkeleton v-if="loadingActivity" />
        <div v-else-if="!activity.length" class="empty-state">
          <div class="empty-icon"><i class="bi bi-activity"></i></div>
          <h3>មិនទាន់មានសកម្មភាព</h3>
          <p>សកម្មភាពថ្មីរបស់គណនីនឹងបង្ហាញនៅទីនេះ។</p>
        </div>
        <div v-else class="table-responsive">
          <table class="table invoice-table responsive-table mb-0">
            <thead>
              <tr>
                <th>ពេលវេលា</th>
                <th>សកម្មភាព</th>
                <th>ប្រភេទ</th>
                <th>ព័ត៌មាន</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in activity" :key="item.id">
                <td class="text-nowrap mobile-card-primary" data-label="ពេលវេលា">{{ formatTimestamp(item.createdAt) }}</td>
                <td data-label="សកម្មភាព"><span class="audit-action">{{ item.action }}</span></td>
                <td data-label="ប្រភេទ">{{ item.entityType }}</td>
                <td data-label="ព័ត៌មាន">{{ item.summary || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <PaginationControls :pagination="pagination" @change="loadActivity" />
      </div>
    </template>
  </section>
</template>
