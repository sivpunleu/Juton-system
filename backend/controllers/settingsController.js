import { writeAuditLog } from '../repositories/auditRepository.js'
import {
  getSystemSettings,
  saveSystemSettings,
} from '../repositories/settingsRepository.js'

const cleanImage = (value) => {
  const image = String(value || '')
  if (!image) return ''
  if (!image.startsWith('data:image/')) {
    throw new Error('Uploaded image must be a valid image')
  }
  if (image.length > 2_500_000) {
    throw new Error('Uploaded image is too large')
  }
  return image
}

export const readSystemSettings = async (_req, res) => {
  try {
    res.json(await getSystemSettings())
  } catch (error) {
    res.status(400).json({
      message: error.message || 'Unable to load system settings',
    })
  }
}

export const updateSystemSettings = async (req, res) => {
  try {
    const phones = Array.isArray(req.body.phones)
      ? req.body.phones
      : String(req.body.phones || '').split(',')
    const payload = {
      companyName: String(req.body.companyName || '').trim(),
      companyNameKh: String(req.body.companyNameKh || '').trim(),
      address: String(req.body.address || '').trim(),
      telegram: String(req.body.telegram || '').trim(),
      phones: phones.map((phone) => String(phone).trim()).filter(Boolean),
      paymentAccount: String(req.body.paymentAccount || '').trim(),
      invoiceNotes: String(req.body.invoiceNotes || '').trim(),
      footerKh: String(req.body.footerKh || '').trim(),
      footerEn: String(req.body.footerEn || '').trim(),
      logo: cleanImage(req.body.logo),
      jotunLogo: cleanImage(req.body.jotunLogo),
      paymentQr: cleanImage(req.body.paymentQr),
      sellerSignature: cleanImage(req.body.sellerSignature),
      updatedBy: req.admin.username,
    }
    if (!payload.companyName && !payload.companyNameKh) {
      throw new Error('Company name is required')
    }

    const settings = await saveSystemSettings(payload)
    await writeAuditLog({
      actor: req.admin,
      action: 'update',
      entityType: 'settings',
      entityId: 'default',
      summary: 'System settings',
    })
    res.json(settings)
  } catch (error) {
    res.status(400).json({
      message: error.message || 'Unable to save system settings',
    })
  }
}
