// Raw Windows print-queue output via winspool.drv (WritePrinter).
//
// `Out-Printer` is a TEXT cmdlet: piping `Get-Content -Encoding Byte` (a byte[])
// into it prints each byte's decimal value — i.e. "27 64 …" — instead of the raw
// ESC/POS payload. Sending bytes to a Windows driver queue therefore has to go
// through the RawPrinter API (OpenPrinter → StartDoc → WritePrinter).
//
// Windows-only (winspool.drv); called with powershell.exe (Windows PowerShell),
// where this compiles and runs on 2.0+.

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// __TMP__ / __PRINTER__ are substituted below (single quotes escaped for PS).
const RAW_PRINT_SCRIPT = `
$path = '__TMP__'
$printer = '__PRINTER__'
$sig = @'
using System;
using System.Runtime.InteropServices;
public class WehaRawPrint {
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool OpenPrinter(string pPrinterName, out IntPtr hPrinter, IntPtr pDefault);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct DocInfo1 { public string pDocName; public string pOutputFile; public string pDatatype; }
  // CharSet.Unicode is required: without it .NET binds StartDocPrinterA while
  // DocInfo1 marshals wide strings, so the spooler reads a garbage pDatatype
  // and fails with ERROR_INVALID_DATATYPE (1804).
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern int StartDocPrinter(IntPtr hPrinter, int level, ref DocInfo1 pDocInfo);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBuf, int cbBuf, out int pcWritten);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  public static void Print(string printer, byte[] bytes) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero))
      throw new Exception("OpenPrinter failed: " + Marshal.GetLastWin32Error());
    try {
      var di = new DocInfo1 { pDocName = "Document", pOutputFile = null, pDatatype = "RAW" };
      if (StartDocPrinter(h, 1, ref di) == 0)
        throw new Exception("StartDocPrinter failed: " + Marshal.GetLastWin32Error());
      try {
        StartPagePrinter(h);
        int written;
        if (!WritePrinter(h, bytes, bytes.Length, out written))
          throw new Exception("WritePrinter failed: " + Marshal.GetLastWin32Error());
        EndPagePrinter(h);
      } finally {
        EndDocPrinter(h);
      }
    } finally {
      ClosePrinter(h);
    }
  }
}
'@
Add-Type -TypeDefinition $sig -ErrorAction Stop
[WehaRawPrint]::Print($printer, [System.IO.File]::ReadAllBytes($path))
`;

/** Write raw bytes to a local Windows printer queue (driver / "Windows printer"). */
export function sendToWindowsDriver(printerName: string, bytes: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(os.tmpdir(), `print-${Date.now()}.prn`);
    fs.writeFileSync(tmpFile, Buffer.from(bytes));
    const command = RAW_PRINT_SCRIPT
      .replace('__TMP__', tmpFile.replace(/'/g, "''"))
      .replace('__PRINTER__', printerName.replace(/'/g, "''"));
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], (err) => {
      fs.unlink(tmpFile, () => {});
      if (err) reject(err);
      else resolve();
    });
  });
}
