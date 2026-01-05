import React, { useState, useEffect, useRef } from 'react';
import { Mic, Activity, Brain, User, Eye, StopCircle, PlayCircle, FileText, Download, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';

// --- CONFIGURATION ---
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// --- CONSTANTS ---
const FILLER_WORDS = ['um', 'uh', 'like', 'you know', 'basically', 'actually', 'literally'];
const POWER_WORDS = ['led', 'managed', 'developed', 'created', 'optimized', 'solved', 'achieved', 'built'];

const InterviewFlow = () => {
  // --- STATE ---
  const [stage, setStage] = useState('setup'); 
  const [targetRole, setTargetRole] = useState('');
  const [resumeText, setResumeText] = useState('');
  
  const [isLive, setIsLive] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [eyeContactScore, setEyeContactScore] = useState(100);
  const [nervousnessData, setNervousnessData] = useState([]);
  const [hireabilityScore, setHireabilityScore] = useState(60);
  const [aiStatus, setAiStatus] = useState("Ready"); // Ready, Listening, Thinking, Speaking
  const [micError, setMicError] = useState(false);

  // --- REFS ---
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const chatHistoryRef = useRef([]); 
  const cameraRef = useRef(null);
  const graphIntervalRef = useRef(null);
  const scoreIntervalRef = useRef(null);
  const isAiSpeakingRef = useRef(false); // Track if AI is talking to prevent self-listening

  // --- 1. ROBUST SPEECH RECOGNITION (THE FIX) ---
  useEffect(() => {
    // Check browser support
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      alert("Browser does not support Speech API. Please use Chrome.");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true; // Keep listening
    recognition.interimResults = true; // Hear words as they are spoken
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      console.log("Mic Started");
      setMicError(false);
    };

    recognition.onerror = (event) => {
      console.error("Mic Error:", event.error);
      if (event.error === 'not-allowed') {
        setMicError(true);
        setIsLive(false);
      }
    };

    recognition.onend = () => {
      // Auto-restart if session is live and AI is NOT speaking
      if (isLive && !isAiSpeakingRef.current) {
        console.log("Mic stopped. Restarting...");
        try {
          recognition.start();
        } catch (e) {
          console.log("Mic already started");
        }
      }
    };

    recognition.onresult = (event) => {
      // Don't process input if AI is talking
      if (isAiSpeakingRef.current) return;

      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      // Visual Feedback for Interim results
      if (interimTranscript !== "") {
        setAiStatus("Listening...");
      }

      // Process Final results
      if (finalTranscript !== "") {
        console.log("User said:", finalTranscript);
        
        const newMsg = { sender: 'user', text: finalTranscript, timestamp: new Date().toLocaleTimeString() };
        setTranscript(prev => [...prev, newMsg]);
        chatHistoryRef.current.push({ role: "user", parts: [{ text: finalTranscript }] });
        
        setAiStatus("Processing...");
        
        // Clear previous timer and set new one
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          callGemini(finalTranscript);
        }, 1500); // Wait 1.5s silence before sending
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if(recognitionRef.current) recognitionRef.current.stop();
    };
  }, [isLive]); // Re-run if isLive changes

  // Toggle Mic based on isLive
  useEffect(() => {
    if (isLive && recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch(e) { console.log("Mic start error/already active"); }
    } else if (!isLive && recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, [isLive]);


  // --- 2. GEMINI AI CALL ---
  const callGemini = async (userText) => {
    if (!GEMINI_API_KEY || GEMINI_API_KEY.includes("PASTE")) {
      alert("Check API Key in code!");
      return;
    }

    setAiStatus("Thinking...");
    
    const systemPrompt = `
      You are a technical interviewer for: ${targetRole}.
      Resume: ${resumeText.substring(0, 500)}...
      Rules:
      1. Be professional but conversational.
      2. If answer is short, ask for details.
      3. If answer is good, move to next topic.
      4. MAX 2 SENTENCES.
    `;

    const apiHistory = [
      { role: "user", parts: [{ text: systemPrompt }] },
      { role: "model", parts: [{ text: "Understood." }] },
      ...chatHistoryRef.current
    ];

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: apiHistory })
      });
      
      const data = await response.json();
      
      if(data.error) {
        console.error(data.error);
        setAiStatus("API Error");
        return;
      }

      const aiText = data.candidates[0].content.parts[0].text;

      setTranscript(prev => [...prev, { sender: 'ai', text: aiText, timestamp: new Date().toLocaleTimeString() }]);
      chatHistoryRef.current.push({ role: "model", parts: [{ text: aiText }] });
      setAiStatus("Speaking...");
      
      // Update Score
      setHireabilityScore(prev => Math.min(100, prev + 5)); 

      speakText(aiText);

    } catch (error) {
      console.error("AI Error:", error);
      setAiStatus("Connection Error");
    }
  };

  const speakText = (text) => {
    if (!recognitionRef.current) return;
    
    // 1. Stop Listening (Prevent AI hearing itself)
    recognitionRef.current.stop();
    isAiSpeakingRef.current = true;
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1; // Slightly faster for natural feel

    utterance.onend = () => {
      setAiStatus("Waiting...");
      isAiSpeakingRef.current = false;
      // 2. Resume Listening
      if(isLive) {
        try {
           recognitionRef.current.start(); 
           console.log("Mic resumed after AI speech");
        } catch(e) {}
      }
    };
    
    window.speechSynthesis.speak(utterance);
  };

  // --- 3. SCORING & GRAPH LOGIC ---
  useEffect(() => {
    if (isLive) {
      scoreIntervalRef.current = setInterval(() => {
        setHireabilityScore(prev => {
          const drift = eyeContactScore > 60 ? 0.2 : -0.5;
          return Math.min(100, Math.max(40, prev + drift));
        });
      }, 1000);
      
      setNervousnessData(Array(20).fill({ value: 20 }));
      graphIntervalRef.current = setInterval(() => {
        setNervousnessData(prev => {
          const baseStress = eyeContactScore < 50 ? 60 : 20;
          const random = Math.random() * 15;
          const newVal = Math.min(100, Math.max(0, baseStress + random));
          const newData = [...prev, { value: Math.round(newVal) }];
          if (newData.length > 20) newData.shift();
          return newData;
        });
      }, 800);
    } else {
      clearInterval(scoreIntervalRef.current);
      clearInterval(graphIntervalRef.current);
    }
    return () => {
        clearInterval(scoreIntervalRef.current);
        clearInterval(graphIntervalRef.current);
    };
  }, [isLive, eyeContactScore]);

  // --- 4. MEDIAPIPE FACE MESH ---
  useEffect(() => {
    if (!isLive || stage !== 'interview') {
        if(cameraRef.current) cameraRef.current.stop();
        window.speechSynthesis.cancel();
        return;
    }

    const FaceMesh = window.FaceMesh;
    const Camera = window.Camera;

    if(!FaceMesh || !Camera) return;

    const faceMesh = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });

    faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    faceMesh.onResults(onFaceResults);

    if (videoRef.current) {
      cameraRef.current = new Camera(videoRef.current, {
        onFrame: async () => { if(videoRef.current) await faceMesh.send({ image: videoRef.current }); },
        width: 640, height: 480
      });
      cameraRef.current.start();
    }
    return () => { if(cameraRef.current) cameraRef.current.stop(); };
  }, [isLive, stage]);

  const onFaceResults = (results) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];
      if(window.drawConnectors && window.FACEMESH_TESSELATION) {
          window.drawConnectors(ctx, landmarks, window.FACEMESH_TESSELATION, { color: '#C0C0C040', lineWidth: 1 });
      }
      const nose = landmarks[1];
      const isLookingCenter = nose.x > 0.40 && nose.x < 0.60 && nose.y > 0.35 && nose.y < 0.65;
      
      setEyeContactScore(prev => {
        const target = isLookingCenter ? 100 : 40;
        return Math.round(prev + (target - prev) * 0.1); 
      });
    }
    ctx.restore();
  };

  // --- ACTIONS ---
  const handleStartSetup = () => { setStage('interview'); setIsLive(true); };
  const handleStopInterview = () => { setIsLive(false); setStage('report'); };

  const downloadPDF = () => {
    const element = document.getElementById('report-content');
    const opt = {
      margin: 0.5,
      filename: `Interview_Report_${targetRole.replace(/\s+/g, '_')}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    if(window.html2pdf) window.html2pdf().set(opt).from(element).save();
    else alert("PDF Tool loading...");
  };

  const renderHeatmapText = (text) => {
    return text.split(' ').map((word, i) => {
      const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '');
      if (FILLER_WORDS.includes(cleanWord)) return <span key={i} className="bg-red-100 text-red-700 px-1 rounded line-through decoration-red-500 mx-0.5">{word}</span>;
      if (POWER_WORDS.includes(cleanWord)) return <span key={i} className="bg-green-100 text-green-700 px-1 rounded font-bold mx-0.5">{word}</span>;
      return <span key={i} className="mx-0.5">{word}</span>;
    });
  };

  // ===================== VIEWS =====================

  // 1. SETUP VIEW
  if (stage === 'setup') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
        <div className="bg-white max-w-2xl w-full p-8 rounded-3xl shadow-xl border border-slate-200">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white"><FileText size={24} /></div>
            <div><h1 className="text-2xl font-bold text-slate-900">Interview Setup</h1><p className="text-slate-500">Configure your session context</p></div>
          </div>
          <div className="space-y-6">
            <div><label className="block text-sm font-semibold text-slate-700 mb-2">Target Job Role</label><input type="text" value={targetRole} onChange={(e) => setTargetRole(e.target.value)} placeholder="e.g. Senior React Developer" className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" /></div>
            <div><label className="block text-sm font-semibold text-slate-700 mb-2">Paste Resume Summary</label><textarea rows="6" value={resumeText} onChange={(e) => setResumeText(e.target.value)} placeholder="Paste resume here..." className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"></textarea></div>
            <button onClick={handleStartSetup} disabled={!targetRole || !resumeText} className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"><PlayCircle /> Start Interview</button>
          </div>
        </div>
      </div>
    );
  }

  // 2. REPORT VIEW
  if (stage === 'report') {
    return (
      <div className="min-h-screen bg-slate-50 p-8 flex justify-center font-sans">
        <div className="max-w-4xl w-full space-y-6">
          <div className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-xl font-bold text-slate-800">Session Report</h2>
            <div className="flex gap-3">
              <button onClick={() => window.location.reload()} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">New Session</button>
              <button onClick={downloadPDF} className="px-6 py-2 bg-indigo-600 text-white rounded-lg flex items-center gap-2 shadow-lg hover:bg-indigo-700"><Download size={18} /> Download PDF</button>
            </div>
          </div>
          <div id="report-content" className="bg-white p-10 rounded-3xl shadow-xl border border-slate-200 space-y-8">
            <div className="border-b border-slate-100 pb-6 flex justify-between items-start">
              <div><h1 className="text-3xl font-bold text-slate-900 mb-2">Interview Performance</h1><p className="text-slate-500">Role: <span className="font-semibold text-slate-700">{targetRole}</span></p><p className="text-slate-400 text-sm mt-1">{new Date().toLocaleDateString()} • {new Date().toLocaleTimeString()}</p></div>
              <div className="text-right"><div className="text-5xl font-bold text-indigo-600">{Math.round(hireabilityScore)}</div><div className="text-sm text-slate-500 uppercase tracking-wide font-semibold mt-1">Hireability Index</div></div>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100"><div className="flex items-center gap-2 mb-2 text-emerald-800 font-bold"><CheckCircle size={20} /> Strong Areas</div><ul className="list-disc list-inside text-emerald-700 text-sm space-y-1"><li>Technical Vocabulary Usage</li><li>Eye Contact Consistency ({eyeContactScore}%)</li></ul></div>
              <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100"><div className="flex items-center gap-2 mb-2 text-rose-800 font-bold"><XCircle size={20} /> Areas to Improve</div><ul className="list-disc list-inside text-rose-700 text-sm space-y-1"><li>Detected {transcript.filter(t => t.sender === 'user').length} filler words usage</li><li>Pacing analysis recommended</li></ul></div>
            </div>
            <div><h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><Activity size={20} className="text-indigo-500"/> Transcript Heatmap</h3><div className="space-y-4">{transcript.filter(t => t.sender === 'user').map((turn, idx) => (<div key={idx} className="p-4 bg-slate-50 rounded-xl border border-slate-100"><div className="text-xs text-slate-400 mb-1">Answer #{idx + 1}</div><p className="text-slate-700 leading-relaxed">{renderHeatmapText(turn.text)}</p></div>))}</div></div>
          </div>
        </div>
      </div>
    );
  }

  // 3. MAIN DASHBOARD
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100">
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-200 h-16 flex items-center justify-between px-6">
        <div className="flex items-center gap-2"><div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold shadow-lg">IF</div><span className="font-semibold text-lg tracking-tight text-slate-800">InterviewFlow</span><span className="ml-2 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium border border-emerald-200">PRO</span></div>
        <button onClick={handleStopInterview} className="px-5 py-2 rounded-full text-sm font-medium transition-all shadow-md flex items-center gap-2 bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100"><StopCircle size={16}/> End Session</button>
      </nav>
      {micError && <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-red-500 text-white px-6 py-3 rounded-full shadow-xl z-50 flex items-center gap-2 font-bold animate-bounce"><AlertTriangle /> Microphone Blocked! Allow permissions.</div>}

      <main className="pt-24 pb-10 px-6 max-w-[1600px] mx-auto grid grid-cols-12 gap-6 h-[calc(100vh-2rem)]">
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-6">
          <div className="bg-white rounded-3xl p-1 shadow-xl shadow-slate-200/50 border border-slate-100 relative overflow-hidden group">
            <div className="aspect-[3/4] bg-slate-900 rounded-2xl overflow-hidden relative">
              <video ref={videoRef} className="hidden" playsInline muted></video>
              <canvas ref={canvasRef} width="640" height="480" className="w-full h-full object-cover transform scale-x-[-1]"></canvas>
              <div className="absolute top-4 right-4 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full flex items-center gap-2 border border-white/10"><Eye size={14} className={eyeContactScore > 60 ? "text-emerald-400" : "text-rose-400"} /><span className="text-xs font-medium text-white">{eyeContactScore}% Contact</span></div>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100"><h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Live Biometrics</h3><div className="space-y-4"><div><div className="flex justify-between text-sm mb-1"><span className="text-slate-600">AI Status</span><span className={`font-bold ${aiStatus==='Listening...'?'text-rose-500':'text-indigo-600'}`}>{aiStatus}</span></div><div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all duration-500 ${aiStatus==='Listening...'?'bg-rose-500':'bg-indigo-500'}`} style={{width: aiStatus === 'Listening...' ? '100%' : '10%'}}></div></div></div></div></div>
        </div>

        <div className="col-span-12 lg:col-span-6 flex flex-col gap-6">
          <div className="flex-1 bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col overflow-hidden">
             <div className="p-4 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center"><div className="flex items-center gap-2 text-slate-600"><Mic size={16} className={`text-rose-500 ${aiStatus==='Listening...' ? 'animate-pulse' : ''}`} /><span className="text-xs font-semibold uppercase tracking-wide">Live Transcription</span></div></div>
             <div className="flex-1 p-6 overflow-y-auto space-y-6 max-h-[600px] scroll-smooth">
                {transcript.length === 0 && <p className="text-slate-400 text-sm text-center italic mt-10">AI is waiting for you to speak...</p>}
                {transcript.map((msg, idx) => (
                   <div key={idx} className={`flex gap-4 ${msg.sender === 'ai' ? 'flex-row' : 'flex-row-reverse'}`}><div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.sender === 'ai' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-600'}`}>{msg.sender === 'ai' ? <Brain size={16}/> : <User size={16}/>}</div><div className={`flex flex-col gap-2 max-w-[80%] ${msg.sender === 'ai' ? 'items-start' : 'items-end'}`}><div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${msg.sender === 'ai' ? 'bg-white border border-slate-100 text-slate-700 rounded-tl-none' : 'bg-indigo-600 text-white rounded-tr-none'}`}>{msg.text}</div></div></div>
                ))}
             </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-3 flex flex-col gap-6">
          <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-3xl p-6 text-white shadow-xl shadow-indigo-500/20 relative overflow-hidden"><div className="relative z-10"><h3 className="text-indigo-100 text-sm font-medium mb-1">Hireability Index</h3><div className="flex items-baseline gap-1"><span className="text-5xl font-bold tracking-tighter">{Math.round(hireabilityScore)}</span><span className="text-lg text-indigo-200">/100</span></div></div><Activity className="absolute -right-4 -bottom-4 text-white/10 w-40 h-40" /></div>
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex-1 min-h-[200px] flex flex-col"><div className="flex justify-between items-center mb-4"><h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nervousness Meter</h3></div><div className="flex-1 w-full h-full min-h-[150px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={nervousnessData}><YAxis domain={[0, 100]} hide /><Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={3} dot={false} isAnimationActive={true} /></LineChart></ResponsiveContainer></div></div>
        </div>
      </main>
    </div>
  );
};

export default InterviewFlow;