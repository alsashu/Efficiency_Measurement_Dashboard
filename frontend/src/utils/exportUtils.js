import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const exportToExcel = (data, filename = 'export', sheetName = 'Data') => {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const colWidths = Object.keys(data[0] || {}).map(k => ({ wch: Math.max(k.length, 15) }));
  ws['!cols'] = colWidths;
  XLSX.writeFile(wb, `${filename}.xlsx`);
};

export const exportToCSV = (data, filename = 'export') => {
  const ws = XLSX.utils.json_to_sheet(data);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  link.click();
};

export const exportToPDF = (data, columns, title = 'Report', filename = 'export') => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFillColor(30, 50, 70);
  doc.rect(0, 0, 297, 18, 'F');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 10, 12);
  doc.setFontSize(8);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 230, 12, { align: 'right' });

  autoTable(doc, {
    head: [columns.map(c => c.header)],
    body: data.map(row => columns.map(c => {
      const v = row[c.accessorKey];
      return v == null ? '' : typeof v === 'number' ? v.toLocaleString() : String(v);
    })),
    startY: 22,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [30, 50, 70], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: 5, right: 5 },
  });

  doc.save(`${filename}.pdf`);
};

export const formatNumber = (n, decimals = 0) => {
  if (n == null || isNaN(n)) return '—';
  return parseFloat(n).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

export const formatPct = (n) => {
  if (n == null || isNaN(n)) return '—';
  return `${(parseFloat(n)).toFixed(1)}%`;
};
