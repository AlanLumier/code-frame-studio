using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.Windows.Forms;

class CodeMVLauncher
{
    [STAThread]
    static void Main()
    {
        string root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
        string legacy = Path.Combine(root, "legacy");
        string node = FindNode();
        if (node == null)
        {
            MessageBox.Show("没有找到 Node.js，请先安装 Node 18 或更新版本。", "CodeMV", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }
        if (!File.Exists(Path.Combine(legacy, "server.js")))
        {
            MessageBox.Show("legacy/server.js 不存在，请重新解压完整目录。", "CodeMV", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        int port = FindFreePort(8899);
        Process server = null;
        try
        {
            ProcessStartInfo psi = new ProcessStartInfo(node, "\"" + Path.Combine(legacy, "server.js") + "\"");
            psi.WorkingDirectory = root;
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.EnvironmentVariables["PORT"] = port.ToString();
            psi.EnvironmentVariables["CODEMV_ROOT"] = legacy;
            psi.EnvironmentVariables["ELECTRON_RUN_AS_NODE"] = "";
            server = Process.Start(psi);
            WaitPort(port, 5000);

            string edge = FindEdge();
            if (edge == null)
            {
                Process.Start(new ProcessStartInfo("http://127.0.0.1:" + port + "/") { UseShellExecute = true });
                return;
            }
            string profile = Path.Combine(root, ".edge-profile-v2");
            Directory.CreateDirectory(profile);
            string args = "--app=http://127.0.0.1:" + port + "/"
                + " --window-size=1440,900"
                + " --user-data-dir=\"" + profile + "\""
                + " --no-first-run --no-default-browser-check";
            Process view = Process.Start(new ProcessStartInfo(edge, args) { UseShellExecute = false });
            if (view != null) view.WaitForExit();
        }
        catch (Exception ex)
        {
            MessageBox.Show("启动失败：" + ex.Message, "CodeMV", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            try
            {
                if (server != null && !server.HasExited) server.Kill();
            }
            catch { }
        }
    }

    static string FindNode()
    {
        string path = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (string dir in path.Split(';'))
        {
            try
            {
                string candidate = Path.Combine(dir.Trim(), "node.exe");
                if (File.Exists(candidate)) return candidate;
            }
            catch { }
        }
        string[] fixedPaths = {
            @"C:\Program Files\nodejs\node.exe",
            @"C:\Program Files (x86)\nodejs\node.exe"
        };
        foreach (string candidate in fixedPaths) if (File.Exists(candidate)) return candidate;
        return null;
    }

    static string FindEdge()
    {
        string[] paths = {
            @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            @"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
        };
        foreach (string candidate in paths) if (File.Exists(candidate)) return candidate;
        return null;
    }

    static int FindFreePort(int preferred)
    {
        try
        {
            TcpListener listener = new TcpListener(IPAddress.Loopback, preferred);
            listener.Start();
            listener.Stop();
            return preferred;
        }
        catch
        {
            TcpListener listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start();
            int port = ((IPEndPoint)listener.LocalEndpoint).Port;
            listener.Stop();
            return port;
        }
    }

    static void WaitPort(int port, int timeoutMs)
    {
        int waited = 0;
        while (waited < timeoutMs)
        {
            try
            {
                using (TcpClient client = new TcpClient())
                {
                    client.Connect(IPAddress.Loopback, port);
                    return;
                }
            }
            catch
            {
                Thread.Sleep(200);
                waited += 200;
            }
        }
    }
}
