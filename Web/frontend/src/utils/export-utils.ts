// Trigger file download from a blob response
export async function downloadExcelReport(
  fetchFn: () => Promise<Blob>,
  filename: string,
  onStart: () => void,
  onEnd: () => void,
): Promise<void> {
  onStart();
  try {
    const blob = await fetchFn();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  } finally {
    onEnd();
  }
}

export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}
