using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.WindowsRuntime;
using Windows.Graphics.Capture;
using Windows.Graphics.DirectX.Direct3D11;

// Application mode is initialized only by the dedicated worker entry point.
// A renderer never supplies these arguments: the main process owns the picker.
internal static class NativeCapturePolicy {
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
  [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr window);
  internal static bool Enabled;internal static int Width=1280,Height=720;
  private static IntPtr window;private static uint owner,parent;private static long ownerStarted,parentStarted;
  internal static long Started(uint pid){using(Process p=Process.GetProcessById((int)pid))return p.StartTime.ToUniversalTime().Ticks;}
  internal static GraphicsCaptureItem Item(IntPtr hwnd){object factory=WindowsRuntimeMarshal.GetActivationFactory(typeof(GraphicsCaptureItem));Guid iid=new Guid("79c3f95b-31f7-4ec2-a464-632ef5d30760");IntPtr p;Marshal.ThrowExceptionForHR(((WgcEncodeProbe.ItemInterop)factory).CreateForWindow(hwnd,ref iid,out p));try{return (GraphicsCaptureItem)Marshal.GetObjectForIUnknown(p);}finally{Marshal.Release(p);}}
  internal static Dictionary<string,object> Initialize(IntPtr hwnd,uint parentPid,uint expectedOwner=0,long expectedStart=0){
    if(parentPid!=WgcProbe.ParentPid())throw new InvalidOperationException("native capture parent differs");
    uint pid;if(!IsWindow(hwnd)||GetWindowThreadProcessId(hwnd,out pid)==0||pid==0)throw new InvalidOperationException("selected window is unavailable");
    long started=Started(pid);if(expectedOwner!=0&&(pid!=expectedOwner||started!=expectedStart))throw new InvalidOperationException("selected window identity changed");
    GraphicsCaptureItem item=Item(hwnd);int w=item.Size.Width,h=item.Size.Height;
    if(w<64||h<64||w>7680||h>4320)throw new InvalidOperationException("selected window size unsupported");
    window=hwnd;owner=pid;ownerStarted=started;parent=parentPid;parentStarted=Started(parent);Width=w;Height=h;Enabled=true;WgcProbe.ApplicationValidation=Validate;GpuConversionProbe.InputWidth=(uint)w;GpuConversionProbe.InputHeight=(uint)h;MftTextureEncodeProbe.ApplicationMode=true;
    Dictionary<string,object> adapter;using(IDirect3DDevice device=WgcProbe.HardwareDevice(out adapter)){}
    return new Dictionary<string,object>{{"ownerPid",pid},{"ownerStarted",started.ToString()},{"width",w},{"height",h},{"adapter",adapter}};
  }
  internal static void Validate(IntPtr hwnd){uint pid;if(hwnd!=window||!IsWindow(hwnd)||GetWindowThreadProcessId(hwnd,out pid)==0||pid!=owner||Started(owner)!=ownerStarted||Started(parent)!=parentStarted)throw new InvalidOperationException("selected window or parent ended");}
}
