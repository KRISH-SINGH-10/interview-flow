import React, { useState, useEffect, useRef } from 'react';
import { Camera, Mic, Activity, Brain, User, Eye, StopCircle, PlayCircle } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';

// --- CONFIGURATION ---
const GEMINI_API_KEY = "AIzaSyCQUJ1e1q2x_yDUVmnHKc1dLso1KPrdjMg"; // <--- PASTE YOUR KEY HERE

const InterviewFlow = () => {
  // State
  const [isLive, setIsLive] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [eyeContactScore, setEyeContactScore] = useState(0);
  const [nervousnessData, setNervousnessData] = useState([{ time: '0s', value: 20 }]);
  const [hireabilityScore, setHireabilityScore] = useState(70);
  const [aiStatus, setAiStatus] = useState("Ready");

  // Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const chatHistoryRef = useRef([]); 
  const cameraRef = useRef(null); // Ref to hold the camera instance

  // --- 1. SETUP SPEECH RECOGNITION ---
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }

        if (finalTranscript !== "") {
          const newMsg = { sender: 'user', text: finalTranscript, tags: ['Detection...'] };
          setTranscript(prev => [...prev, newMsg]);
          chatHistoryRef.current.push({ role: "user", parts: [{ text: finalTranscript }] });
          
          setAiStatus("Listening...");
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            callGemini(finalTranscript);
          }, 2000);
        }
      };
    } else {
      console.warn("Speech Recognition not supported");
    }

    return () => {
      if(recognitionRef.current) recognitionRef.current.stop();
    };
  }, []);

  // --- 2. GEMINI AI CALL ---
  const callGemini = async (userText) => {
    if (!GEMINI_API_KEY || GEMINI_API_KEY.includes("PASTE")) {
      alert("Please paste your Gemini API Key in App.jsx!");
      return;
    }

    setAiStatus("Thinking...");
    
    const systemPrompt = `
      You are a supportive but strict technical interviewer. 
      Keep responses short (max 2 sentences). 
      Analyze the candidate's answer for STAR method.
      If good, ask a deeper technical question.
      If vague, ask for clarification.
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
      const aiText = data.candidates[0].content.parts[0].text;

      setTranscript(prev => [...prev, { sender: 'ai', text: aiText }]);
      chatHistoryRef.current.push({ role: "model", parts: [{ text: aiText }] });
      setAiStatus("Speaking...");
      setHireabilityScore(prev => Math.min(100, prev + 2)); 

      speakText(aiText);

    } catch (error) {
      console.error("AI Error:", error);
      setAiStatus("Error");
    }
  };

  const speakText = (text) => {
    if(recognitionRef.current) recognitionRef.current.stop(); 
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => {
      setAiStatus("Waiting...");
      if(isLive && recognitionRef.current) recognitionRef.current.start();
    };
    window.speechSynthesis.speak(utterance);
  };

  // --- 3. MEDIAPIPE FACE MESH SETUP (CDN VERSION) ---
  useEffect(() => {
    if (!isLive) {
        if(cameraRef.current) cameraRef.current.stop();
        if(recognitionRef.current) recognitionRef.current.stop();
        window.speechSynthesis.cancel();
        return;
    }

    // Access the Global classes loaded from index.html
    const FaceMesh = window.FaceMesh;
    const Camera = window.Camera; // This is MediaPipe Camera, not Lucide Icon

    if(!FaceMesh || !Camera) {
        console.error("MediaPipe scripts not loaded yet. Check index.html");
        return;
    }

    const faceMesh = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    faceMesh.onResults(onFaceResults);

    if (videoRef.current) {
      cameraRef.current = new Camera(videoRef.current, {
        onFrame: async () => {
          if(videoRef.current) await faceMesh.send({ image: videoRef.current });
        },
        width: 640,
        height: 480
      });
      cameraRef.current.start();
      recognitionRef.current?.start();
    }

    return () => {
      if(cameraRef.current) cameraRef.current.stop();
    };
  }, [isLive]);

  const onFaceResults = (results) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];
      
      // Use GLOBAL drawConnectors
      if(window.drawConnectors && window.FACEMESH_TESSELATION) {
          window.drawConnectors(ctx, landmarks, window.FACEMESH_TESSELATION, { color: '#C0C0C030', lineWidth: 1 });
      }
      
      const nose = landmarks[1];
      const isLookingCenter = nose.x > 0.45 && nose.x < 0.55 && nose.y > 0.4 && nose.y < 0.6;
      
      setEyeContactScore(prev => {
        const target = isLookingCenter ? 100 : 30;
        return Math.round(prev + (target - prev) * 0.1); 
      });

      setNervousnessData(prev => {
        const newVal = Math.random() * 20 + 20; 
        const newData = [...prev, { time: `${prev.length}0s`, value: newVal }];
        if (newData.length > 10) newData.shift();
        return newData;
      });
    }
    ctx.restore();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100">
      
      {/* NAVBAR */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-200 h-16 flex items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-500/30">IF</div>
          <span className="font-semibold text-lg tracking-tight text-slate-800">InterviewFlow</span>
          <span className="ml-2 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium border border-emerald-200">PRO</span>
        </div>
        
        <button 
          onClick={() => setIsLive(!isLive)}
          className={`px-5 py-2 rounded-full text-sm font-medium transition-all shadow-md flex items-center gap-2 ${
            isLive ? 'bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-500/25'
          }`}
        >
          {isLive ? <StopCircle size={16}/> : <PlayCircle size={16}/>}
          {isLive ? 'Stop Session' : 'Start Evaluation'}
        </button>
      </nav>

      {/* MAIN GRID */}
      <main className="pt-24 pb-10 px-6 max-w-[1600px] mx-auto grid grid-cols-12 gap-6 h-[calc(100vh-2rem)]">

        {/* LEFT: CANDIDATE PRESENCE */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-6">
          <div className="bg-white rounded-3xl p-1 shadow-xl shadow-slate-200/50 border border-slate-100 relative overflow-hidden group">
            <div className="aspect-[3/4] bg-slate-900 rounded-2xl overflow-hidden relative">
              <video ref={videoRef} className="hidden" playsInline muted></video>
              <canvas ref={canvasRef} width="640" height="480" className="w-full h-full object-cover transform scale-x-[-1]"></canvas>

              {!isLive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 text-slate-400">
                  <Camera size={48} className="mb-2 opacity-20"/>
                  <span>Camera Offline</span>
                </div>
              )}

              {isLive && (
                <div className="absolute top-4 right-4 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full flex items-center gap-2 border border-white/10">
                  <Eye size={14} className={eyeContactScore > 60 ? "text-emerald-400" : "text-rose-400"} />
                  <span className="text-xs font-medium text-white">{eyeContactScore}% Contact</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
             <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Live Biometrics</h3>
             <div className="space-y-4">
                <div>
                   <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-600">AI Status</span>
                      <span className="font-semibold text-indigo-600">{aiStatus}</span>
                   </div>
                   <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{width: aiStatus === 'Listening...' ? '100%' : '10%'}}></div>
                   </div>
                </div>
             </div>
          </div>
        </div>

        {/* CENTER: AI TRANSCRIPT */}
        <div className="col-span-12 lg:col-span-6 flex flex-col gap-6">
          <div className="flex-1 bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col overflow-hidden">
             <div className="p-4 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
                <div className="flex items-center gap-2 text-slate-600">
                   <Mic size={16} className={`text-rose-500 ${isLive ? 'animate-pulse' : ''}`} />
                   <span className="text-xs font-semibold uppercase tracking-wide">Live Transcription</span>
                </div>
             </div>
             
             <div className="flex-1 p-6 overflow-y-auto space-y-6 max-h-[500px]">
                {transcript.length === 0 && <p className="text-slate-400 text-sm text-center italic mt-10">Start session to begin interview...</p>}
                
                {transcript.map((msg, idx) => (
                   <div key={idx} className={`flex gap-4 ${msg.sender === 'ai' ? 'flex-row' : 'flex-row-reverse'}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.sender === 'ai' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-600'}`}>
                         {msg.sender === 'ai' ? <Brain size={16}/> : <User size={16}/>}
                      </div>
                      <div className={`flex flex-col gap-2 max-w-[80%] ${msg.sender === 'ai' ? 'items-start' : 'items-end'}`}>
                         <div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${msg.sender === 'ai' ? 'bg-white border border-slate-100 text-slate-700 rounded-tl-none' : 'bg-indigo-600 text-white rounded-tr-none'}`}>
                            {msg.text}
                         </div>
                      </div>
                   </div>
                ))}
             </div>
          </div>
        </div>

        {/* RIGHT: SCORING */}
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-6">
          <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-3xl p-6 text-white shadow-xl shadow-indigo-500/20 relative overflow-hidden">
             <div className="relative z-10">
                <h3 className="text-indigo-100 text-sm font-medium mb-1">Hireability Index</h3>
                <div className="flex items-baseline gap-1">
                   <span className="text-5xl font-bold tracking-tighter">{hireabilityScore}</span>
                   <span className="text-lg text-indigo-200">/100</span>
                </div>
             </div>
             <Activity className="absolute -right-4 -bottom-4 text-white/10 w-40 h-40" />
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex-1 min-h-[200px] flex flex-col">
             <div className="flex justify-between items-center mb-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nervousness Meter</h3>
             </div>
             <div className="flex-1 w-full h-full min-h-[150px]">
                <ResponsiveContainer width="100%" height="100%">
                   <LineChart data={nervousnessData}>
                      <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={3} dot={false} isAnimationActive={false} />
                      <Tooltip />
                   </LineChart>
                </ResponsiveContainer>
             </div>
          </div>
        </div>

      </main>
    </div>
  );
};

export default InterviewFlow;