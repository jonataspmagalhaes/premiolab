'use client';

import { useEffect, useRef } from 'react';

// ═══════ Particle Network Canvas ═══════
function ParticleCanvas() {
  var canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(function () {
    var c = canvasRef.current;
    if (!c) return;
    var ctx = c.getContext('2d');
    if (!ctx) return;

    var w = 0;
    var h = 0;
    var particles: Array<{
      x: number; y: number; vx: number; vy: number;
      r: number; color: { r: number; g: number; b: number };
    }> = [];
    var NUM = 45;
    var MAX_DIST = 160;
    var mouse = { x: -999, y: -999 };
    var rafId = 0;

    var COLORS = [
      { r: 249, g: 115, b: 22 },
      { r: 34, g: 197, b: 94 },
      { r: 59, g: 130, b: 246 },
      { r: 6, g: 182, b: 212 },
    ];

    function resize() {
      w = c!.width = window.innerWidth;
      h = c!.height = window.innerHeight;
    }

    function initParticles() {
      particles = [];
      for (var i = 0; i < NUM; i++) {
        var col = COLORS[Math.floor(Math.random() * COLORS.length)];
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.25,
          r: 1 + Math.random() * 2,
          color: col,
        });
      }
    }

    function onMouseMove(e: MouseEvent) { mouse.x = e.clientX; mouse.y = e.clientY; }
    function onMouseLeave() { mouse.x = -999; mouse.y = -999; }

    resize();
    initParticles();
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseleave', onMouseLeave);

    function draw() {
      ctx!.clearRect(0, 0, w, h);

      for (var i = 0; i < NUM; i++) {
        for (var j = i + 1; j < NUM; j++) {
          var dx = particles[i].x - particles[j].x;
          var dy = particles[i].y - particles[j].y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < MAX_DIST) {
            var alpha = (1 - dist / MAX_DIST) * 0.07;
            ctx!.beginPath();
            ctx!.moveTo(particles[i].x, particles[i].y);
            ctx!.lineTo(particles[j].x, particles[j].y);
            var sc = particles[i].color;
            ctx!.strokeStyle = 'rgba(' + sc.r + ',' + sc.g + ',' + sc.b + ',' + alpha + ')';
            ctx!.lineWidth = 0.6;
            ctx!.stroke();
          }
        }

        var dxM = particles[i].x - mouse.x;
        var dyM = particles[i].y - mouse.y;
        var distM = Math.sqrt(dxM * dxM + dyM * dyM);
        if (distM < 200) {
          var alphaM = (1 - distM / 200) * 0.12;
          ctx!.beginPath();
          ctx!.moveTo(particles[i].x, particles[i].y);
          ctx!.lineTo(mouse.x, mouse.y);
          ctx!.strokeStyle = 'rgba(249,115,22,' + alphaM + ')';
          ctx!.lineWidth = 0.8;
          ctx!.stroke();
        }
      }

      for (var k = 0; k < NUM; k++) {
        var p = particles[k];
        var col = p.color;

        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2);
        ctx!.fillStyle = 'rgba(' + col.r + ',' + col.g + ',' + col.b + ',0.04)';
        ctx!.fill();

        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fillStyle = 'rgba(' + col.r + ',' + col.g + ',' + col.b + ',0.25)';
        ctx!.fill();

        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;

        var speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (speed > 0.6) { p.vx *= 0.98; p.vy *= 0.98; }
      }

      rafId = requestAnimationFrame(draw);
    }

    rafId = requestAnimationFrame(draw);

    return function () {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseleave', onMouseLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0" />;
}

// ═══════ Main Component ═══════
export function BackgroundEffects() {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      {/* Grid */}
      <div className="absolute inset-0 linear-grid" />

      {/* Orbs */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-orange-500/[0.08] blur-[120px] rounded-full"
        style={{ animation: 'orbFloat 14s ease-in-out infinite' }}
      />
      <div
        className="absolute bottom-[10%] right-[15%] w-[400px] h-[300px] bg-orange-500/[0.04] blur-[100px] rounded-full"
        style={{ animation: 'orbFloat 18s ease-in-out infinite 5s' }}
      />
      <div
        className="absolute top-[40%] left-[5%] w-[300px] h-[250px] bg-emerald-500/[0.03] blur-[90px] rounded-full"
        style={{ animation: 'orbFloat 16s ease-in-out infinite 8s' }}
      />

      {/* Background chart lines */}
      <svg className="absolute bottom-[5%] left-[2%] w-[45%] h-[50%] opacity-[0.04]" viewBox="0 0 500 250" preserveAspectRatio="none">
        <path d="M0,230 C20,228 40,225 60,220 S100,210 130,200 S170,195 200,180 S240,170 270,155 S310,160 340,140 S370,120 400,100 S430,90 460,70 S480,55 500,35"
          fill="none" stroke="#F97316" strokeWidth="2" className="bg-chart-line" />
        <path d="M0,230 C20,228 40,225 60,220 S100,210 130,200 S170,195 200,180 S240,170 270,155 S310,160 340,140 S370,120 400,100 S430,90 460,70 S480,55 500,35 L500,250 L0,250Z"
          fill="url(#bgGrad1)" />
        <defs>
          <linearGradient id="bgGrad1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F97316" stopOpacity=".15" />
            <stop offset="100%" stopColor="#F97316" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      <svg className="absolute top-[15%] right-[3%] w-[40%] h-[40%] opacity-[0.03]" viewBox="0 0 500 250" preserveAspectRatio="none">
        <path d="M0,180 C30,170 50,190 80,175 S120,150 150,165 S190,140 220,130 S260,145 290,120 S320,100 350,115 S390,85 420,70 S450,80 480,50 S495,40 500,30"
          fill="none" stroke="#22C55E" strokeWidth="1.5" className="bg-chart-line" style={{ animationDelay: '2s' }} />
        <path d="M0,180 C30,170 50,190 80,175 S120,150 150,165 S190,140 220,130 S260,145 290,120 S320,100 350,115 S390,85 420,70 S450,80 480,50 S495,40 500,30 L500,250 L0,250Z"
          fill="url(#bgGrad2)" />
        <defs>
          <linearGradient id="bgGrad2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22C55E" stopOpacity=".1" />
            <stop offset="100%" stopColor="#22C55E" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      {/* Candlestick bars scattered */}
      <svg className="absolute bottom-0 left-0 w-full h-[35%] opacity-[0.025]" viewBox="0 0 1200 200" preserveAspectRatio="none">
        <g stroke="#F97316" fill="none" strokeWidth="1.2">
          <line x1="60" y1="40" x2="60" y2="170" /><rect x="52" y="65" width="16" height="50" fill="#F97316" opacity=".2" rx="1" />
          <line x1="150" y1="30" x2="150" y2="155" /><rect x="142" y="50" width="16" height="55" fill="#F97316" opacity=".2" rx="1" />
          <line x1="330" y1="20" x2="330" y2="140" /><rect x="322" y="40" width="16" height="60" fill="#F97316" opacity=".25" rx="1" />
          <line x1="510" y1="25" x2="510" y2="150" /><rect x="502" y="45" width="16" height="55" fill="#F97316" opacity=".2" rx="1" />
          <line x1="780" y1="15" x2="780" y2="135" /><rect x="772" y="35" width="16" height="60" fill="#F97316" opacity=".25" rx="1" />
          <line x1="960" y1="20" x2="960" y2="130" /><rect x="952" y="40" width="16" height="50" fill="#F97316" opacity=".2" rx="1" />
          <line x1="1140" y1="10" x2="1140" y2="120" /><rect x="1132" y="25" width="16" height="60" fill="#F97316" opacity=".25" rx="1" />
        </g>
        <g stroke="#EF4444" fill="none" strokeWidth="1.2" opacity=".6">
          <line x1="600" y1="50" x2="600" y2="170" /><rect x="592" y="85" width="16" height="45" fill="#EF4444" opacity=".15" rx="1" />
          <line x1="870" y1="65" x2="870" y2="175" /><rect x="862" y="90" width="16" height="40" fill="#EF4444" opacity=".15" rx="1" />
        </g>
        <line x1="0" y1="60" x2="1200" y2="60" stroke="#F97316" strokeWidth=".5" opacity=".15" strokeDasharray="8 6" />
        <line x1="0" y1="130" x2="1200" y2="130" stroke="#F97316" strokeWidth=".5" opacity=".1" strokeDasharray="8 6" />
      </svg>

      {/* Particle network */}
      <ParticleCanvas />

      {/* Matrix rain */}
      <div className="matrix-rain font-mono">
        <span className="matrix-col mc1">38.42 +1.2 27.15 58.90 142.30</span>
        <span className="matrix-col mc2">R$539 +3.2k 12.1% DY 8.5</span>
        <span className="matrix-col mc3">PETR4 BBAS3 VALE3 ITUB4</span>
        <span className="matrix-col mc4">+6.3% 14.25 CDI 132k IBOV</span>
        <span className="matrix-col mc5">R$1.937 +114k 271% META</span>
        <span className="matrix-col mc6">45% 30% 15% 10% FII RF</span>
        <span className="matrix-col mc7">DY 8.2 11.5 14.3 6.5 10.8</span>
        <span className="matrix-col mc8">+328k +84k P&L +412k RENDA</span>
        <span className="matrix-col mc9">SELIC 14.25 CDI 13.65 IPCA</span>
        <span className="matrix-col mc10">R$873k R$581k R$290k R$193k</span>
        <span className="matrix-col mc11">BUY HOLD SELL CC PUT CALL</span>
        <span className="matrix-col mc12">21.600 13.800 11.500 3.600</span>
      </div>
    </div>
  );
}
