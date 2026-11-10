using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

internal static class FanControlReader
{
    private static string installPath;
    private static object sensorClient;
    private static MethodInfo readAllSensors;
    private static readonly HashSet<string> resolving = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

    private static string FindInstallPath()
    {
        var paths = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "FanControl"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "FanControl"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "FanControl")
        };
        return paths.FirstOrDefault(path => File.Exists(Path.Combine(path, "FanControl.IPC.dll")));
    }

    private static Assembly ResolveFanControlAssembly(object sender, ResolveEventArgs args)
    {
        try
        {
            var requestedName = new AssemblyName(args.Name).Name;
            var file = Path.Combine(installPath, requestedName + ".dll");
            if (!File.Exists(file)) return null;
            lock (resolving)
            {
                if (!resolving.Add(requestedName)) return null;
            }
            try { return Assembly.LoadFrom(file); }
            finally { lock (resolving) resolving.Remove(requestedName); }
        }
        catch { return null; }
    }

    private static void Initialize()
    {
        if (sensorClient != null) return;
        installPath = FindInstallPath();
        if (installPath == null) return;
        AppDomain.CurrentDomain.AssemblyResolve += ResolveFanControlAssembly;
        var ipc = Assembly.LoadFrom(Path.Combine(installPath, "FanControl.IPC.dll"));
        var factory = ipc.GetType("FanControl.IPC.IPCFactory", true);
        sensorClient = factory.GetMethod("GetSensorClient").Invoke(null, null);
        readAllSensors = sensorClient.GetType().GetMethods()
            .First(method => method.Name == "GetAllSensors" && method.GetParameters().Length == 2);
    }

    private static Dictionary<string, string> ReadConfiguredFans()
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (installPath == null) return result;
        var configPath = Path.Combine(installPath, "Configurations", "userConfig.json");
        if (!File.Exists(configPath)) return result;
        try
        {
            var serializer = new JavaScriptSerializer();
            var root = serializer.DeserializeObject(File.ReadAllText(configPath)) as IDictionary<string, object>;
            var fanControl = root != null && root.ContainsKey("FanControl") ? root["FanControl"] as IDictionary<string, object> : null;
            if (fanControl == null) return result;

            object sensorsObject;
            if (fanControl.TryGetValue("FanSensors", out sensorsObject) && sensorsObject is IEnumerable)
            {
                foreach (var item in (IEnumerable)sensorsObject)
                {
                    var sensor = item as IDictionary<string, object>;
                    if (sensor == null) continue;
                    var id = sensor.ContainsKey("Identifier") ? Convert.ToString(sensor["Identifier"]) : null;
                    var name = sensor.ContainsKey("NickName") ? Convert.ToString(sensor["NickName"]) : null;
                    if (!String.IsNullOrWhiteSpace(id) && !String.IsNullOrWhiteSpace(name)) result[id] = name;
                }
            }
        }
        catch { }
        return result;
    }

    private static string Escape(string value)
    {
        return (value ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"");
    }

    private static string ReadJson(Dictionary<string, string> configuredFans)
    {
        try
        {
            Initialize();
            if (sensorClient == null) return "{\"fans\":[]}";
            var requestType = sensorClient.GetType().Assembly.GetType("GetAllSensorsRequest", true);
            var request = Activator.CreateInstance(requestType);
            var reply = readAllSensors.Invoke(sensorClient, new object[] { request, null });
            var sensorList = reply.GetType().GetProperty("Sensors").GetValue(reply, null) as IEnumerable;
            var readings = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);
            if (sensorList != null)
            {
                foreach (var sensor in sensorList)
                {
                    var type = sensor.GetType();
                    var id = Convert.ToString(type.GetProperty("Identifier").GetValue(sensor, null));
                    if (!configuredFans.ContainsKey(id)) continue;
                    if (!(bool)type.GetProperty("HasValue").GetValue(sensor, null)) continue;
                    var value = Convert.ToDouble(type.GetProperty("Value").GetValue(sensor, null));
                    if (!Double.IsNaN(value) && !Double.IsInfinity(value) && value >= 0) readings[id] = Math.Round(value);
                }
            }

            var output = new StringBuilder("{\"fans\":[");
            var first = true;
            foreach (var fan in configuredFans)
            {
                double value;
                if (!readings.TryGetValue(fan.Key, out value)) continue;
                if (!first) output.Append(',');
                first = false;
                output.Append("{\"name\":\"").Append(Escape(fan.Value)).Append("\",\"value\":")
                    .Append(value.ToString(System.Globalization.CultureInfo.InvariantCulture))
                    .Append(",\"units\":\"RPM\"}");
            }
            output.Append("]}");
            return output.ToString();
        }
        catch { return "{\"fans\":[]}"; }
    }

    private static int Main(string[] args)
    {
        try { Process.GetCurrentProcess().PriorityClass = ProcessPriorityClass.BelowNormal; } catch { }
        var interval = 1000;
        int parsed;
        if (args.Length > 0 && Int32.TryParse(args[0], out parsed)) interval = Math.Max(1000, Math.Min(10000, parsed));
        Initialize();
        var fans = ReadConfiguredFans();
        var intervalTicks = Math.Max(1L, (long)Math.Round(interval * (double)Stopwatch.Frequency / 1000.0));
        var nextCycleAt = 0L;
        var firstCycle = true;
        while (true)
        {
            var cycleStartedAt = Stopwatch.GetTimestamp();
            Console.WriteLine(ReadJson(fans));
            Console.Out.Flush();
            var nowTicks = Stopwatch.GetTimestamp();
            if (firstCycle)
            {
                nextCycleAt = cycleStartedAt;
                firstCycle = false;
            }
            nextCycleAt += intervalTicks;
            if (nextCycleAt <= nowTicks)
            {
                var missedIntervals = (long)Math.Floor((nowTicks - nextCycleAt) / (double)intervalTicks) + 1;
                nextCycleAt += missedIntervals * intervalTicks;
            }
            var remainingMs = (int)Math.Floor((nextCycleAt - Stopwatch.GetTimestamp()) * 1000.0 / Stopwatch.Frequency);
            if (remainingMs > 0) Thread.Sleep(remainingMs);
        }
    }
}
