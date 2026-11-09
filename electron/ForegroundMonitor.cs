using System;
using System.Diagnostics;
using System.Globalization;
using System.IO.MemoryMappedFiles;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

internal static class ForegroundMonitor
{
    private const uint RtssSignature = 0x52545353;
    private const uint MinimumRtssVersion = 0x00020000;
    private const int ProcessIdOffset = 0;
    private const int FrameTime0Offset = 268;
    private const int FrameTime1Offset = 272;
    private const int FramesOffset = 276;
    private static MemoryMappedFile rtssMap;
    private static MemoryMappedViewAccessor rtssView;

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    private static void CloseRtss()
    {
        if (rtssView != null) { rtssView.Dispose(); rtssView = null; }
        if (rtssMap != null) { rtssMap.Dispose(); rtssMap = null; }
    }

    private static void OpenRtss()
    {
        try
        {
            CloseRtss();
            rtssMap = MemoryMappedFile.OpenExisting("RTSSSharedMemoryV2", MemoryMappedFileRights.Read);
            rtssView = rtssMap.CreateViewAccessor(0, 0, MemoryMappedFileAccess.Read);
            if (rtssView.Capacity < 20 || rtssView.ReadUInt32(0) != RtssSignature || rtssView.ReadUInt32(4) < MinimumRtssVersion)
                CloseRtss();
        }
        catch { CloseRtss(); }
    }

    private static int GetMonitorNumber(IntPtr window)
    {
        try
        {
            Screen target = Screen.FromHandle(window);
            Screen[] screens = Screen.AllScreens
                .OrderBy(screen => screen.Primary ? 0 : 1)
                .ThenBy(screen => screen.Bounds.X)
                .ThenBy(screen => screen.Bounds.Y)
                .ToArray();
            for (int i = 0; i < screens.Length; i++)
                if (screens[i].DeviceName == target.DeviceName) return i + 1;
        }
        catch { }
        return 1;
    }

    private static string GetProcessName(uint processId)
    {
        if (processId == 0 || processId > Int32.MaxValue) return String.Empty;
        try { return Process.GetProcessById((int)processId).ProcessName.Replace(',', '_'); }
        catch { return String.Empty; }
    }

    private static void ReadRtss(uint processId, out int fps, out double frameTimeMs, out uint t0, out uint t1, out uint frames)
    {
        fps = 0; frameTimeMs = 0; t0 = 0; t1 = 0; frames = 0;
        try
        {
            if (rtssView == null) return;
            long capacity = rtssView.Capacity;
            if (capacity < 20 || rtssView.ReadUInt32(0) != RtssSignature || rtssView.ReadUInt32(4) < MinimumRtssVersion) { CloseRtss(); return; }
            uint entrySize = rtssView.ReadUInt32(8);
            uint arrayOffset = rtssView.ReadUInt32(12);
            uint count = Math.Min(rtssView.ReadUInt32(16), 256U);
            if (entrySize < 280 || count == 0 || arrayOffset > capacity || (long)arrayOffset + (long)entrySize > capacity) return;

            for (uint i = 0; i < count; i++)
            {
                long offset = (long)arrayOffset + ((long)i * entrySize);
                if (offset < 0 || offset + FramesOffset + sizeof(uint) > capacity) break;
                if (rtssView.ReadUInt32(offset + ProcessIdOffset) != processId) continue;
                t0 = rtssView.ReadUInt32(offset + FrameTime0Offset);
                t1 = rtssView.ReadUInt32(offset + FrameTime1Offset);
                frames = rtssView.ReadUInt32(offset + FramesOffset);
                long elapsed = (long)t1 - t0;
                if (elapsed < 0) elapsed += 4294967296L;
                if (elapsed > 0 && frames > 0)
                {
                    fps = (int)Math.Round(1000.0 * frames / elapsed);
                    frameTimeMs = Math.Round((double)elapsed / frames, 3);
                }
                return;
            }
        }
        catch { CloseRtss(); }
    }

    private static void WriteSample(uint processId, int monitor, int fps, double frameTimeMs, uint t0, uint t1, uint frames, string processName)
    {
        Console.WriteLine(String.Join(",", new string[] {
            processId.ToString(CultureInfo.InvariantCulture), monitor.ToString(CultureInfo.InvariantCulture),
            fps.ToString(CultureInfo.InvariantCulture), frameTimeMs.ToString(CultureInfo.InvariantCulture),
            t0.ToString(CultureInfo.InvariantCulture), t1.ToString(CultureInfo.InvariantCulture),
            frames.ToString(CultureInfo.InvariantCulture), processName ?? String.Empty
        }));
        Console.Out.Flush();
    }

    private static int Main(string[] args)
    {
        int intervalMs = 1000;
        int parsed;
        if (args.Length > 0 && Int32.TryParse(args[0], out parsed)) intervalMs = Math.Max(250, Math.Min(5000, parsed));
        try { Process.GetCurrentProcess().PriorityClass = ProcessPriorityClass.BelowNormal; } catch { }
        Console.OutputEncoding = new UTF8Encoding(false);
        uint lastProcessId = UInt32.MaxValue;
        string processName = String.Empty;
        long intervalTicks = Math.Max(1L, (long)Math.Round(intervalMs * (double)Stopwatch.Frequency / 1000.0));
        long nextCycleAt = Stopwatch.GetTimestamp();

        while (true)
        {
            if (rtssView == null) OpenRtss();
            IntPtr window = GetForegroundWindow();
            uint processId = 0;
            int monitor = 1;
            if (window != IntPtr.Zero)
            {
                GetWindowThreadProcessId(window, out processId);
                monitor = GetMonitorNumber(window);
            }
            if (processId != lastProcessId)
            {
                processName = GetProcessName(processId);
                lastProcessId = processId;
            }
            int fps;
            double frameTimeMs;
            uint t0, t1, frames;
            ReadRtss(processId, out fps, out frameTimeMs, out t0, out t1, out frames);
            WriteSample(processId, monitor, fps, frameTimeMs, t0, t1, frames, processName);

            nextCycleAt += intervalTicks;
            long now = Stopwatch.GetTimestamp();
            if (nextCycleAt <= now)
            {
                long missed = (long)Math.Floor((now - nextCycleAt) / (double)intervalTicks) + 1;
                nextCycleAt += missed * intervalTicks;
            }
            int sleepMs = (int)Math.Floor((nextCycleAt - Stopwatch.GetTimestamp()) * 1000.0 / Stopwatch.Frequency);
            if (sleepMs > 0) Thread.Sleep(sleepMs);
        }
    }
}
