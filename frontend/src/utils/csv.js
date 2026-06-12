const normalizeHeader = (value) =>
  String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')

export const parseCsv = (text) => {
  const rows = []
  let row = []
  let value = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    const next = text[index + 1]

    if (character === '"') {
      if (quoted && next === '"') {
        value += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      row.push(value.trim())
      value = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1
      row.push(value.trim())
      if (row.some((cell) => cell !== '')) rows.push(row)
      row = []
      value = ''
    } else {
      value += character
    }
  }

  row.push(value.trim())
  if (row.some((cell) => cell !== '')) rows.push(row)
  if (quoted) throw new Error('CSV contains an unclosed quoted value')
  if (rows.length < 2) throw new Error('CSV must include a header and data rows')

  const headers = rows[0].map(normalizeHeader)
  return rows.slice(1).map((cells, rowIndex) => {
    const record = { __row: rowIndex + 2 }
    headers.forEach((header, columnIndex) => {
      record[header] = String(cells[columnIndex] || '').trim()
    })
    return record
  })
}

const csvValue = (value) => {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export const downloadCsvTemplate = (filename, headers, example) => {
  const content = [
    headers.map(csvValue).join(','),
    example.map(csvValue).join(','),
  ].join('\r\n')
  const blob = new Blob([`\uFEFF${content}`], {
    type: 'text/csv;charset=utf-8',
  })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
