import { listAuditLogs } from '../repositories/auditRepository.js'

export const getAuditLogs = async (req, res) => {
  try {
    const result = await listAuditLogs({
      page: req.query.page,
      limit: req.query.limit,
      action: String(req.query.action || '').trim(),
      entityType: String(req.query.entityType || '').trim(),
    })
    res.json({
      items: result.items,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        pages: Math.max(1, Math.ceil(result.total / result.limit)),
      },
    })
  } catch (error) {
    res.status(400).json({
      message: error.message || 'Unable to load audit logs',
    })
  }
}
