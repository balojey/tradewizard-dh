"use client";

import React, { useEffect, useState } from "react";

interface PerformanceMetrics {
  renderTime: number;
  scrollFPS: number;
  memoryUsage: number;
  networkRequests: number;
}

const PerformanceMonitor = React.memo(function PerformanceMonitor() {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    renderTime: 0,
    scrollFPS: 0,
    memoryUsage: 0,
    networkRequests: 0,
  });

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    let frameCount = 0;
    let lastTime = performance.now();
    let animationId: number;

    const measureFPS = () => {
      frameCount++;
      const currentTime = performance.now();
      
      if (currentTime - lastTime >= 1000) {
        const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
        
        setMetrics(prev => ({
          ...prev,
          scrollFPS: fps,
          memoryUsage: (performance as any).memory?.usedJSHeapSize / 1024 / 1024 || 0,
        }));
        
        frameCount = 0;
        lastTime = currentTime;
      }
      
      animationId = requestAnimationFrame(measureFPS);
    };

    // Start FPS monitoring
    animationId = requestAnimationFrame(measureFPS);

    // Monitor network requests
    const originalFetch = window.fetch;
    let requestCount = 0;
    
    window.fetch = (...args) => {
      requestCount++;
      setMetrics(prev => ({ ...prev, networkRequests: requestCount }));
      return originalFetch(...args);
    };

    // Measure initial render time
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry) => {
        if (entry.entryType === 'measure' && entry.name === 'React') {
          setMetrics(prev => ({ ...prev, renderTime: entry.duration }));
        }
      });
    });
    
    observer.observe({ entryTypes: ['measure'] });

    return () => {
      cancelAnimationFrame(animationId);
      window.fetch = originalFetch;
      observer.disconnect();
    };
  }, []);

  if (process.env.NODE_ENV !== 'development') return null;

  return (
    <div className="fixed bottom-4 right-4 bg-black/80 text-white p-3 rounded-lg text-xs font-mono z-50 backdrop-blur-sm">
      <div className="space-y-1">
        <div>FPS: <span className={metrics.scrollFPS < 30 ? 'text-red-400' : 'text-green-400'}>{metrics.scrollFPS}</span></div>
        <div>Memory: <span className={metrics.memoryUsage > 100 ? 'text-yellow-400' : 'text-green-400'}>{metrics.memoryUsage.toFixed(1)}MB</span></div>
        <div>Requests: <span className={metrics.networkRequests > 50 ? 'text-red-400' : 'text-green-400'}>{metrics.networkRequests}</span></div>
        <div>Render: <span className={metrics.renderTime > 16 ? 'text-yellow-400' : 'text-green-400'}>{metrics.renderTime.toFixed(1)}ms</span></div>
      </div>
    </div>
  );
});

export default PerformanceMonitor;