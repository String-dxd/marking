"""
Utility to compile the native GUI launcher tallus.exe (if needed)
and configure Windows shortcuts with explicit AppUserModelID and Tallus branding.
Ensures zero terminal windows and guarantees the Windows Taskbar shows the monochrome Tallus icon.
"""

import os
import sys
import ctypes
import subprocess
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
TALLUS_EXE = BASE_DIR / "tallus.exe"
ICON_FILE = BASE_DIR / "tallus.ico"
APP_USER_MODEL_ID = "Tallus.AIMarker.App"

def compile_launcher():
    """Ensure tallus.exe is compiled with native Windows GUI subsystem, AppUserModelID, and embedded icon."""
    csc_path = Path(r"C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe")
    if not csc_path.exists():
        csc_path = Path(r"C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe")

    if not csc_path.exists():
        print("[Launcher] Warning: csc.exe compiler not found.")
        return

    cs_code = f"""
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;

namespace TallusLauncher
{{
    class Program
    {{
        [DllImport("shell32.dll", SetLastError = true)]
        public static extern int SetCurrentProcessExplicitAppUserModelID([MarshalAs(UnmanagedType.LPWStr)] string AppID);

        [STAThread]
        static void Main(string[] args)
        {{
            try
            {{
                SetCurrentProcessExplicitAppUserModelID("{APP_USER_MODEL_ID}");
            }}
            catch {{}}

            string baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\\\');
            string pythonExe = Path.Combine(baseDir, ".venv", "Scripts", "python.exe");
            if (!File.Exists(pythonExe))
            {{
                pythonExe = "python.exe";
            }}
            string script = Path.Combine(baseDir, "tallus_desktop.py");

            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = pythonExe;
            psi.Arguments = "\\"" + script + "\\" " + string.Join(" ", args);
            psi.WorkingDirectory = baseDir;
            psi.CreateNoWindow = true;
            psi.UseShellExecute = false;
            psi.WindowStyle = ProcessWindowStyle.Hidden;

            try
            {{
                Process proc = Process.Start(psi);
                if (proc != null)
                {{
                    proc.WaitForExit();
                }}
            }}
            catch (Exception ex)
            {{
                System.Windows.Forms.MessageBox.Show("Failed to launch Tallus: " + ex.Message, "Tallus Error");
            }}
        }}
    }}
}}
"""
    src_file = BASE_DIR / "_launcher_src.cs"
    src_file.write_text(cs_code, encoding="utf-8")
    try:
        cmd = [
            str(csc_path),
            "/target:winexe",
            f"/win32icon:{ICON_FILE}",
            f"/out:{TALLUS_EXE}",
            "/reference:System.Windows.Forms.dll",
            str(src_file)
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print(f"[Launcher] Successfully compiled native GUI launcher: {TALLUS_EXE}")
    finally:
        if src_file.exists():
            src_file.unlink()

def create_and_configure_shortcut(target_lnk_path: Path):
    """Create shortcut and set AppUserModelID in its property store."""
    ps_script = f"""
    $code = @"
    using System;
    using System.Runtime.InteropServices;
    using System.Runtime.InteropServices.ComTypes;

    public static class ShortcutConfigurator
    {{
        private static Guid CLSID_ShellLink = new Guid("00021401-0000-0000-C000-000000000046");
        private static PropertyKey PKEY_AppUserModel_ID = new PropertyKey(new Guid("9F4C2855-9F79-4BDE-9E85-787600427802"), 5);

        [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IPropertyStore
        {{
            int GetCount(out uint count);
            int GetAt(uint iProp, out PropertyKey pkey);
            int GetValue(ref PropertyKey key, out PropVariant pv);
            int SetValue(ref PropertyKey key, ref PropVariant pv);
            int Commit();
        }}

        [StructLayout(LayoutKind.Sequential, Pack = 4)]
        private struct PropertyKey
        {{
            public Guid fmtid;
            public uint pid;
            public PropertyKey(Guid guid, uint id) {{ fmtid = guid; pid = id; }}
        }}

        [StructLayout(LayoutKind.Explicit)]
        private struct PropVariant
        {{
            [FieldOffset(0)] public ushort vt;
            [FieldOffset(8)] public IntPtr pwszVal;

            public static PropVariant FromString(string val)
            {{
                PropVariant pv = new PropVariant();
                pv.vt = 31; // VT_LPWSTR
                pv.pwszVal = Marshal.StringToCoTaskMemUni(val);
                return pv;
            }}

            public void Clear()
            {{
                if (pwszVal != IntPtr.Zero)
                {{
                    Marshal.FreeCoTaskMem(pwszVal);
                    pwszVal = IntPtr.Zero;
                }}
            }}
        }}

        public static void SetAppId(string lnkPath, string appId)
        {{
            Type shellLinkType = Type.GetTypeFromCLSID(CLSID_ShellLink);
            object link = Activator.CreateInstance(shellLinkType);
            IPersistFile file = (IPersistFile)link;
            file.Load(lnkPath, 2); // STGM_READWRITE = 2

            IPropertyStore store = (IPropertyStore)link;
            PropVariant pv = PropVariant.FromString(appId);
            store.SetValue(ref PKEY_AppUserModel_ID, ref pv);
            pv.Clear();
            store.Commit();

            file.Save(lnkPath, true);
            Marshal.ReleaseComObject(store);
            Marshal.ReleaseComObject(link);
        }}
    }}
"@
    Add-Type -TypeDefinition $code -Language CSharp -ErrorAction SilentlyContinue

    $WshShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut("{target_lnk_path}")
    $Shortcut.TargetPath = "{TALLUS_EXE}"
    $Shortcut.Arguments = ""
    $Shortcut.WorkingDirectory = "{BASE_DIR}"
    $Shortcut.IconLocation = "{ICON_FILE},0"
    $Shortcut.Description = "Tallus - Local AI Marking & Feedback System"
    $Shortcut.Save()

    try {{
        [ShortcutConfigurator]::SetAppId("{target_lnk_path}", "{APP_USER_MODEL_ID}")
    }} catch {{}}
    """
    subprocess.run(["powershell", "-NoProfile", "-Command", ps_script], check=True)
    print(f"[Shortcut] Configured with AppUserModelID: {target_lnk_path}")

def main():
    compile_launcher()
    print("Configuring Tallus shortcuts and taskbar bindings...")

    # 1. Project root shortcut
    local_shortcut = BASE_DIR / "Tallus.lnk"
    create_and_configure_shortcut(local_shortcut)

    # 2. Desktop shortcut
    try:
        user_desktop = Path(os.environ.get("USERPROFILE", "")) / "Desktop"
        if user_desktop.exists():
            desktop_shortcut = user_desktop / "Tallus.lnk"
            create_and_configure_shortcut(desktop_shortcut)
    except Exception as e:
        print(f"[Shortcut] Note on Desktop: {e}")

    # 3. User Pinned Taskbar directory
    try:
        taskbar_dir = Path(os.environ.get("APPDATA", "")) / "Microsoft" / "Internet Explorer" / "Quick Launch" / "User Pinned" / "TaskBar"
        if taskbar_dir.exists():
            # If a previous Python.lnk was pinned by Windows, clean it up
            stale_python_lnk = taskbar_dir / "Python.lnk"
            if stale_python_lnk.exists():
                try:
                    stale_python_lnk.unlink()
                    print(f"[Taskbar] Removed stale Python.lnk from pinned taskbar.")
                except Exception:
                    pass

            # Create or update Tallus.lnk in the pinned taskbar folder
            pinned_tallus_lnk = taskbar_dir / "Tallus.lnk"
            create_and_configure_shortcut(pinned_tallus_lnk)
            print(f"[Taskbar] Updated pinned Taskbar shortcut with Tallus branding.")
    except Exception as e:
        print(f"[Taskbar] Note on Taskbar directory: {e}")

    # 4. Notify Windows Shell to refresh icon cache immediately
    if sys.platform == "win32":
        try:
            ctypes.windll.shell32.SHChangeNotify(0x08000000, 0x0000, None, None)
        except Exception:
            pass

    print("\n[Complete] Taskbar icon and shortcuts are now bound to the Tallus monochrome logo!")

if __name__ == "__main__":
    main()
