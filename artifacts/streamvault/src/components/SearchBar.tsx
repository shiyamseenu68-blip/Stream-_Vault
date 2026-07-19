import { useState, useEffect, useRef } from 'react';
import { Clipboard, X, Play, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SearchBarProps {
  onAnalyze: (url: string) => void;
  isLoading: boolean;
  detectedType?: 'video' | 'playlist' | 'short' | null;
}

export default function SearchBar({ onAnalyze, isLoading, detectedType }: SearchBarProps) {
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onAnalyze(url.trim());
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
      if (text.trim()) {
        onAnalyze(text.trim());
      }
    } catch (err) {
      console.error('Failed to read clipboard', err);
    }
  };

  const handleClear = () => {
    setUrl('');
    inputRef.current?.focus();
  };

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col items-center">
      <motion.form
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        onSubmit={handleSubmit}
        className="w-full relative group"
      >
        <div className="absolute -inset-1 bg-gradient-to-r from-primary/0 via-primary/20 to-primary/0 rounded-2xl blur-lg opacity-0 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
        <div className="relative glassmorphism rounded-2xl flex items-center p-2 focus-within:ring-2 focus-within:ring-primary/50 transition-shadow">
          <input
            ref={inputRef}
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste YouTube Video or Playlist URL"
            className="flex-1 bg-transparent border-none text-white px-4 py-3 outline-none text-lg placeholder:text-white/40"
            disabled={isLoading}
          />
          
          <div className="flex items-center gap-2 pr-2">
            <AnimatePresence>
              {url ? (
                <motion.button
                  key="clear"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  type="button"
                  onClick={handleClear}
                  className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
                  aria-label="Clear input"
                >
                  <X size={20} />
                </motion.button>
              ) : (
                <motion.button
                  key="paste"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  type="button"
                  onClick={handlePaste}
                  className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-xl transition-colors flex items-center gap-2"
                  aria-label="Paste from clipboard"
                >
                  <Clipboard size={20} />
                </motion.button>
              )}
            </AnimatePresence>
            
            <button
              type="submit"
              disabled={isLoading || !url.trim()}
              className="bg-primary text-white h-12 px-6 rounded-xl font-medium flex items-center gap-2 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
            >
              {isLoading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <Play size={20} fill="currentColor" />
              )}
              <span className="hidden sm:inline">{isLoading ? 'Analyzing...' : 'Analyze'}</span>
            </button>
          </div>
        </div>
      </motion.form>

      <AnimatePresence>
        {detectedType && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-4 flex items-center justify-center"
          >
            <span className="px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase bg-white/10 text-white/70 border border-white/10">
              {detectedType === 'short' ? 'YouTube Short' : 
               detectedType === 'playlist' ? 'YouTube Playlist' : 'YouTube Video'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
