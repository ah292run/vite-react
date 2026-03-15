import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  Upload, X, Image as ImageIcon, Sparkles, Wand2, 
  Loader2, Maximize, Layers, Download, Check, 
  LayoutGrid, Crop, Trash2, CheckSquare, Square, AlertCircle,
  Info, ZoomIn
} from 'lucide-react';

// 여기에 본인의 Google AI Studio API 키를 입력하세요. (고정 링크에서 기능을 쓰려면 필수입니다)
const apiKey = ""; 

export default function App() {
  const [activeTab, setActiveTab] = useState('create'); 
  const [images, setImages] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]); 
  const [prompt, setPrompt] = useState("");
  const [numImages, setNumImages] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [selectedRefId, setSelectedRefId] = useState(null);
  const [width, setWidth] = useState(1080);
  const [height, setHeight] = useState(1080);
  const [isResizing, setIsResizing] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);

  const fileInputRef = useRef(null);

  const getTabConfig = () => {
    switch(activeTab) {
      case 'create': return { title: "AI 이미지 생성", desc: "텍스트 프롬프트를 입력하여 새로운 이미지를 생성합니다.", btnText: "AI 새 이미지 생성", btnIcon: <Sparkles className="w-5 h-5" /> };
      case 'edit': return { title: "레퍼런스 편집", desc: "워크스페이스 사진을 클릭(주황색)하고 변형할 내용을 입력하세요.", btnText: "선택 사진 참조 편집", btnIcon: <Layers className="w-5 h-5" /> };
      case 'resize': return { title: "스마트 리사이즈", desc: "설정한 사이즈에 맞춰 이미지를 비율 유지하며 일괄 크롭합니다.", btnText: "스마트 리사이즈 실행", btnIcon: <Crop className="w-5 h-5" /> };
      default: return {};
    }
  };

  const handleFiles = (files) => {
    const newImages = Array.from(files).filter(file => file.type.startsWith('image/')).map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      url: URL.createObjectURL(file),
      name: file.name,
      type: 'uploaded'
    }));
    setImages(prev => [...newImages, ...prev]);
  };

  const removeImage = (id) => {
    setImages(prev => prev.filter(img => img.id !== id));
    setSelectedIds(prev => prev.filter(sid => sid !== id));
    if (selectedRefId === id) setSelectedRefId(null);
    if (previewImage?.id === id) setPreviewImage(null);
  };

  const clearWorkspace = () => { setImages([]); setSelectedIds([]); setSelectedRefId(null); };

  const handleExecute = () => {
    if (activeTab === 'create') generateImages();
    else if (activeTab === 'edit') editWithReference();
    else if (activeTab === 'resize') batchResize();
  };

  const generateImages = async () => {
    if (!prompt.trim()) { showError("프롬프트를 입력해주세요."); return; }
    setIsGenerating(true);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instances: [{ prompt: `${prompt}. (Aspect ratio: ${width}:${height})` }], parameters: { sampleCount: parseInt(numImages) } })
      });
      const result = await response.json();
      const newAiImages = result.predictions.map((pred, index) => ({
        id: Math.random().toString(36).substr(2, 9),
        url: `data:image/png;base64,${pred.bytesBase64Encoded}`,
        name: `AI_${width}x${height}_${index + 1}`,
        type: 'ai'
      }));
      setImages(prev => [...newAiImages, ...prev]);
    } catch (err) { showError("AI 생성 중 오류 발생"); } finally { setIsGenerating(false); }
  };

  const editWithReference = async () => {
    const refImage = images.find(img => img.id === selectedRefId);
    if (!refImage || !prompt.trim()) { showError("참조 사진을 선택하세요."); return; }
    setIsGenerating(true);
    try {
      let base64;
      if (refImage.url.startsWith('data:')) { base64 = refImage.url.split(',')[1]; }
      else {
        const resp = await fetch(refImage.url); const blob = await resp.blob();
        base64 = await new Promise(r => { const rd = new FileReader(); rd.onloadend = () => r(rd.result.split(',')[1]); rd.readAsDataURL(blob); });
      }
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: `Edit. Prompt: ${prompt}. Size: ${width}x${height}.` }, { inlineData: { mimeType: "image/png", data: base64 } }] }] })
      });
      const res = await response.json();
      const data = res.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
      setImages(prev => [{ id: Math.random().toString(36).substr(2, 9), url: `data:image/png;base64,${data}`, name: `Edited_${width}x${height}`, type: 'ai' }, ...prev]);
    } catch (err) { showError("편집 중 오류 발생"); } finally { setIsGenerating(false); }
  };

  const batchResize = async () => {
    const targets = selectedIds.length > 0 ? images.filter(img => selectedIds.includes(img.id)) : images.filter(img => img.type !== 'resized');
    if (targets.length === 0) { showError("사진을 선택해주세요."); return; }
    setIsResizing(true);
    for (const img of targets) {
      const url = await new Promise(res => {
        const i = new Image(); i.crossOrigin = "Anonymous";
        i.onload = () => {
          const c = document.createElement('canvas'); c.width = width; c.height = height;
          const ctx = c.getContext('2d');
          const tA = width/height; const iA = i.width/i.height;
          let sx=0, sy=0, sw=i.width, sh=i.height;
          if (iA > tA) { sw = i.height*tA; sx = (i.width-sw)/2; } else if (iA < tA) { sh = i.width/tA; sy = (i.height-sh)/2; }
          ctx.drawImage(i, sx, sy, sw, sh, 0, 0, width, height); res(c.toDataURL('image/png'));
        }; i.src = img.url;
      });
      setImages(prev => [{ id: Math.random().toString(36).substr(2, 9), url, name: `Crop_${width}x${height}`, type: 'resized' }, ...prev]);
    }
    setIsResizing(false); setSelectedIds([]);
  };

  const showError = (msg) => { setError(msg); setTimeout(() => setError(null), 3000); };
  const downloadImage = (url, name) => { const l = document.createElement('a'); l.href = url; l.download = name; l.click(); };
  const batchDownload = () => { images.filter(img => selectedIds.includes(img.id)).forEach((img, idx) => { setTimeout(() => downloadImage(img.url, img.name), idx * 300); }); };
  const toggleSelect = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  const selectAll = () => setSelectedIds(selectedIds.length === images.length ? [] : images.map(img => img.id));

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-900 pb-20">
      <nav className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200 px-6 h-16 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2"><div className="bg-indigo-600 p-2 rounded-xl"><Sparkles className="w-5 h-5 text-white" /></div><span className="font-black text-xl">Studio Pro</span></div>
        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
          {[{ id: 'create', label: 'AI 생성', icon: Sparkles }, { id: 'edit', label: '편집', icon: Layers }, { id: 'resize', label: '리사이즈', icon: Crop }].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${activeTab === tab.id ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200' : 'text-slate-400 hover:text-indigo-600'}`}>
              <tab.icon className="w-4 h-4" /><span>{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8 grid lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-indigo-50 border border-indigo-100 p-5 rounded-[1.5rem] flex gap-3">
            <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div className="text-[12px] text-indigo-800 leading-relaxed"><p className="font-black mb-1">{getTabConfig().title}</p><li>{getTabConfig().desc}</li></div>
          </section>

          <section className="bg-white rounded-[2rem] border border-slate-200 p-7 space-y-6 shadow-xl">
            <div className="grid grid-cols-2 gap-3">
              <input type="number" value={width} onChange={e => setWidth(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm" placeholder="Width" />
              <input type="number" value={height} onChange={e => setHeight(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm" placeholder="Height" />
            </div>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="설명을 입력하세요..." className="w-full h-28 p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-none" />
            <button onClick={handleExecute} disabled={isGenerating || isResizing} className={`w-full py-5 text-white font-black rounded-xl shadow-lg flex items-center justify-center gap-2 ${activeTab === 'create' ? 'bg-indigo-600' : activeTab === 'edit' ? 'bg-orange-500' : 'bg-emerald-600'}`}>
              {isGenerating || isResizing ? <Loader2 className="animate-spin w-5 h-5" /> : getTabConfig().btnIcon}{getTabConfig().btnText}
            </button>
          </section>

          <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-slate-200 rounded-[2rem] p-10 flex flex-col items-center justify-center bg-white hover:bg-indigo-50/30 cursor-pointer transition-all">
            <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={e => handleFiles(e.target.files)} />
            <Upload className="w-6 h-6 text-slate-400 mb-3" /><p className="font-black text-slate-700">이미지 업로드</p>
          </div>
        </div>

        <div className="lg:col-span-8 space-y-6">
          <div className="flex justify-between items-center bg-white p-5 rounded-[1.5rem] border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3"><LayoutGrid className="w-5 h-5 text-slate-500" /><div><h2 className="text-lg font-black">워크스페이스</h2><p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">Total: {images.length}</p></div></div>
            {images.length > 0 && (
              <div className="flex gap-2">
                {selectedIds.length > 0 && <button onClick={batchDownload} className="px-4 py-2 bg-indigo-600 text-white text-xs font-black rounded-xl">다운로드</button>}
                <button onClick={clearWorkspace} className="p-2 text-slate-400 hover:text-rose-500"><Trash2 className="w-5 h-5" /></button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            {images.map(img => (
              <div key={img.id} onClick={() => activeTab === 'edit' ? setSelectedRefId(selectedRefId === img.id ? null : img.id) : toggleSelect(img.id)} onDoubleClick={() => setPreviewImage(img)} className={`relative aspect-square rounded-[1.8rem] overflow-hidden bg-white ring-1 ring-slate-200 transition-all ${selectedIds.includes(img.id) ? 'ring-4 ring-indigo-500' : selectedRefId === img.id ? 'ring-4 ring-orange-500' : ''}`}>
                <img src={img.url} className="w-full h-full object-cover" alt="" />
                {selectedRefId === img.id && <div className="absolute top-4 left-4 bg-orange-500 text-white px-3 py-1 rounded-full text-[10px] font-black shadow-lg">참조 중</div>}
                <div className="absolute inset-0 bg-slate-900/40 opacity-0 hover:opacity-100 flex flex-col items-center justify-center text-white p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest mb-1 opacity-70">Double Click</p>
                  <p className="text-xs font-black flex items-center gap-1"><ZoomIn className="w-4 h-4" /> 크게 보기</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {previewImage && (
        <div className="fixed inset-0 z-[100] bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center p-6" onClick={() => setPreviewImage(null)}>
          <img src={previewImage.url} className="max-h-[70vh] rounded-[2rem] shadow-2xl mb-8" alt="" onClick={e => e.stopPropagation()} />
          <button onClick={() => downloadImage(previewImage.url, previewImage.name)} className="bg-indigo-600 text-white px-10 py-5 rounded-2xl font-black">파일 다운로드</button>
        </div>
      )}
    </div>
  );
}
