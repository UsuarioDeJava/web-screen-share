// Probe de WGC exclusivamente para a janela sintética do processo pai.
// Não publica mídia, não grava pixels, não lê texturas para CPU e não tem fallback de monitor.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using Windows.Foundation;
using Windows.Graphics.Capture;
using Windows.Graphics.DirectX;
using Windows.Graphics.DirectX.Direct3D11;

internal static class WgcProbe {
  internal static Action<IntPtr> ApplicationValidation;
  [ComImport, Guid("3628e81b-3cac-4c60-b7f4-23ce0e0c3356"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IItemInterop {
    [PreserveSig] int CreateForWindow(IntPtr hwnd, ref Guid iid, out IntPtr item);
    [PreserveSig] int CreateForMonitor(IntPtr monitor, ref Guid iid, out IntPtr item);
  }
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int length);
  [DllImport("kernel32.dll")] private static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] private static extern bool Process32First(IntPtr handle, ref ProcessEntry entry);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] private static extern bool Process32Next(IntPtr handle, ref ProcessEntry entry);
  [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] private struct ProcessEntry {
    public uint size, usage, pid; public UIntPtr heap; public uint module, threads, parent; public int priority; public uint flags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=260)] public string file;
  }
  [DllImport("d3d11.dll")] private static extern int D3D11CreateDevice(IntPtr adapter, int driver, IntPtr software,
    uint flags, IntPtr levels, uint levelCount, uint sdkVersion, out IntPtr device, out uint featureLevel, out IntPtr context);
  [DllImport("d3d11.dll")] private static extern int CreateDirect3D11DeviceFromDXGIDevice(IntPtr device, out IntPtr inspectable);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int GetAdapterFn(IntPtr self, out IntPtr adapter);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int GetDescFn(IntPtr self, out AdapterDesc description);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] private struct AdapterDesc {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string description;
    public uint vendor, device, subsystem, revision;
    public UIntPtr dedicatedVideo, dedicatedSystem, sharedSystem;
    public uint luidLow; public int luidHigh;
  }
  private static Dictionary<string, object> DescribeAdapter(IntPtr dxgi) {
    // IDXGIObject tem quatro métodos depois de IUnknown. GetAdapter é o slot 7;
    // em IDXGIAdapter, EnumOutputs ocupa 7 e GetDesc ocupa 8.
    if (Marshal.SizeOf(typeof(AdapterDesc)) != 304) throw new InvalidOperationException("unexpected x64 adapter layout");
    GetAdapterFn getAdapter = (GetAdapterFn)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(dxgi), 7 * IntPtr.Size), typeof(GetAdapterFn));
    IntPtr adapter; Check(getAdapter(dxgi, out adapter));
    try {
      GetDescFn getDesc = (GetDescFn)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(adapter), 8 * IntPtr.Size), typeof(GetDescFn));
      AdapterDesc desc; Check(getDesc(adapter, out desc));
      Dictionary<string, object> result = new Dictionary<string, object>();
      result["description"] = desc.description; result["vendorId"] = desc.vendor; result["deviceId"] = desc.device;
      result["luid"] = ((uint)desc.luidHigh).ToString("x8") + desc.luidLow.ToString("x8");
      return result;
    } finally { Marshal.Release(adapter); }
  }
  private static void Check(int result) { Marshal.ThrowExceptionForHR(result); }
  internal static uint ParentPid() {
    IntPtr snapshot = CreateToolhelp32Snapshot(2, 0);
    if (snapshot == new IntPtr(-1)) throw new InvalidOperationException("process inventory unavailable");
    try {
      ProcessEntry entry = new ProcessEntry(); entry.size = (uint)Marshal.SizeOf(typeof(ProcessEntry));
      if (Process32First(snapshot, ref entry)) do {
        if (entry.pid == (uint)Process.GetCurrentProcess().Id) return entry.parent;
      } while (Process32Next(snapshot, ref entry));
    } finally { CloseHandle(snapshot); }
    throw new InvalidOperationException("parent unavailable");
  }
  internal static void ValidateWindow(IntPtr hwnd, uint expectedPid, string title, bool validateParent = true) {
    if(ApplicationValidation!=null){ApplicationValidation(hwnd);return;}
    uint owner;
    if (!title.StartsWith("WSS WGC synthetic ", StringComparison.Ordinal) || title.Length != 50
      || GetWindowThreadProcessId(hwnd, out owner) == 0 || owner != expectedPid || validateParent && expectedPid != ParentPid())
      throw new InvalidOperationException("only parent-owned synthetic window is allowed");
    StringBuilder actual = new StringBuilder(128);
    GetWindowText(hwnd, actual, actual.Capacity);
    if (actual.ToString() != title) throw new InvalidOperationException("synthetic title mismatch");
  }
  internal static IDirect3DDevice HardwareDevice(out Dictionary<string, object> adapterInfo) {
    IntPtr native = IntPtr.Zero, context = IntPtr.Zero, dxgi = IntPtr.Zero, inspectable = IntPtr.Zero;
    uint feature;
    try {
      // HARDWARE + BGRA_SUPPORT. Não tentar WARP/software se falhar.
      Check(D3D11CreateDevice(IntPtr.Zero, 1, IntPtr.Zero, 0x20, IntPtr.Zero, 0, 7, out native, out feature, out context));
      Guid iid = new Guid("54ec77fa-1377-44e6-8c32-88fd5f44c84c");
      Check(Marshal.QueryInterface(native, ref iid, out dxgi));
      adapterInfo = DescribeAdapter(dxgi);
      Check(CreateDirect3D11DeviceFromDXGIDevice(dxgi, out inspectable));
      return (IDirect3DDevice)Marshal.GetObjectForIUnknown(inspectable);
    } finally {
      foreach (IntPtr pointer in new IntPtr[] { inspectable, dxgi, context, native }) if (pointer != IntPtr.Zero) Marshal.Release(pointer);
    }
  }
  private static double Percentile(List<double> values, double percentile) {
    if (values.Count == 0) return Double.NaN;
    values.Sort(); return values[Math.Min(values.Count - 1, (int)Math.Ceiling(values.Count * percentile) - 1)];
  }
  [MTAThread] private static int Main(string[] args) {
    Direct3D11CaptureFramePool pool = null; GraphicsCaptureSession session = null; IDirect3DDevice device = null;
    GraphicsCaptureItem item = null;
    TypedEventHandler<Direct3D11CaptureFramePool, object> onFrame = null;
    TypedEventHandler<GraphicsCaptureItem, object> onClosed = null;
    bool frameRegistered = false, closedRegistered = false;
    ManualResetEvent sourceEnded = new ManualResetEvent(false);
    object gate = new object(); bool stopped = false, sourceClosed = false;
    List<double> gaps = new List<double>(); List<int> buckets = new List<int>();
    int frames = 0, errors = 0, width = 0, height = 0, sizeChanges = 0, nonmonotonic = 0, callbacks = 0, extraDrained = 0, emptyCallbacks = 0;
    long lastSource = -1; double lastCallback = -1;
    Stopwatch watch = new Stopwatch();
    try {
      if (args.Length < 4 || args.Length > 6) throw new ArgumentException("expected HWND, parent PID, synthetic title, seconds, optional pacing/drain mode");
      string pacing = args.Length >= 5 ? args[4] : "capped60", drainMode = args.Length == 6 ? args[5] : "single";
      if (pacing != "capped60" && pacing != "uncapped" || drainMode != "single" && drainMode != "drain") throw new ArgumentException("invalid pacing/drain mode");
      int drainLimit = drainMode == "drain" ? 2 : 1;
      long handle; uint expectedPid; int seconds;
      if (!Int64.TryParse(args[0], out handle) || handle <= 0 || !UInt32.TryParse(args[1], out expectedPid)
        || !Int32.TryParse(args[3], out seconds) || seconds < 2 || seconds > 60) throw new ArgumentException("invalid probe arguments");
      IntPtr hwnd = new IntPtr(handle); ValidateWindow(hwnd, expectedPid, args[2]);
      if (!GraphicsCaptureSession.IsSupported()) throw new InvalidOperationException("WGC unavailable");
      object factory = WindowsRuntimeMarshal.GetActivationFactory(typeof(GraphicsCaptureItem));
      Guid itemIid = new Guid("79c3f95b-31f7-4ec2-a464-632ef5d30760"); IntPtr itemPointer;
      Check(((IItemInterop)factory).CreateForWindow(hwnd, ref itemIid, out itemPointer));
      try { item = (GraphicsCaptureItem)Marshal.GetObjectForIUnknown(itemPointer); } finally { Marshal.Release(itemPointer); }
      Dictionary<string, object> adapterInfo;
      device = HardwareDevice(out adapterInfo);
      pool = Direct3D11CaptureFramePool.CreateFreeThreaded(device, DirectXPixelFormat.B8G8R8A8UIntNormalized, 2, item.Size);
      session = pool.CreateCaptureSession(item);
      bool intervalSet = false;
      long requestedIntervalTicks = pacing == "capped60" ? 10000000 / 60 : 0, appliedIntervalTicks = -1;
      try { session.MinUpdateInterval = TimeSpan.FromTicks(requestedIntervalTicks); appliedIntervalTicks = session.MinUpdateInterval.Ticks; intervalSet = true; } catch (Exception) { }
      onClosed = delegate { lock (gate) { if (!stopped) { sourceClosed = true; sourceEnded.Set(); } } };
      item.Closed += onClosed; closedRegistered = true;
      onFrame = delegate(Direct3D11CaptureFramePool sender, object unused) {
        try {
          lock (gate) { if (stopped) return; callbacks++; }
          for (int drained = 0; drained < drainLimit; drained++) {
          using (Direct3D11CaptureFrame frame = sender.TryGetNextFrame()) {
            if (frame == null) { if (drained == 0) lock (gate) { emptyCallbacks++; } return; }
            double callback = watch.Elapsed.TotalMilliseconds;
            lock (gate) {
              if (stopped) return;
              int second = (int)(callback / 1000);
              if (second >= seconds) return;
              while (buckets.Count <= second) buckets.Add(0);
              buckets[second]++; frames++;
              if (drained > 0) extraDrained++;
              Windows.Graphics.SizeInt32 size = frame.ContentSize;
              int currentWidth = size.Width, currentHeight = size.Height;
              if (width != 0 && (width != currentWidth || height != currentHeight)) sizeChanges++;
              width = currentWidth; height = currentHeight;
              if (lastCallback >= 0 && gaps.Count < 20000) gaps.Add(callback - lastCallback);
              lastCallback = callback;
              long stamp = frame.SystemRelativeTime.Ticks;
              if (lastSource >= 0 && stamp <= lastSource) nonmonotonic++;
              lastSource = stamp;
            }
          }
          }
        } catch (Exception) { lock (gate) { if (!stopped) errors++; } }
      };
      pool.FrameArrived += onFrame; frameRegistered = true;
      ValidateWindow(hwnd, expectedPid, args[2]);
      watch.Start(); session.StartCapture();
      sourceEnded.WaitOne(seconds * 1000);
      lock (gate) { stopped = true; }
      session.Dispose(); session = null;
      pool.FrameArrived -= onFrame; frameRegistered = false; pool.Dispose(); pool = null;
      Dictionary<string, object> report = new Dictionary<string, object>();
      lock (gate) {
        report["complete"] = !sourceClosed && errors == 0 && frames > 0;
        report["seconds"] = seconds; report["frames"] = frames; report["width"] = width; report["height"] = height;
        report["fps"] = frames / (double)seconds; report["buckets"] = buckets;
        report["callbackGapP50Ms"] = gaps.Count > 0 ? (object)Percentile(gaps, .5) : null;
        report["callbackGapP95Ms"] = gaps.Count > 0 ? (object)Percentile(gaps, .95) : null;
        report["nonmonotonicSourceTimestamps"] = nonmonotonic; report["callbackErrors"] = errors;
        report["sizeChanges"] = sizeChanges;
        report["callbacks"] = callbacks; report["extraDrainedFrames"] = extraDrained; report["emptyCallbacks"] = emptyCallbacks;
      }
      report["hardwareDeviceRequested"] = true; report["minUpdateIntervalSet"] = intervalSet;
      report["requestedIntervalTicks"] = requestedIntervalTicks; report["appliedIntervalTicks"] = appliedIntervalTicks;
      report["pacing"] = pacing; report["drainMode"] = drainMode; report["drainLimit"] = drainLimit; report["adapter"] = adapterInfo;
      report["pixelFormat"] = "B8G8R8A8UIntNormalized";
      report["scope"] = "Raw WGC delivery, parent-owned synthetic window and actual capture-device adapter. No encoder/Chromium-adapter identity, pixel readback, internal/cross-GPU-copy count, unique-image, WAN or input-to-photon claim.";
      Console.WriteLine(new JavaScriptSerializer().Serialize(report));
      return (bool)report["complete"] ? 0 : 1;
    } catch (Exception error) {
      Console.Error.WriteLine("WGC probe failed: " + error.GetType().Name + ": " + error.Message); return 2;
    } finally {
      lock (gate) { stopped = true; }
      if (session != null) session.Dispose();
      if (pool != null) { if (frameRegistered) pool.FrameArrived -= onFrame; pool.Dispose(); }
      if (item != null && closedRegistered) item.Closed -= onClosed;
      if (device != null) device.Dispose();
      sourceEnded.Dispose();
    }
  }
}
