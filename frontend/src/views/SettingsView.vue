<script setup>
import { onMounted, reactive, ref } from 'vue'
import { authApi } from '../api/invoices'
import { currentAdmin, isOwner } from '../auth/session'
import TableSkeleton from '../components/TableSkeleton.vue'
import {
  requestConfirmation,
  showToast,
  validateForm,
} from '../ui/feedback'

const error = ref('')
const loadingAdmins = ref(false)
const creatingAdmin = ref(false)
const admins = ref([])
const adminForm = reactive({
  username: '',
  displayName: '',
  password: '',
  role: 'admin',
})

const showMessage = (message) => {
  error.value = ''
  showToast(message)
}

const loadAdmins = async () => {
  if (!isOwner.value) return
  loadingAdmins.value = true
  try {
    admins.value = (await authApi.listAdmins()).data
  } catch (requestError) {
    error.value = requestError.response?.data?.message || 'Unable to load admins'
  } finally {
    loadingAdmins.value = false
  }
}

const createAdmin = async (event) => {
  if (!(await validateForm(event?.currentTarget))) return

  creatingAdmin.value = true
  error.value = ''
  try {
    await authApi.createAdmin(adminForm)
    Object.assign(adminForm, {
      username: '',
      displayName: '',
      password: '',
      role: 'admin',
    })
    showMessage('Admin account created')
    await loadAdmins()
  } catch (requestError) {
    error.value = requestError.response?.data?.message || 'Unable to create admin'
    showToast(error.value, 'error')
  } finally {
    creatingAdmin.value = false
  }
}

const updateAdmin = async (admin, payload) => {
  error.value = ''
  try {
    await authApi.updateAdmin(admin.id, payload)
    showMessage('Admin updated')
    await loadAdmins()
  } catch (requestError) {
    error.value = requestError.response?.data?.message || 'Unable to update admin'
    showToast(error.value, 'error')
  }
}

const resetAdminPassword = async (admin) => {
  const password = await requestConfirmation({
    title: 'Reset Admin Password',
    message: `កំណត់ password ថ្មីសម្រាប់ ${admin.username}`,
    confirmLabel: 'Update Password',
    cancelLabel: 'Cancel',
    tone: 'primary',
    inputType: 'password',
    inputLabel: 'New Password',
    inputPlaceholder: 'Minimum 10 characters',
    inputMinLength: 10,
  })
  if (!password) return
  await updateAdmin(admin, { password })
}

const toggleAdmin = async (admin) => {
  if (admin.active) {
    const confirmed = await requestConfirmation({
      title: 'Disable Admin?',
      message: `${admin.displayName || admin.username} នឹងមិនអាច Login បានទៀតទេ រហូតដល់អ្នក Enable វិញ។`,
      confirmLabel: 'Disable',
      cancelLabel: 'Cancel',
      tone: 'danger',
    })
    if (!confirmed) return
  }

  await updateAdmin(admin, { active: !admin.active })
}

onMounted(loadAdmins)
</script>

<template>
  <section class="container page-section">
    <div class="page-heading">
      <div>
        <span class="eyebrow">ADMIN MANAGEMENT</span>
        <h1>Admin Accounts</h1>
        <p>បង្កើត Admin និងកំណត់សិទ្ធិអ្នកប្រើប្រាស់។</p>
      </div>
      <span class="role-badge">{{ currentAdmin?.role }}</span>
    </div>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>
    <template v-if="isOwner">
      <div class="content-card form-card mb-4">
        <div class="section-title">
          <span class="section-number"><i class="bi bi-person-plus"></i></span>
          <div><h2>បង្កើត Admin</h2><p>Owner គ្រប់គ្រងបានទាំងអស់, Admin គ្រប់គ្រងការលក់, Viewer មើលតែប៉ុណ្ណោះ។</p></div>
        </div>
        <form class="row g-3" novalidate @submit.prevent="createAdmin">
          <div class="col-md-3">
            <label class="form-label">Username *</label>
            <input
              v-model.trim="adminForm.username"
              class="form-control"
              minlength="3"
              maxlength="40"
              pattern="[A-Za-z0-9._-]+"
              required
            />
          </div>
          <div class="col-md-3">
            <label class="form-label">Display Name</label>
            <input v-model.trim="adminForm.displayName" class="form-control" />
          </div>
          <div class="col-md-3">
            <label class="form-label">Password *</label>
            <input v-model="adminForm.password" class="form-control" type="password" minlength="10" required />
          </div>
          <div class="col-md-3">
            <label class="form-label">Role *</label>
            <select v-model="adminForm.role" class="form-select" required>
              <option value="admin">Admin</option>
              <option value="viewer">Viewer</option>
              <option value="owner">Owner</option>
            </select>
          </div>
          <div class="col-12">
            <button class="btn btn-danger" type="submit" :disabled="creatingAdmin">
              {{ creatingAdmin ? 'កំពុងបង្កើត...' : 'បង្កើត Admin' }}
            </button>
          </div>
        </form>
      </div>

      <div class="content-card">
        <div class="card-toolbar"><h2 class="panel-title mb-0">Admin Accounts</h2></div>
        <TableSkeleton v-if="loadingAdmins" />
        <div v-else class="table-responsive">
          <table class="table invoice-table responsive-table mb-0">
            <thead><tr><th>Admin</th><th>Role</th><th>Status</th><th>Last Login</th><th class="text-end">Actions</th></tr></thead>
            <tbody>
              <tr v-for="admin in admins" :key="admin.id">
                <td class="mobile-card-primary" data-label="Admin"><strong>{{ admin.displayName || admin.username }}</strong><small class="d-block text-secondary">{{ admin.username }}</small></td>
                <td data-label="Role">
                  <select
                    class="form-select form-select-sm role-select"
                    :value="admin.role"
                    :disabled="String(admin.id) === String(currentAdmin?.id)"
                    @change="updateAdmin(admin, { role: $event.target.value })"
                  >
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </td>
                <td data-label="Status"><span class="status-pill" :class="admin.active ? 'status-paid' : 'status-cancelled'">{{ admin.active ? 'Active' : 'Disabled' }}</span></td>
                <td data-label="Last Login">{{ admin.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleString() : '-' }}</td>
                <td class="text-end text-nowrap mobile-card-actions" data-label="Actions">
                  <button class="btn btn-sm btn-outline-secondary me-1" type="button" @click="resetAdminPassword(admin)">Reset Password</button>
                  <button
                    v-if="String(admin.id) !== String(currentAdmin?.id)"
                    class="btn btn-sm"
                    :class="admin.active ? 'btn-outline-danger' : 'btn-outline-success'"
                    type="button"
                    @click="toggleAdmin(admin)"
                  >
                    {{ admin.active ? 'Disable' : 'Enable' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </section>
</template>
