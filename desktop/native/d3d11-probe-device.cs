using System;
using System.Runtime.InteropServices;

// Dispositivo temporário para probes. Recusa adaptador padrão diferente do LUID
// solicitado: seleção explícita em máquinas híbridas ainda não implementada aqui.
internal sealed class D3D11ProbeDevice : IDisposable {
  public IntPtr Device { get; private set; }
  public IntPtr Manager { get; private set; }
  public string AdapterLuid { get; private set; }
  [DllImport("d3d11.dll")] private static extern int D3D11CreateDevice(IntPtr adapter, int driver, IntPtr software,
    uint flags, IntPtr levels, uint levelCount, uint sdkVersion, out IntPtr device, out uint featureLevel, out IntPtr context);
  [DllImport("mfplat.dll")] private static extern int MFCreateDXGIDeviceManager(out uint token, out IntPtr manager);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] private struct AdapterDesc {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string description;
    public uint vendor, device, subsystem, revision;
    public UIntPtr dedicatedVideo, dedicatedSystem, sharedSystem;
    public uint luidLow; public int luidHigh;
  }
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int AdapterFn(IntPtr self, out IntPtr adapter);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int DescFn(IntPtr self, out AdapterDesc desc);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int ResetFn(IntPtr self, IntPtr device, uint token);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int ProtectFn(IntPtr self, [MarshalAs(UnmanagedType.Bool)] bool protect);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int ProtectedFn(IntPtr self);
  private static T Slot<T>(IntPtr obj, int slot) where T : class {
    return (T)(object)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(obj), slot * IntPtr.Size), typeof(T));
  }
  private static void Check(int result) { Marshal.ThrowExceptionForHR(result); }
  public D3D11ProbeDevice(ulong requestedLuid) {
    IntPtr device = IntPtr.Zero, context = IntPtr.Zero, dxgi = IntPtr.Zero, adapter = IntPtr.Zero, multithread = IntPtr.Zero, manager = IntPtr.Zero;
    try {
      if (Marshal.SizeOf(typeof(AdapterDesc)) != 304) throw new InvalidOperationException("unexpected x64 adapter layout");
      uint feature, token;
      Check(D3D11CreateDevice(IntPtr.Zero, 1, IntPtr.Zero, 0x820, IntPtr.Zero, 0, 7, out device, out feature, out context));
      Guid iid = new Guid("54ec77fa-1377-44e6-8c32-88fd5f44c84c"); Check(Marshal.QueryInterface(device, ref iid, out dxgi));
      Check(Slot<AdapterFn>(dxgi, 7)(dxgi, out adapter));
      AdapterDesc desc; Check(Slot<DescFn>(adapter, 8)(adapter, out desc));
      AdapterLuid = ((uint)desc.luidHigh).ToString("x8") + desc.luidLow.ToString("x8");
      if (AdapterLuid != requestedLuid.ToString("x16")) throw new InvalidOperationException("default hardware adapter differs from requested LUID; no fallback");
      iid = new Guid("9b7e4e00-342c-4106-a19f-4f2704f689f0"); Check(Marshal.QueryInterface(context, ref iid, out multithread));
      Slot<ProtectFn>(multithread, 5)(multithread, true);
      if (Slot<ProtectedFn>(multithread, 6)(multithread) == 0) throw new InvalidOperationException("D3D multithread protection not applied");
      Check(MFCreateDXGIDeviceManager(out token, out manager));
      Check(Slot<ResetFn>(manager, 7)(manager, device, token));
      Device = device; device = IntPtr.Zero; Manager = manager; manager = IntPtr.Zero;
    } finally {
      foreach (IntPtr p in new IntPtr[] { manager, multithread, adapter, dxgi, context, device }) if (p != IntPtr.Zero) Marshal.Release(p);
    }
  }
  public void Dispose() {
    if (Manager != IntPtr.Zero) { Marshal.Release(Manager); Manager = IntPtr.Zero; }
    if (Device != IntPtr.Zero) { Marshal.Release(Device); Device = IntPtr.Zero; }
  }
}
