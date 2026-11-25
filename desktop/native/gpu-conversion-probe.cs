using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

// Reusable D3D11 conversion shared with the application worker.
// Run below generates synthetic bars/readback only for probe validation.
internal static class GpuConversionProbe {
  internal static uint InputWidth=1280,InputHeight=720;
  [StructLayout(LayoutKind.Sequential)] private struct TextureDesc {
    public uint width, height, mips, arrays, format, samples, quality, usage, bind, cpu, misc;
  }
  [StructLayout(LayoutKind.Sequential)] private struct InitialData { public IntPtr data; public uint pitch, slicePitch; }
  [StructLayout(LayoutKind.Sequential)] private struct ContentDesc { public uint format, inN, inD, inW, inH, outN, outD, outW, outH, usage; }
  [StructLayout(LayoutKind.Sequential)] private struct InputDesc { public uint fourcc, dimension, mip, array; }
  [StructLayout(LayoutKind.Sequential)] private struct OutputDesc { public uint dimension, mip, firstArray, arraySize; }
  [StructLayout(LayoutKind.Sequential)] private struct Stream {
    public uint enable, outputIndex, inputIndex, past, future;
    public IntPtr pastViews, input, futureViews, pastRight, inputRight, futureRight;
  }
  [StructLayout(LayoutKind.Sequential)] private struct Mapped { public IntPtr data; public uint rowPitch, depthPitch; }
  [StructLayout(LayoutKind.Sequential)] private struct Rect {public int left,top,right,bottom;}
  [StructLayout(LayoutKind.Sequential)] private struct Color {public float r,g,b,a;}
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate void BackgroundFn(IntPtr self,IntPtr processor,int ycbcr,ref Color color);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate void OutputRectFn(IntPtr self,IntPtr processor,int enabled,ref Rect rect);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate void StreamRectFn(IntPtr self,IntPtr processor,uint stream,int enabled,ref Rect rect);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate void OutputRectReadFn(IntPtr self,IntPtr processor,out int enabled,out Rect rect);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate void StreamRectReadFn(IntPtr self,IntPtr processor,uint stream,out int enabled,out Rect rect);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate void ContextFn(IntPtr self, out IntPtr context);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int TextureFn(IntPtr self, ref TextureDesc desc, IntPtr initial, out IntPtr texture);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate void DescFn(IntPtr self, out TextureDesc desc);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int EnumeratorFn(IntPtr self, ref ContentDesc desc, out IntPtr enumerator);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int FormatFn(IntPtr self, uint format, out uint support);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int ProcessorFn(IntPtr self, IntPtr enumerator, uint index, out IntPtr processor);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int InputFn(IntPtr self, IntPtr resource, IntPtr enumerator, ref InputDesc desc, out IntPtr view);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int OutputFn(IntPtr self, IntPtr resource, IntPtr enumerator, ref OutputDesc desc, out IntPtr view);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate void OutputColorFn(IntPtr self, IntPtr processor, ref uint color);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate void InputColorFn(IntPtr self, IntPtr processor, uint stream, ref uint color);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate void StreamValueFn(IntPtr self, IntPtr processor, uint stream, uint value);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate void StreamReadFn(IntPtr self, IntPtr processor, uint stream, out uint value);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int BltFn(IntPtr self, IntPtr processor, IntPtr view, uint frame, uint count, ref Stream stream);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate void CopyFn(IntPtr self, IntPtr target, IntPtr source);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int MapFn(IntPtr self, IntPtr resource, uint subresource, uint type, uint flags, out Mapped mapped);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate void UnmapFn(IntPtr self, IntPtr resource, uint subresource);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate void FlushFn(IntPtr self);
  private static T Slot<T>(IntPtr obj, int slot) where T : class {
    return (T)(object)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(obj), slot * IntPtr.Size), typeof(T));
  }
  private static void Check(int hr) { Marshal.ThrowExceptionForHR(hr); }
  private static IntPtr Query(IntPtr source, string iid) { Guid id = new Guid(iid); IntPtr result; Check(Marshal.QueryInterface(source, ref id, out result)); return result; }
  internal sealed class Reusable : IDisposable {
    private IntPtr context,videoDevice,videoContext,enumerator,processor,deviceIdentity;
    private readonly IntPtr[] outputs=new IntPtr[2],views=new IntPtr[2];
    internal int Conversions {get;private set;}
    internal bool RectanglesConfirmed {get;private set;}
    internal Reusable(IntPtr device,uint width=1280,uint height=720) {
      if(!((width==1280&&height==720)||(width==640&&height==360)))throw new ArgumentException("unsupported conversion size");
      try {
        deviceIdentity=Query(device,"00000000-0000-0000-c000-000000000046");
        Slot<ContextFn>(device,40)(device,out context);
        videoDevice=Query(device,"10ec4d5b-975a-4689-b9e4-d0aac30fe333");videoContext=Query(context,"61f21c45-3c0e-4a74-9cea-67100d9ad5e4");
        ContentDesc content=new ContentDesc{inN=60,inD=1,inW=InputWidth,inH=InputHeight,outN=60,outD=1,outW=width,outH=height,usage=1};
        Check(Slot<EnumeratorFn>(videoDevice,10)(videoDevice,ref content,out enumerator));
        uint inputFlags,outputFlags;Check(Slot<FormatFn>(enumerator,8)(enumerator,87,out inputFlags));Check(Slot<FormatFn>(enumerator,8)(enumerator,103,out outputFlags));
        if((inputFlags&1)==0 || (outputFlags&2)==0)throw new InvalidOperationException("required conversion formats unavailable");
        Check(Slot<ProcessorFn>(videoDevice,4)(videoDevice,enumerator,0,out processor));
        TextureDesc desc=new TextureDesc{width=width,height=height,mips=1,arrays=1,format=103,samples=1,bind=32};OutputDesc view=new OutputDesc{dimension=1};
        for(int i=0;i<2;i++){Check(Slot<TextureFn>(device,5)(device,ref desc,IntPtr.Zero,out outputs[i]));Check(Slot<OutputFn>(videoDevice,9)(videoDevice,outputs[i],enumerator,ref view,out views[i]));}
        uint inputColor=37,outputColor=21,actualInput=0,actualOutput=0,automatic,format;
        Slot<InputColorFn>(videoContext,28)(videoContext,processor,0,ref inputColor);Slot<OutputColorFn>(videoContext,15)(videoContext,processor,ref outputColor);
        Slot<StreamValueFn>(videoContext,27)(videoContext,processor,0,0);Slot<StreamValueFn>(videoContext,37)(videoContext,processor,0,0);
        Slot<InputColorFn>(videoContext,41)(videoContext,processor,0,ref actualInput);Slot<OutputColorFn>(videoContext,22)(videoContext,processor,ref actualOutput);
        Slot<StreamReadFn>(videoContext,40)(videoContext,processor,0,out format);Slot<StreamReadFn>(videoContext,50)(videoContext,processor,0,out automatic);
        if(actualInput!=37 || actualOutput!=21 || format!=0 || automatic!=0)throw new InvalidOperationException("reusable conversion state differs");
        Rect source=new Rect{right=(int)InputWidth,bottom=(int)InputHeight},target=new Rect{right=(int)width,bottom=(int)height},actual;int enabled;
        double scale=Math.Min(width/(double)InputWidth,height/(double)InputHeight);
        int fittedWidth=Math.Max(2,Math.Min((int)width,((int)Math.Round(InputWidth*scale))&~1)),fittedHeight=Math.Max(2,Math.Min((int)height,((int)Math.Round(InputHeight*scale))&~1));
        int left=(((int)width-fittedWidth)/2)&~1,top=(((int)height-fittedHeight)/2)&~1;
        Rect destination=new Rect{left=left,top=top,right=left+fittedWidth,bottom=top+fittedHeight};
        Color background=new Color{a=1};Slot<BackgroundFn>(videoContext,14)(videoContext,processor,0,ref background);
        Slot<OutputRectFn>(videoContext,13)(videoContext,processor,1,ref target);
        Slot<StreamRectFn>(videoContext,30)(videoContext,processor,0,1,ref source);Slot<StreamRectFn>(videoContext,31)(videoContext,processor,0,1,ref destination);
        Slot<OutputRectReadFn>(videoContext,20)(videoContext,processor,out enabled,out actual);if(enabled!=1||actual.left!=0||actual.top!=0||actual.right!=width||actual.bottom!=height)throw new InvalidOperationException("output rectangle differs");
        Slot<StreamRectReadFn>(videoContext,43)(videoContext,processor,0,out enabled,out actual);if(enabled!=1||actual.left!=0||actual.top!=0||actual.right!=InputWidth||actual.bottom!=InputHeight)throw new InvalidOperationException("source rectangle differs");
        Slot<StreamRectReadFn>(videoContext,44)(videoContext,processor,0,out enabled,out actual);if(enabled!=1||actual.left!=destination.left||actual.top!=destination.top||actual.right!=destination.right||actual.bottom!=destination.bottom)throw new InvalidOperationException("destination rectangle differs");RectanglesConfirmed=true;
      }catch{Dispose();throw;}
    }
    internal IntPtr ConvertTexture(IntPtr input,int slot) {
      if(slot<0 || slot>=2)throw new ArgumentOutOfRangeException("slot");
      TextureDesc desc;Slot<DescFn>(input,10)(input,out desc);
      if(desc.width<InputWidth || desc.height<InputHeight || desc.format!=87 || desc.samples!=1 || desc.mips!=1 || desc.arrays!=1)throw new InvalidOperationException("captured texture layout changed");
      IntPtr owner=IntPtr.Zero,identity=IntPtr.Zero,view=IntPtr.Zero;
      try {
        Slot<ContextFn>(input,3)(input,out owner);identity=Query(owner,"00000000-0000-0000-c000-000000000046");
        if(identity!=deviceIdentity)throw new InvalidOperationException("capture texture belongs to another device");
        InputDesc inDesc=new InputDesc{dimension=1};Check(Slot<InputFn>(videoDevice,8)(videoDevice,input,enumerator,ref inDesc,out view));
        Stream stream=new Stream{enable=1,input=view,inputIndex=(uint)Conversions};
        Check(Slot<BltFn>(videoContext,53)(videoContext,processor,views[slot],(uint)Conversions,1,ref stream));Conversions++;
        return outputs[slot];
      }finally{foreach(IntPtr p in new IntPtr[]{view,identity,owner})if(p!=IntPtr.Zero)Marshal.Release(p);}
    }
    public void Dispose(){
      for(int i=0;i<2;i++){if(views[i]!=IntPtr.Zero){Marshal.Release(views[i]);views[i]=IntPtr.Zero;}if(outputs[i]!=IntPtr.Zero){Marshal.Release(outputs[i]);outputs[i]=IntPtr.Zero;}}
      foreach(IntPtr p in new IntPtr[]{processor,enumerator,videoContext,videoDevice,context,deviceIdentity})if(p!=IntPtr.Zero)Marshal.Release(p);
      processor=enumerator=videoContext=videoDevice=context=deviceIdentity=IntPtr.Zero;
    }
  }
  public static Dictionary<string, object> Run(IntPtr device, Action<IntPtr> useTexture = null, IntPtr capturedInput = default(IntPtr)) {
    IntPtr context = IntPtr.Zero, videoDevice = IntPtr.Zero, videoContext = IntPtr.Zero, enumerator = IntPtr.Zero, processor = IntPtr.Zero;
    IntPtr input = IntPtr.Zero, output = IntPtr.Zero, staging = IntPtr.Zero, inputView = IntPtr.Zero, outputView = IntPtr.Zero, initialPointer = IntPtr.Zero;
    GCHandle pinned = new GCHandle(); bool mapped = false;
    try {
      if (Marshal.SizeOf(typeof(Stream)) != 72 || Marshal.SizeOf(typeof(TextureDesc)) != 44 || Marshal.SizeOf(typeof(ContentDesc)) != 40
        || Marshal.SizeOf(typeof(InputDesc)) != 16 || Marshal.SizeOf(typeof(OutputDesc)) != 16 || Marshal.SizeOf(typeof(Mapped)) != 16)
        throw new InvalidOperationException("unexpected x64 video structure layout");
      Slot<ContextFn>(device, 40)(device, out context);
      videoDevice = Query(device, "10ec4d5b-975a-4689-b9e4-d0aac30fe333");
      videoContext = Query(context, "61f21c45-3c0e-4a74-9cea-67100d9ad5e4");
      ContentDesc content = new ContentDesc { inN=60, inD=1, inW=1280, inH=720, outN=60, outD=1, outW=1280, outH=720, usage=1 };
      Check(Slot<EnumeratorFn>(videoDevice, 10)(videoDevice, ref content, out enumerator));
      uint bgraSupport, nv12Support;
      Check(Slot<FormatFn>(enumerator, 8)(enumerator, 87, out bgraSupport)); Check(Slot<FormatFn>(enumerator, 8)(enumerator, 103, out nv12Support));
      if ((bgraSupport & 1) == 0 || (nv12Support & 2) == 0) throw new InvalidOperationException("required BGRA input / NV12 output unavailable");
      Check(Slot<ProcessorFn>(videoDevice, 4)(videoDevice, enumerator, 0, out processor));
      byte[,] colors = new byte[,] { {0,0,0}, {255,255,255}, {255,0,0}, {0,255,0}, {0,0,255}, {255,255,0}, {0,255,255}, {255,0,255} };
      TextureDesc desc = new TextureDesc { width=1280, height=720, mips=1, arrays=1, format=87, samples=1, bind=32 };
      if(capturedInput==IntPtr.Zero) {
      byte[] pixels = new byte[1280 * 720 * 4];
      for (int y=0; y<720; y++) for (int x=0; x<1280; x++) {
        int bar=x/160, at=(y*1280+x)*4; pixels[at]=colors[bar,2]; pixels[at+1]=colors[bar,1]; pixels[at+2]=colors[bar,0]; pixels[at+3]=255;
      }
      pinned = GCHandle.Alloc(pixels, GCHandleType.Pinned);
      InitialData initial = new InitialData { data=pinned.AddrOfPinnedObject(), pitch=1280*4 };
      initialPointer = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(InitialData))); Marshal.StructureToPtr(initial, initialPointer, false);
      Check(Slot<TextureFn>(device, 5)(device, ref desc, initialPointer, out input));
      } else {
        TextureDesc actual; Slot<DescFn>(capturedInput,10)(capturedInput,out actual);
        if(actual.width!=1280 || actual.height!=720 || actual.format!=87 || actual.samples!=1 || actual.mips!=1 || actual.arrays!=1)
          throw new InvalidOperationException("unexpected captured texture layout");
        IntPtr owner=IntPtr.Zero,ownerIdentity=IntPtr.Zero,deviceIdentity=IntPtr.Zero;
        try {
          Slot<ContextFn>(capturedInput,3)(capturedInput,out owner);
          ownerIdentity=Query(owner,"00000000-0000-0000-c000-000000000046"); deviceIdentity=Query(device,"00000000-0000-0000-c000-000000000046");
          if(ownerIdentity!=deviceIdentity) throw new InvalidOperationException("capture texture belongs to another device");
        } finally {foreach(IntPtr p in new IntPtr[]{deviceIdentity,ownerIdentity,owner}) if(p!=IntPtr.Zero)Marshal.Release(p);}
        Marshal.AddRef(capturedInput); input=capturedInput;
      }
      desc.format=103; Check(Slot<TextureFn>(device, 5)(device, ref desc, IntPtr.Zero, out output));
      desc.usage=3; desc.bind=0; desc.cpu=0x20000; Check(Slot<TextureFn>(device, 5)(device, ref desc, IntPtr.Zero, out staging));
      InputDesc inDesc = new InputDesc { dimension=1 }; OutputDesc outDesc = new OutputDesc { dimension=1 };
      Check(Slot<InputFn>(videoDevice, 8)(videoDevice, input, enumerator, ref inDesc, out inputView));
      Check(Slot<OutputFn>(videoDevice, 9)(videoDevice, output, enumerator, ref outDesc, out outputView));
      // Full-range RGB -> limited-range BT.709 YUV. No deinterlacing/history or automatic enhancements.
      const uint videoProcessing=1, bt709=4, nominalLimited=1u<<4, nominalFull=2u<<4;
      uint inputColor=videoProcessing|bt709|nominalFull, outputColor=videoProcessing|bt709|nominalLimited;
      Slot<InputColorFn>(videoContext, 28)(videoContext, processor, 0, ref inputColor);
      Slot<OutputColorFn>(videoContext, 15)(videoContext, processor, ref outputColor);
      Slot<StreamValueFn>(videoContext, 27)(videoContext, processor, 0, 0);
      Slot<StreamValueFn>(videoContext, 37)(videoContext, processor, 0, 0);
      uint actualInputColor=0, actualOutputColor=0, automatic, frameFormat;
      Slot<InputColorFn>(videoContext, 41)(videoContext, processor, 0, ref actualInputColor);
      Slot<OutputColorFn>(videoContext, 22)(videoContext, processor, ref actualOutputColor);
      Slot<StreamReadFn>(videoContext, 50)(videoContext, processor, 0, out automatic);
      Slot<StreamReadFn>(videoContext, 40)(videoContext, processor, 0, out frameFormat);
      if (actualInputColor!=inputColor || actualOutputColor!=outputColor || automatic!=0 || frameFormat!=0)
        throw new InvalidOperationException("video processor state differs from request");
      Stream stream = new Stream { enable=1, input=inputView };
      Check(Slot<BltFn>(videoContext, 53)(videoContext, processor, outputView, 0, 1, ref stream));
      // Readback é só o oráculo do fixture: não faz parte do pipeline proposto.
      Slot<CopyFn>(context, 47)(context, staging, output); Slot<FlushFn>(context, 111)(context);
      Mapped data; Stopwatch deadline = Stopwatch.StartNew();
      while (true) {
        int hr=Slot<MapFn>(context, 14)(context, staging, 0, 1, 0x100000, out data);
        if (hr == unchecked((int)0x887a000a)) { if (deadline.ElapsedMilliseconds > 3000) throw new TimeoutException("synthetic readback timed out"); Thread.Sleep(1); continue; }
        Check(hr); mapped=true; break;
      }
      if (data.data == IntPtr.Zero || data.rowPitch < 1280 || data.rowPitch > 65536) throw new InvalidOperationException("invalid NV12 readback stride");
      List<object> samples = new List<object>(); int maxError=0;
      for (int row=0; row<4; row++) for (int bar=0; bar<8; bar++) {
        int x=bar*160+80, y=90+row*180, pitch=(int)data.rowPitch;
        int actualY=Marshal.ReadByte(data.data,y*pitch+x), uv=720*pitch+(y/2)*pitch+(x&~1);
        int actualU=Marshal.ReadByte(data.data,uv), actualV=Marshal.ReadByte(data.data,uv+1);
        double r=colors[bar,0], g=colors[bar,1], b=colors[bar,2];
        int expectedY=(int)Math.Round(16+(0.2126*r+0.7152*g+0.0722*b)*219/255);
        int expectedU=(int)Math.Round(128+(-0.114572*r-0.385428*g+0.5*b)*224/255);
        int expectedV=(int)Math.Round(128+(0.5*r-0.454153*g-0.045847*b)*224/255);
        int error=Math.Max(Math.Abs(actualY-expectedY),Math.Max(Math.Abs(actualU-expectedU),Math.Abs(actualV-expectedV))); maxError=Math.Max(maxError,error);
        samples.Add(new int[] { x,y,actualY,actualU,actualV,expectedY,expectedU,expectedV });
      }
      Dictionary<string, object> result = new Dictionary<string, object>();
      result["complete"]=maxError<=3; result["width"]=1280; result["height"]=720; result["inputFormat"]="BGRA8"; result["outputFormat"]="NV12";
      result["bgraSupportFlags"]=bgraSupport; result["nv12SupportFlags"]=nv12Support;
      result["colorSpace"]="full RGB to BT.709 limited YUV"; result["maximumChannelError"]=maxError; result["tolerance"]=3;
      result["inputColorFlags"]=actualInputColor; result["outputColorFlags"]=actualOutputColor;
      result["automaticProcessing"]=automatic; result["frameFormat"]=frameFormat;
      result["rowPitch"]=data.rowPitch; result["samples"]=samples; result["validationReadback"]=true;
      result["syntheticInputUpload"]=capturedInput==IntPtr.Zero; result["capturedTextureDeviceConfirmed"]=capturedInput!=IntPtr.Zero; result["videoProcessorBltCalls"]=1;
      result["scope"]="One synthetic GPU conversion plus staging readback validation; optional downstream texture consumer is reported separately. No WGC frame, copy elimination, throughput, CPU/VRAM or latency proof.";
      if(maxError<=3 && useTexture!=null) {
        Slot<UnmapFn>(context,15)(context,staging,0); mapped=false;
        useTexture(output); result["textureConsumerInvoked"]=true;
      }
      return result;
    } finally {
      if (mapped) Slot<UnmapFn>(context, 15)(context, staging, 0);
      if (initialPointer != IntPtr.Zero) Marshal.FreeHGlobal(initialPointer); if (pinned.IsAllocated) pinned.Free();
      foreach (IntPtr p in new IntPtr[] { outputView,inputView,staging,output,input,processor,enumerator,videoContext,videoDevice,context }) if (p!=IntPtr.Zero) Marshal.Release(p);
    }
  }
}
